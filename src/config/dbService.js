import { db, auth, firebaseConfig } from "./firebase";
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginAttempts,
  sanitizeInput,
  validateFieldSize
} from "./security";
import { initializeApp } from "firebase/app";
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc,
  query, 
  where,
  orderBy,
  runTransaction,
  writeBatch
} from "firebase/firestore";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  getAuth
} from "firebase/auth";

// Helper to check if Firebase is connected / ready (runs check on firestore)
export let useLocalFallback = localStorage.getItem("workshop_use_local_fallback") === "true";

// Clear legacy mock seed data from LocalStorage if present (one-time cleanup)
const cleanLegacySeedData = () => {
  // Remove mock vehicles seeded in older versions
  const localV = localStorage.getItem("workshop_vehicles");
  if (localV && (localV.includes("V-1001") || localV.includes("V-1002"))) {
    localStorage.removeItem("workshop_vehicles");
  }
  // Remove mock users seeded in older versions
  const localU = localStorage.getItem("workshop_users");
  if (localU && localU.includes("admin@workshop.com")) {
    localStorage.removeItem("workshop_users");
  }
  // Remove mock inventory seeded in older versions
  const localI = localStorage.getItem("workshop_inventory");
  if (localI && (localI.includes("BAL-902") || localI.includes("FIL-102"))) {
    localStorage.removeItem("workshop_inventory");
  }
  // Remove mock outgoings seeded in older versions
  const localO = localStorage.getItem("workshop_outgoings");
  if (localO && localO.includes("out1")) {
    localStorage.removeItem("workshop_outgoings");
  }
};
cleanLegacySeedData();

export const checkFirebaseStatus = async () => {
  try {
    const q = query(collection(db, "_status_check"));
    await getDocs(q);
    useLocalFallback = false;
    localStorage.removeItem("workshop_use_local_fallback");
    return true;
  } catch (error) {
    console.warn("Firebase query failed, temporary fallback active:", error.message);
    useLocalFallback = false; // keep trying Firestore on actual queries
    return true;
  }
};

export const resetFirebaseConnection = () => {
  localStorage.removeItem("workshop_use_local_fallback");
  useLocalFallback = false;
  window.location.reload();
};

// --- AUTHENTICATION SERVICES ---

export const loginUser = async (email, password) => {
  // ── Seguridad: Verificar rate limit antes de cualquier intento ──
  const rateCheck = checkLoginRateLimit();
  if (rateCheck.blocked) {
    throw new Error(`RATE_LIMITED:${rateCheck.remainingMs}`);
  }

  // ── Seguridad: Sanitizar y validar inputs ──
  const cleanEmail    = sanitizeInput(email,    'email');
  const cleanPassword = sanitizeInput(password, 'password');

  const emailSizeCheck = validateFieldSize(cleanEmail, 'email');
  if (!emailSizeCheck.valid) throw new Error(emailSizeCheck.reason);

  const passSizeCheck = validateFieldSize(cleanPassword, 'password');
  if (!passSizeCheck.valid) throw new Error(passSizeCheck.reason);

  if (!cleanEmail || !cleanPassword) {
    throw new Error('Correo y contraseña son requeridos.');
  }

  // Modo fallback local (sin conexión)
  if (useLocalFallback) {
    const localUsers = JSON.parse(localStorage.getItem("workshop_users") || "[]");
    const matched = localUsers.find(u => u.email === cleanEmail && u.password === cleanPassword);
    if (matched) {
      if (!matched.active) throw new Error("Usuario desactivado.");
      clearLoginAttempts();
      return matched;
    }
    // Registrar intento fallido
    recordFailedLoginAttempt(cleanEmail);
    throw new Error("Credenciales incorrectas.");
  }

  // ── Autenticación con Firebase Auth ──
  try {
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
    const firebaseUser = userCredential.user;

    // Fetch role desde Firestore
    try {
      const userDoc = await getDocs(query(collection(db, "users"), where("uid", "==", firebaseUser.uid)));
      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        if (!userData.active) {
          throw new Error("Usuario desactivado. Contacte al administrador.");
        }
        clearLoginAttempts();
        return { uid: firebaseUser.uid, email: firebaseUser.email, ...userData };
      }
    } catch (e) {
      if (e.message.includes('desactivado')) throw e;
      // Si no pudo leer el rol, continuar con perfil mínimo
    }

    // Revisar en localStorage como respaldo de rol
    const localUsers = JSON.parse(localStorage.getItem("workshop_users") || "[]");
    const matchingLocal = localUsers.find(u => u.email === cleanEmail);
    if (matchingLocal) {
      clearLoginAttempts();
      return { uid: firebaseUser.uid, ...matchingLocal };
    }

    clearLoginAttempts();
    return { uid: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.email.split('@')[0], role: "tecnico", active: true };

  } catch (error) {
    // Si es un error de credenciales inválidas de Firebase
    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' ||
        error.code === 'auth/invalid-credential') {
      const result = recordFailedLoginAttempt(cleanEmail);
      if (result.locked) {
        const rateCheck2 = checkLoginRateLimit();
        throw new Error(`RATE_LIMITED:${rateCheck2.remainingMs}`);
      }
      throw new Error(`Credenciales incorrectas. Intentos restantes: ${result.attemptsLeft}.`);
    }

    // Error de red / Firebase offline → intentar con localStorage
    if (error.code && error.code.startsWith('auth/network')) {
      useLocalFallback = true;
      const localUsers = JSON.parse(localStorage.getItem("workshop_users") || "[]");
      const matched = localUsers.find(u => u.email === cleanEmail && u.password === cleanPassword);
      if (matched) {
        if (!matched.active) throw new Error("Usuario desactivado.");
        clearLoginAttempts();
        return matched;
      }
      recordFailedLoginAttempt(cleanEmail);
      throw new Error("Credenciales incorrectas.");
    }

    // Re-lanzar cualquier otro error (desactivado, etc.)
    throw error;
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};

// --- USER MANAGEMENT ---

export const getUsersList = async () => {
  if (useLocalFallback) {
    return JSON.parse(localStorage.getItem("workshop_users") || "[]");
  }
  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    const users = [];
    querySnapshot.forEach((doc) => {
      users.push({ id: doc.id, ...doc.data() });
    });
    // Si Firestore está vacío, retornar lista vacía (sin datos semilla)
    return users;
  } catch (e) {
    useLocalFallback = true;
    return getUsersList();
  }
};

export const createNewUser = async (name, email, password, role) => {
  if (useLocalFallback) {
    console.log("💾 [DB SERVICE] Guardando usuario localmente en LocalStorage...", { name, email, role });
    const localUsers = JSON.parse(localStorage.getItem("workshop_users") || "[]");
    if (email && localUsers.find(u => u.email === email)) {
      throw new Error("El correo ya está registrado.");
    }
    const newUser = { uid: "local_" + Date.now(), email: email || null, name, role, password: password || null, active: true };
    localUsers.push(newUser);
    localStorage.setItem("workshop_users", JSON.stringify(localUsers));
    console.log("💾 [DB SERVICE] Usuario guardado localmente con éxito:", newUser);
    return newUser;
  }

  // Si es técnico (sin email/password), solo guardarlo en Firestore sin crear cuenta Auth
  if (!email) {
    try {
      console.log("☁️ [DB SERVICE] Registrando técnico sin cuenta Auth en Firestore...", { name, role });
      const uid = "tecnico_" + Date.now();
      const newUser = { uid, email: null, name, role, active: true };
      await setDoc(doc(db, "users", uid), newUser);
      console.log("☁️ [DB SERVICE] Técnico registrado con éxito en Firestore:", newUser);
      return newUser;
    } catch (e) {
      console.error("❌ [DB SERVICE] Error al registrar técnico en Firestore:", e.message);
      useLocalFallback = true;
      localStorage.setItem("workshop_use_local_fallback", "true");
      return createNewUser(name, null, null, role);
    }
  }
  
  try {
    console.log("☁️ [DB SERVICE] Intentando registrar usuario en Firebase Auth y Firestore...", { name, email, role });
    // 1. Crear en Firebase Auth utilizando una app secundaria para no cerrar la sesión del admin activo
    const { deleteApp } = await import("firebase/app");
    let secondaryApp;
    let firebaseUser;
    
    try {
      secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      firebaseUser = userCredential.user;
    } catch (authErr) {
      if (secondaryApp) await deleteApp(secondaryApp).catch(() => {});
      throw authErr;
    }
    
    // 2. Guardar el rol y los detalles en Firestore
    const newUser = { uid: firebaseUser.uid, email, name, role, active: true };
    await setDoc(doc(db, "users", firebaseUser.uid), newUser);
    
    // Limpiar la app secundaria
    await deleteApp(secondaryApp).catch(() => {});
    
    console.log("☁️ [DB SERVICE] Usuario creado con éxito en Firebase Nube:", newUser);
    return newUser;
  } catch (e) {
    console.error("❌ [DB SERVICE] Falló el registro en Firebase Cloud:", e.message);
    console.warn("⚠️ [DB SERVICE] Activando Modo Demo Local persistente y reintentando...");
    useLocalFallback = true;
    localStorage.setItem("workshop_use_local_fallback", "true"); // Persistir estado local en disco
    return createNewUser(name, email, password, role);
  }
};

export const toggleUserActiveStatus = async (uid, currentStatus) => {
  if (useLocalFallback) {
    const localUsers = JSON.parse(localStorage.getItem("workshop_users") || "[]");
    const updated = localUsers.map(u => u.uid === uid ? { ...u, active: !currentStatus } : u);
    localStorage.setItem("workshop_users", JSON.stringify(updated));
    return;
  }
  try {
    await updateDoc(doc(db, "users", uid), { active: !currentStatus });
  } catch (e) {
    console.error("Firestore user update error:", e);
    const localUsers = JSON.parse(localStorage.getItem("workshop_users") || "[]");
    const updated = localUsers.map(u => u.uid === uid ? { ...u, active: !currentStatus } : u);
    localStorage.setItem("workshop_users", JSON.stringify(updated));
  }
};


// --- INVENTORY SERVICES ---

export const getInventoryList = async () => {
  if (useLocalFallback) {
    return JSON.parse(localStorage.getItem("workshop_inventory") || "[]");
  }
  try {
    const querySnapshot = await getDocs(collection(db, "inventory"));
    const items = [];
    querySnapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() });
    });
    return items;
  } catch (e) {
    console.error("Firestore getInventoryList error:", e);
    useLocalFallback = true;
    return getInventoryList();
  }
};

export const saveInventoryItem = async (item) => {
  if (useLocalFallback) {
    const items = JSON.parse(localStorage.getItem("workshop_inventory") || "[]");
    if (item.id) {
      // Edit
      const index = items.findIndex(i => i.id === item.id);
      if (index !== -1) {
        items[index] = { ...items[index], ...item };
        localStorage.setItem("workshop_inventory", JSON.stringify(items));
      }
    } else {
      // New
      const newItem = { ...item, id: "inv_" + Date.now() };
      items.push(newItem);
      localStorage.setItem("workshop_inventory", JSON.stringify(items));
    }
    return;
  }
  try {
    if (item.id) {
      await updateDoc(doc(db, "inventory", item.id), item);
    } else {
      const docRef = await addDoc(collection(db, "inventory"), item);
      await updateDoc(docRef, { id: docRef.id });
    }
  } catch (e) {
    console.error("Firestore saveInventoryItem error:", e);
    useLocalFallback = true;
    await saveInventoryItem(item);
  }
};

export const removeInventoryItem = async (id) => {
  if (useLocalFallback) {
    const items = JSON.parse(localStorage.getItem("workshop_inventory") || "[]");
    const filtered = items.filter(i => i.id !== id);
    localStorage.setItem("workshop_inventory", JSON.stringify(filtered));
    return;
  }
  try {
    await deleteDoc(doc(db, "inventory", id));
  } catch (e) {
    console.error("Firestore removeInventoryItem error:", e);
    useLocalFallback = true;
    await removeInventoryItem(id);
  }
};


// --- VEHICLES SERVICES ---

export const getVehiclesList = async () => {
  try {
    const snapshot = await getDocs(collection(db, "vehicles"));
    useLocalFallback = false;
    const list = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));

    // Fetch photos and heavy docs from separate collections in parallel
    try {
      const [photosSnap, docsSnap] = await Promise.all([
        getDocs(collection(db, "vehicle_photos")),
        getDocs(collection(db, "vehicle_docs"))
      ]);

      const photosMap = {};
      photosSnap.forEach(d => {
        const data = d.data();
        if (data.vehicleFolio && data.url) {
          if (!photosMap[data.vehicleFolio]) photosMap[data.vehicleFolio] = [];
          photosMap[data.vehicleFolio].push({ index: data.index ?? 0, url: data.url });
        }
      });

      const docsMap = {};
      docsSnap.forEach(d => {
        const data = d.data();
        if (data.vehicleFolio && data.type && data.url) {
          if (!docsMap[data.vehicleFolio]) docsMap[data.vehicleFolio] = {};
          docsMap[data.vehicleFolio][data.type] = data.url;
        }
      });

      list.forEach(v => {
        if (photosMap[v.folio] && photosMap[v.folio].length > 0) {
          photosMap[v.folio].sort((a, b) => a.index - b.index);
          v.imageUrls = photosMap[v.folio].map(p => p.url);
        }
        if (docsMap[v.folio]) {
          if (docsMap[v.folio].admissionPass) v.admissionPassUrl = docsMap[v.folio].admissionPass;
          if (docsMap[v.folio].inventoryDoc) v.inventoryDocUrl = docsMap[v.folio].inventoryDoc;
        }
      });
    } catch (extraErr) {
      console.warn("Extra docs/photos fetch error:", extraErr);
    }

    return list;
  } catch (e) {
    console.error("Firestore getVehiclesList error:", e);
    const local = JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
    return local.filter(v => v.folio !== "V-1001" && v.folio !== "V-1002" && v.folio !== "V-1003");
  }
};

export const saveVehicle = async (vehicle) => {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
    const index = list.findIndex(v => v.folio === vehicle.folio);
    if (index !== -1) {
      // Edit — merge fields
      list[index] = { ...list[index], ...vehicle };
    } else {
      // New — apply defaults for new fields
      list.push({
        orderNumber: '',
        model: '',
        imageUrls: [],
        admissionPassUrl: '',
        inventoryDocUrl: '',
        bodyworkStatus: 'pendiente',
        mechanicsStatus: 'pendiente',
        orderedParts: [],
        deliveredAt: null,
        ...vehicle,
        active: true,
        entryDate: vehicle.entryDate || new Date().toISOString()
      });
    }
    localStorage.setItem("workshop_vehicles", JSON.stringify(list));
    return;
  }
  try {
    const { imageUrls = [], admissionPassUrl = '', inventoryDocUrl = '', ...metaData } = vehicle;

    // Main document stores text metadata + primary photo thumbnail (size < 60 KB)
    const mainDocPayload = {
      orderNumber: '',
      model: '',
      bodyworkStatus: 'pendiente',
      mechanicsStatus: 'pendiente',
      orderedParts: [],
      deliveredAt: null,
      color: '',
      insurance: '',
      details: '',
      ...metaData,
      primaryPhoto: imageUrls.length > 0 ? imageUrls[0] : '',
      imageUrls: imageUrls.length <= 2 ? imageUrls : imageUrls.slice(0, 2),
      admissionPassUrl: (admissionPassUrl.length < 150000) ? admissionPassUrl : '',
      inventoryDocUrl: (inventoryDocUrl.length < 150000) ? inventoryDocUrl : '',
      active: metaData.active ?? true,
      entryDate: metaData.entryDate || new Date().toISOString()
    };

    // 1. Save main vehicle doc (stays lightweight < 60 KB)
    await setDoc(doc(db, "vehicles", vehicle.folio), mainDocPayload, { merge: true });

    // 2. Save ALL photos in separate vehicle_photos collection (~25 KB per doc)
    if (imageUrls.length > 0) {
      const photoPromises = imageUrls.map((url, i) =>
        setDoc(doc(db, "vehicle_photos", `${vehicle.folio}_p_${i}`), {
          vehicleFolio: vehicle.folio,
          url,
          index: i
        })
      );
      await Promise.all(photoPromises);
    }

    // 3. Save heavy admission pass & inventory docs in separate vehicle_docs collection
    if (admissionPassUrl) {
      await setDoc(doc(db, "vehicle_docs", `${vehicle.folio}_admission`), {
        vehicleFolio: vehicle.folio,
        type: 'admissionPass',
        url: admissionPassUrl
      });
    }
    if (inventoryDocUrl) {
      await setDoc(doc(db, "vehicle_docs", `${vehicle.folio}_inventory`), {
        vehicleFolio: vehicle.folio,
        type: 'inventoryDoc',
        url: inventoryDocUrl
      });
    }
  } catch (e) {
    console.error("Firestore saveVehicle error:", e);
    if (e.message && (e.message.includes("exceeds the maximum allowed size") || e.message.includes("supera el límite"))) {
      throw e;
    }
    useLocalFallback = true;
    await saveVehicle(vehicle);
  }
};

export const toggleVehicleStatus = async (folio, currentStatus) => {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
    const updated = list.map(v => v.folio === folio ? { ...v, active: !currentStatus } : v);
    localStorage.setItem("workshop_vehicles", JSON.stringify(updated));
    return;
  }
  try {
    await updateDoc(doc(db, "vehicles", folio), { active: !currentStatus });
  } catch (e) {
    console.error("Firestore toggleVehicleStatus error:", e);
    useLocalFallback = true;
    await toggleVehicleStatus(folio, currentStatus);
  }
};


// --- OUTGOINGS / TRANSACTION SERVICES ---

export const getOutgoingsList = async () => {
  if (useLocalFallback) {
    return JSON.parse(localStorage.getItem("workshop_outgoings") || "[]");
  }
  try {
    const querySnapshot = await getDocs(collection(db, "outgoings"));
    const list = [];
    querySnapshot.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() });
    });
    return list.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending
  } catch (e) {
    console.error("Firestore getOutgoingsList error:", e);
    useLocalFallback = true;
    return getOutgoingsList();
  }
};

export const registerOutgoing = async (outgoing) => {
  const deductAmount = parseFloat(outgoing.stockDeducted !== undefined ? outgoing.stockDeducted : outgoing.quantity) || 0;
  
  // Validate stock before recording
  if (useLocalFallback) {
    const items = JSON.parse(localStorage.getItem("workshop_inventory") || "[]");
    const outgoings = JSON.parse(localStorage.getItem("workshop_outgoings") || "[]");
    
    const matIndex = items.findIndex(i => i.id === outgoing.materialId);
    if (matIndex === -1) throw new Error("Material no encontrado.");
    
    const currentStock = parseFloat(items[matIndex].quantity) || 0;
    if (currentStock < deductAmount) {
      throw new Error(`Stock insuficiente. Solo quedan ${currentStock} en existencia.`);
    }
    
    // Deduct stock with precision handling
    const newQty = Math.round((currentStock - deductAmount) * 1000) / 1000;
    items[matIndex].quantity = newQty;
    localStorage.setItem("workshop_inventory", JSON.stringify(items));
    
    // Register outgoing
    const newOutgoing = {
      ...outgoing,
      quantity: parseFloat(outgoing.quantity) || 0,
      stockDeducted: deductAmount,
      id: "out_" + Date.now(),
      date: outgoing.date || new Date().toISOString()
    };
    outgoings.push(newOutgoing);
    localStorage.setItem("workshop_outgoings", JSON.stringify(outgoings));
    return newOutgoing;
  }
  
  try {
    // Perform Firestore Transaction to ensure consistency and avoid race conditions
    const inventoryRef = doc(db, "inventory", outgoing.materialId);
    const outgoingId = "out_" + Date.now();
    const outgoingRef = doc(db, "outgoings", outgoingId);
    
    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(inventoryRef);
      if (!sfDoc.exists()) {
        throw new Error("El material seleccionado no existe en el inventario.");
      }
      
      const currentStock = parseFloat(sfDoc.data().quantity) || 0;
      const newQty = Math.round((currentStock - deductAmount) * 1000) / 1000;
      if (newQty < 0) {
        throw new Error(`Stock insuficiente. Solo quedan ${currentStock} en existencia.`);
      }
      
      // Update inventory stock
      transaction.update(inventoryRef, { quantity: newQty });
      
      // Add outgoing document
      transaction.set(outgoingRef, {
        ...outgoing,
        quantity: parseFloat(outgoing.quantity) || 0,
        stockDeducted: deductAmount,
        id: outgoingId,
        date: outgoing.date || new Date().toISOString()
      });
    });
    
    return { id: outgoingId, ...outgoing, stockDeducted: deductAmount };
  } catch (e) {
    console.error("Transaction failed: ", e);
    // If it's a firebase error and we didn't fall back yet
    if (e.message.includes("permission-denied") || e.message.includes("offline")) {
      useLocalFallback = true;
      return registerOutgoing(outgoing);
    }
    throw e;
  }
};


// --- VEHICLE UPDATES / BITÁCORA DIARIA ---

export const getVehicleUpdates = async (vehicleFolio) => {
  if (useLocalFallback) {
    const all = JSON.parse(localStorage.getItem("workshop_vehicle_updates") || "[]");
    return all
      .filter(u => u.vehicleFolio === vehicleFolio)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  try {
    const q = query(
      collection(db, "vehicle_updates"),
      where("vehicleFolio", "==", vehicleFolio)
    );
    const snapshot = await getDocs(q);
    const list = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    console.error("Firestore getVehicleUpdates error:", e);
    useLocalFallback = true;
    return getVehicleUpdates(vehicleFolio);
  }
};

export const saveVehicleUpdate = async (update) => {
  if (useLocalFallback) {
    const all = JSON.parse(localStorage.getItem("workshop_vehicle_updates") || "[]");
    const newUpdate = {
      ...update,
      id: "upd_" + Date.now(),
      createdAt: new Date().toISOString()
    };
    all.push(newUpdate);
    localStorage.setItem("workshop_vehicle_updates", JSON.stringify(all));
    return newUpdate;
  }
  try {
    const id = "upd_" + Date.now();
    const ref = doc(db, "vehicle_updates", id);
    const newUpdate = { ...update, id, createdAt: new Date().toISOString() };
    await setDoc(ref, newUpdate);
    return newUpdate;
  } catch (e) {
    console.error("Firestore saveVehicleUpdate error:", e);
    useLocalFallback = true;
    return saveVehicleUpdate(update);
  }
};

export const updateVehicleUpdate = async (id, fields) => {
  if (useLocalFallback) {
    const all = JSON.parse(localStorage.getItem("workshop_vehicle_updates") || "[]");
    const idx = all.findIndex(u => u.id === id);
    if (idx !== -1) all[idx] = { ...all[idx], ...fields };
    localStorage.setItem("workshop_vehicle_updates", JSON.stringify(all));
    return;
  }
  try {
    await updateDoc(doc(db, "vehicle_updates", id), fields);
    // Mirror in localStorage
    const all = JSON.parse(localStorage.getItem("workshop_vehicle_updates") || "[]");
    const idx = all.findIndex(u => u.id === id);
    if (idx !== -1) all[idx] = { ...all[idx], ...fields };
    localStorage.setItem("workshop_vehicle_updates", JSON.stringify(all));
  } catch (e) {
    console.error("Firestore updateVehicleUpdate error:", e);
    useLocalFallback = true;
    return updateVehicleUpdate(id, fields);
  }
};

export const saveOrderedPart = async (folio, part) => {
  // Load the vehicle, update the orderedParts array, and save back
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
    const index = list.findIndex(v => v.folio === folio);
    if (index === -1) throw new Error("Vehículo no encontrado.");
    
    const parts = list[index].orderedParts || [];
    if (part.id) {
      // Update existing
      const pi = parts.findIndex(p => p.id === part.id);
      if (pi !== -1) parts[pi] = { ...parts[pi], ...part };
      else parts.push(part);
    } else {
      // New part
      parts.push({ ...part, id: "op_" + Date.now() });
    }
    list[index].orderedParts = parts;
    localStorage.setItem("workshop_vehicles", JSON.stringify(list));
    return;
  }
  try {
    const vehicleRef = doc(db, "vehicles", folio);
    const vehicleSnap = await getDocs(query(collection(db, "vehicles"), where("folio", "==", folio)));
    if (vehicleSnap.empty) throw new Error("Vehículo no encontrado.");
    const vehicleData = vehicleSnap.docs[0].data();
    const parts = vehicleData.orderedParts || [];
    if (part.id) {
      const pi = parts.findIndex(p => p.id === part.id);
      if (pi !== -1) parts[pi] = { ...parts[pi], ...part };
      else parts.push(part);
    } else {
      parts.push({ ...part, id: "op_" + Date.now() });
    }
    await updateDoc(vehicleRef, { orderedParts: parts });
  } catch (e) {
    console.error("Firestore saveOrderedPart error:", e);
    useLocalFallback = true;
    return saveOrderedPart(folio, part);
  }
};


export const deleteVehicleUpdate = async (updateId, folderId = null) => {
  const targetId = updateId || folderId;
  if (!targetId) return;

  if (useLocalFallback) {
    let all = JSON.parse(localStorage.getItem("workshop_vehicle_updates") || "[]");
    all = all.filter(u => u.id !== targetId && u.folderId !== targetId);
    localStorage.setItem("workshop_vehicle_updates", JSON.stringify(all));
    return;
  }
  try {
    await deleteDoc(doc(db, "vehicle_updates", targetId));

    // Also delete any child entries linked to this folder
    try {
      const childQuery = query(collection(db, "vehicle_updates"), where("folderId", "==", targetId));
      const childSnap = await getDocs(childQuery);
      const batch = writeBatch(db);
      let count = 0;
      childSnap.forEach(d => {
        batch.delete(d.ref);
        count++;
      });
      if (count > 0) {
        await batch.commit();
      }
    } catch (err) {
      console.warn("Child entries cleanup note:", err);
    }

    // Mirror deletion in LocalStorage
    let all = JSON.parse(localStorage.getItem("workshop_vehicle_updates") || "[]");
    all = all.filter(u => u.id !== targetId && u.folderId !== targetId);
    localStorage.setItem("workshop_vehicle_updates", JSON.stringify(all));
  } catch (e) {
    console.error("Firestore deleteVehicleUpdate error:", e);
    let all = JSON.parse(localStorage.getItem("workshop_vehicle_updates") || "[]");
    all = all.filter(u => u.id !== targetId && u.folderId !== targetId);
    localStorage.setItem("workshop_vehicle_updates", JSON.stringify(all));
  }
};


// --- CLIENT VEHICLE COMMENTS & SEARCH ---

const defaultVehicleComments = [
  {
    id: "com1",
    vehicleFolio: "V-1001",
    authorName: "Juan Alarcón (Cliente)",
    authorRole: "cliente",
    contact: "555-0192",
    text: "Hola, me gustaría saber si la refacción del radiador ya viene en camino. ¡Gracias!",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "com2",
    vehicleFolio: "V-1001",
    authorName: "Taller Metal Shapers",
    authorRole: "taller",
    contact: "",
    text: "Buenas tardes Sr. Juan, el radiador ya fue pedido con el proveedor y llega mañana por la mañana.",
    createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString()
  }
];

export const searchVehicleForClient = async (searchTerm) => {
  if (!searchTerm || !searchTerm.trim()) return null;
  const cleanSearch = searchTerm.trim().toLowerCase().replace(/[^a-z0-9]/gi, '');
  
  const vehicles = await getVehiclesList();
  const match = vehicles.find(v => {
    const cleanPlate = (v.plate || '').toLowerCase().replace(/[^a-z0-9]/gi, '');
    const cleanOrder = (v.orderNumber || '').toLowerCase().replace(/[^a-z0-9]/gi, '');
    const cleanFolio = (v.folio || '').toLowerCase().replace(/[^a-z0-9]/gi, '');
    
    return (
      (cleanPlate && cleanPlate.includes(cleanSearch)) ||
      (cleanOrder && cleanOrder.includes(cleanSearch)) ||
      (cleanFolio && cleanFolio.includes(cleanSearch))
    );
  });
  
  return match || null;
};

export const getVehicleComments = async (vehicleFolio) => {
  if (!vehicleFolio) return [];
  const local = JSON.parse(localStorage.getItem("workshop_vehicle_comments") || JSON.stringify(defaultVehicleComments));
  const localList = (local || defaultVehicleComments).filter(c => c.vehicleFolio === vehicleFolio || (c.vehicleFolio === "V-1001" && (vehicleFolio === "XYZ-123-A" || vehicleFolio === "ORD-2026-001")));

  if (useLocalFallback) {
    return localList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  try {
    const q = query(
      collection(db, "vehicle_comments"),
      where("vehicleFolio", "==", vehicleFolio)
    );
    const snapshot = await getDocs(q);
    const list = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));

    // Merge Firestore comments with local comments (deduplicated by id)
    const combinedMap = new Map();
    localList.forEach(c => combinedMap.set(c.id, c));
    list.forEach(c => combinedMap.set(c.id, c));

    const result = Array.from(combinedMap.values());
    if (result.length === 0 && (vehicleFolio === "V-1001" || vehicleFolio === "XYZ-123-A")) {
      return defaultVehicleComments.filter(c => c.vehicleFolio === "V-1001");
    }
    return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    console.error("Firestore getVehicleComments error:", e);
    return localList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
};

export const addVehicleComment = async (commentData) => {
  const newComment = {
    id: "com_" + Date.now(),
    createdAt: new Date().toISOString(),
    authorRole: commentData.authorRole || "cliente",
    ...commentData
  };

  if (useLocalFallback) {
    const local = JSON.parse(localStorage.getItem("workshop_vehicle_comments") || JSON.stringify(defaultVehicleComments));
    local.push(newComment);
    localStorage.setItem("workshop_vehicle_comments", JSON.stringify(local));
    return newComment;
  }
  try {
    const ref = doc(db, "vehicle_comments", newComment.id);
    await setDoc(ref, newComment);
    // Mirror in local storage
    const local = JSON.parse(localStorage.getItem("workshop_vehicle_comments") || JSON.stringify(defaultVehicleComments));
    local.push(newComment);
    localStorage.setItem("workshop_vehicle_comments", JSON.stringify(local));
    return newComment;
  } catch (e) {
    console.error("Firestore addVehicleComment error:", e);
    const local = JSON.parse(localStorage.getItem("workshop_vehicle_comments") || JSON.stringify(defaultVehicleComments));
    local.push(newComment);
    localStorage.setItem("workshop_vehicle_comments", JSON.stringify(local));
    return newComment;
  }
};


