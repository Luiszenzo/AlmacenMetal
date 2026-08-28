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
  try {
    const querySnapshot = await getDocs(collection(db, "inventory"));
    const items = [];
    querySnapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() });
    });

    // Merge & sync local cache
    try {
      const local = JSON.parse(localStorage.getItem("workshop_inventory") || "[]");
      const cloudIds = new Set(items.map(i => i.id));
      local.forEach(li => {
        if (li.id && !cloudIds.has(li.id)) items.push(li);
      });
      localStorage.setItem("workshop_inventory", JSON.stringify(items));
    } catch (syncErr) {
      console.warn("Could not sync inventory to local cache:", syncErr);
    }

    return items;
  } catch (e) {
    if (e?.code === 'permission-denied' || (e?.message && e.message.includes('permissions'))) {
      console.warn("Firestore getInventoryList: Permisos restringidos en Firestore nube, usando almacenamiento local.");
    } else {
      console.error("Firestore getInventoryList error:", e);
    }
    useLocalFallback = true;
    return JSON.parse(localStorage.getItem("workshop_inventory") || "[]");
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
    snapshot.forEach(d => list.push({ id: d.id, folio: d.id, ...d.data() }));

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

    // Sync and merge with localStorage cache for fallback operations
    try {
      const localList = JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
      const localMap = new Map(localList.map(lv => [lv.folio, lv]));

      // Merge local parts & fields into cloud list
      list.forEach(v => {
        const lv = localMap.get(v.folio);
        if (lv) {
          const deletedIds = new Set(lv.deletedPartIds || []);
          const cloudParts = (v.orderedParts || []).filter(p => !deletedIds.has(p.id));

          if (lv.orderedParts && lv.orderedParts.length > 0) {
            const partMap = new Map();
            cloudParts.forEach(p => { if (p.id) partMap.set(p.id, p); });
            lv.orderedParts.forEach(p => {
              if (p.id && !deletedIds.has(p.id)) {
                partMap.set(p.id, { ...partMap.get(p.id), ...p });
              }
            });
            v.orderedParts = Array.from(partMap.values());
          } else {
            v.orderedParts = cloudParts;
          }
        }
      });

      // Include local-only vehicles if any
      const cloudFolios = new Set(list.map(v => v.folio));
      localList.forEach(lv => {
        if (lv.folio && !cloudFolios.has(lv.folio)) {
          list.push(lv);
        }
      });

      // Strip heavy base64 data to avoid exceeding localStorage quota
      const lightList = list.map(v => {
        const { imageUrls, admissionPassUrl, inventoryDocUrl, primaryPhoto, ...rest } = v;
        return rest;
      });
      localStorage.setItem("workshop_vehicles", JSON.stringify(lightList));
    } catch (syncErr) {
      console.warn("Could not sync vehicles to localStorage:", syncErr);
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

    // Auto-link any pending siniestro data if an official vehicle is being registered
    if (!vehicle.isPendingRegistration && vehicle.orderNumber) {
      await linkPendingSiniestroToVehicle(vehicle.orderNumber, vehicle.folio);
    }
  } catch (e) {
    console.error("Firestore saveVehicle error:", e);
    if (e.message && (e.message.includes("exceeds the maximum allowed size") || e.message.includes("supera el límite"))) {
      throw e;
    }
    useLocalFallback = true;
    await saveVehicle(vehicle);
    if (!vehicle.isPendingRegistration && vehicle.orderNumber) {
      await linkPendingSiniestroToVehicle(vehicle.orderNumber, vehicle.folio);
    }
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
  try {
    const querySnapshot = await getDocs(collection(db, "outgoings"));
    const list = [];
    querySnapshot.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() });
    });

    // Merge & sync local cache
    try {
      const local = JSON.parse(localStorage.getItem("workshop_outgoings") || "[]");
      const cloudIds = new Set(list.map(o => o.id));
      local.forEach(lo => {
        if (lo.id && !cloudIds.has(lo.id)) list.push(lo);
      });
      localStorage.setItem("workshop_outgoings", JSON.stringify(list));
    } catch (syncErr) {
      console.warn("Could not sync outgoings to local cache:", syncErr);
    }

    return list.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending
  } catch (e) {
    if (e?.code === 'permission-denied' || (e?.message && e.message.includes('permissions'))) {
      console.warn("Firestore getOutgoingsList: Permisos restringidos en Firestore nube, usando almacenamiento local.");
    } else {
      console.error("Firestore getOutgoingsList error:", e);
    }
    useLocalFallback = true;
    const local = JSON.parse(localStorage.getItem("workshop_outgoings") || "[]");
    return local.sort((a, b) => new Date(b.date) - new Date(a.date));
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
    if (e.message && (e.message.includes("Stock insuficiente") || e.message.includes("no existe"))) {
      throw e;
    }
    useLocalFallback = true;
    return registerOutgoing(outgoing);
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
  const cleanPart = {
    ...part,
    cost: part.cost !== undefined ? parseFloat(part.cost) || 0 : 0,
    itemNo: part.itemNo ? parseInt(part.itemNo) || 1 : 1,
    quantity: part.quantity ? parseInt(part.quantity) || 1 : 1,
    deliveryDate: part.deliveryDate || '',
    purchaseOrder: part.purchaseOrder || '',
    supplier: part.supplier || '',
    notes: part.notes || '',
    status: part.status || 'pendiente'
  };

  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
    let index = list.findIndex(v => v.folio === folio);
    if (index === -1) {
      // Vehicle exists in Firestore but not in localStorage cache — create a minimal entry
      list.push({ folio, orderedParts: [], active: true });
      index = list.length - 1;
    }
    
    const parts = list[index].orderedParts || [];
    if (cleanPart.id) {
      // Update existing
      const pi = parts.findIndex(p => p.id === cleanPart.id);
      if (pi !== -1) parts[pi] = { ...parts[pi], ...cleanPart };
      else parts.push(cleanPart);
    } else {
      // New part
      const newId = "op_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4);
      parts.push({ ...cleanPart, id: newId, itemNo: parts.length + 1 });
    }
    list[index].orderedParts = parts;
    localStorage.setItem("workshop_vehicles", JSON.stringify(list));
    return cleanPart;
  }
  try {
    const vehicleRef = doc(db, "vehicles", folio);
    const vehicleSnap = await getDocs(query(collection(db, "vehicles"), where("folio", "==", folio)));
    if (vehicleSnap.empty) throw new Error("Vehículo no encontrado.");
    const vehicleData = vehicleSnap.docs[0].data();
    const parts = vehicleData.orderedParts || [];
    if (cleanPart.id) {
      const pi = parts.findIndex(p => p.id === cleanPart.id);
      if (pi !== -1) parts[pi] = { ...parts[pi], ...cleanPart };
      else parts.push(cleanPart);
    } else {
      const newId = "op_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4);
      cleanPart.id = newId;
      cleanPart.itemNo = parts.length + 1;
      parts.push(cleanPart);
    }
    await updateDoc(vehicleRef, { orderedParts: parts });
    return cleanPart;
  } catch (e) {
    console.error("Firestore saveOrderedPart error:", e);
    useLocalFallback = true;
    return saveOrderedPart(folio, cleanPart);
  }
};

export const deleteOrderedPart = async (folio, partId) => {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
    const index = list.findIndex(v => v.folio === folio);
    if (index !== -1) {
      const parts = (list[index].orderedParts || []).filter(p => p.id !== partId);
      list[index].orderedParts = parts;
      list[index].deletedPartIds = [...(list[index].deletedPartIds || []), partId];
      localStorage.setItem("workshop_vehicles", JSON.stringify(list));
    }
    return;
  }
  try {
    const vehicleRef = doc(db, "vehicles", folio);
    const vehicleSnap = await getDocs(query(collection(db, "vehicles"), where("folio", "==", folio)));
    if (!vehicleSnap.empty) {
      const vehicleData = vehicleSnap.docs[0].data();
      const parts = (vehicleData.orderedParts || []).filter(p => p.id !== partId);
      await updateDoc(vehicleRef, { orderedParts: parts });
    }
  } catch (e) {
    console.error("Firestore deleteOrderedPart error:", e);
    const list = JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
    const index = list.findIndex(v => v.folio === folio);
    if (index !== -1) {
      list[index].orderedParts = (list[index].orderedParts || []).filter(p => p.id !== partId);
      localStorage.setItem("workshop_vehicles", JSON.stringify(list));
    }
  }
};

export const getAllPartsList = async () => {
  const vehicles = await getVehiclesList();
  const allParts = [];
  
  vehicles.forEach(v => {
    const parts = v.orderedParts || [];
    parts.forEach((part, idx) => {
      allParts.push({
        ...part,
        id: part.id || `part_${v.folio}_${idx}`,
        vehicleFolio: v.folio,
        vehicleOrderNumber: v.orderNumber || v.siniestro || '',
        vehicleBrand: v.brand || '',
        vehicleModel: v.model || '',
        vehicleYear: v.year || '',
        vehicleColor: v.color || '',
        vehiclePlate: v.plate || '',
        vehicleSerial: v.serial || v.vin || '',
        vehicleLocation: v.location || '',
        vehicleType: v.type || 'Coche',
        vehicleActive: v.active !== false,
        itemNo: part.itemNo || (idx + 1)
      });
    });
  });

  return allParts;
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

// --- INVOICES SERVICES (GESTIÓN DE FACTURAS EMITIDAS) ---

export const getInvoicesList = async () => {
  try {
    const snapshot = await getDocs(collection(db, "invoices"));
    const list = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));

    // Fetch invoice PDF docs in parallel if stored separately
    try {
      const docsSnap = await getDocs(collection(db, "invoice_docs"));
      const docsMap = {};
      docsSnap.forEach(d => {
        const data = d.data();
        if (data.invoiceId && data.pdfUrl) {
          docsMap[data.invoiceId] = { pdfUrl: data.pdfUrl, pdfName: data.pdfName };
        }
      });

      list.forEach(inv => {
        if (docsMap[inv.id]) {
          inv.pdfUrl = docsMap[inv.id].pdfUrl;
          if (docsMap[inv.id].pdfName) inv.pdfName = docsMap[inv.id].pdfName;
        }
      });
    } catch (docsErr) {
      console.warn("Error fetching invoice docs:", docsErr);
    }

    // Keep local storage mirror in sync
    localStorage.setItem("workshop_invoices", JSON.stringify(list));
    return list.sort((a, b) => (parseInt(b.invoiceFolio) || 0) - (parseInt(a.invoiceFolio) || 0));
  } catch (e) {
    if (e?.code === 'permission-denied' || (e?.message && e.message.includes('permissions'))) {
      console.warn("Firestore getInvoicesList: Permisos restringidos en Firestore nube, usando almacenamiento local.");
    } else {
      console.warn("Firestore getInvoicesList (usando fallback local):", e?.message || e);
    }
    const local = JSON.parse(localStorage.getItem("workshop_invoices") || "[]");
    return local.sort((a, b) => (parseInt(b.invoiceFolio) || 0) - (parseInt(a.invoiceFolio) || 0));
  }
};

export const saveInvoice = async (invoiceData) => {
  const invoiceId = invoiceData.id || `inv_${Date.now()}`;
  const { pdfUrl, pdfName, ...metaPayload } = invoiceData;

  const invoiceRecord = {
    ...metaPayload,
    id: invoiceId,
    invoiceFolio: String(metaPayload.invoiceFolio || '').trim(),
    reportNumber: String(metaPayload.reportNumber || '').trim(),
    vehicleFolio: String(metaPayload.vehicleFolio || '').trim(),
    subtotal: parseFloat(metaPayload.subtotal) || 0,
    iva: parseFloat(metaPayload.iva) || 0,
    total: parseFloat(metaPayload.total) || 0,
    discountType: metaPayload.discountType || 'percent',
    discountValue: parseFloat(metaPayload.discountValue) ?? 3,
    discountAmount: parseFloat(metaPayload.discountAmount) || 0,
    paymentSubtotal: parseFloat(metaPayload.paymentSubtotal) || 0,
    paymentIva: parseFloat(metaPayload.paymentIva) || 0,
    paymentTotal: parseFloat(metaPayload.paymentTotal) || 0,
    issueDate: metaPayload.issueDate || new Date().toISOString().slice(0, 10),
    paymentDate: metaPayload.paymentDate || null,
    notes: metaPayload.notes || '',
    hasPdf: !!pdfUrl,
    pdfName: pdfName || (pdfUrl ? `Factura_${metaPayload.invoiceFolio || invoiceId}.pdf` : ''),
    updatedAt: new Date().toISOString()
  };

  if (!invoiceRecord.createdAt) {
    invoiceRecord.createdAt = new Date().toISOString();
  }

  // 1. Guardar en LocalStorage (incluye PDF para funcionamiento offline)
  const localList = JSON.parse(localStorage.getItem("workshop_invoices") || "[]");
  const localIndex = localList.findIndex(i => i.id === invoiceId);
  const fullLocalRecord = { ...invoiceRecord, pdfUrl: pdfUrl || (localIndex !== -1 ? localList[localIndex].pdfUrl : '') };
  
  if (localIndex !== -1) {
    localList[localIndex] = fullLocalRecord;
  } else {
    localList.unshift(fullLocalRecord);
  }
  localStorage.setItem("workshop_invoices", JSON.stringify(localList));

  if (useLocalFallback) {
    return fullLocalRecord;
  }

  // 2. Guardar en Firestore
  try {
    // Guardar metadata en `invoices`
    await setDoc(doc(db, "invoices", invoiceId), invoiceRecord, { merge: true });

    // Guardar documento pesado en `invoice_docs` si hay PDF nuevo
    if (pdfUrl) {
      await setDoc(doc(db, "invoice_docs", `doc_${invoiceId}`), {
        invoiceId,
        invoiceFolio: invoiceRecord.invoiceFolio,
        pdfUrl,
        pdfName: invoiceRecord.pdfName,
        updatedAt: new Date().toISOString()
      });
    }

    return fullLocalRecord;
  } catch (e) {
    console.error("Firestore saveInvoice error:", e);
    return fullLocalRecord;
  }
};

export const deleteInvoice = async (invoiceId) => {
  // 1. Eliminar de LocalStorage
  const localList = JSON.parse(localStorage.getItem("workshop_invoices") || "[]");
  const filtered = localList.filter(i => i.id !== invoiceId);
  localStorage.setItem("workshop_invoices", JSON.stringify(filtered));

  if (useLocalFallback) return true;

  // 2. Eliminar de Firestore
  try {
    await deleteDoc(doc(db, "invoices", invoiceId));
    try {
      await deleteDoc(doc(db, "invoice_docs", `doc_${invoiceId}`));
    } catch (docErr) {
      console.warn("Error deleting invoice_doc:", docErr);
    }
    return true;
  } catch (e) {
    console.error("Firestore deleteInvoice error:", e);
    return true;
  }
};


// ==========================================================================
// PENDING / PROVISIONAL SINIESTROS SERVICES
// ==========================================================================

/**
 * Creates or retrieves a provisional vehicle record for a Siniestro that has not yet been registered.
 * Allows parts, outgoings, and invoices to be assigned immediately.
 */
export const saveProvisionalVehicleForSiniestro = async (rawSiniestro) => {
  const cleanSiniestro = String(rawSiniestro || '').trim().toUpperCase();
  if (!cleanSiniestro) throw new Error("Número de siniestro requerido.");

  const provisionalFolio = cleanSiniestro.startsWith("SIN-") ? cleanSiniestro : `SIN-${cleanSiniestro}`;

  // Check if an official or provisional vehicle already exists
  const vehicles = await getVehiclesList();
  const existing = vehicles.find(v => 
    v.folio === provisionalFolio ||
    v.folio === cleanSiniestro ||
    (v.orderNumber && v.orderNumber.toUpperCase() === cleanSiniestro) ||
    (v.siniestro && v.siniestro.toUpperCase() === cleanSiniestro)
  );

  if (existing) {
    return existing;
  }

  // Create new provisional vehicle record
  const provisionalVehicle = {
    folio: provisionalFolio,
    orderNumber: cleanSiniestro,
    siniestro: cleanSiniestro,
    plate: "PENDIENTE",
    brand: "",
    model: "Siniestro sin alta",
    year: "",
    color: "",
    serial: "",
    location: "POR ASIGNAR",
    type: "Coche",
    details: `Registro provisional para Siniestro: ${cleanSiniestro}`,
    isPendingRegistration: true,
    orderedParts: [],
    active: true,
    entryDate: new Date().toISOString()
  };

  await saveVehicle(provisionalVehicle);
  return provisionalVehicle;
};

/**
 * Links and migrates all parts, outgoings, and invoices from a provisional Siniestro to an official vehicle.
 */
export const linkPendingSiniestroToVehicle = async (rawSiniestro, officialVehicleFolio) => {
  const cleanSiniestro = String(rawSiniestro || '').trim().toUpperCase();
  if (!cleanSiniestro || !officialVehicleFolio) return;

  const provisionalFolio = cleanSiniestro.startsWith("SIN-") ? cleanSiniestro : `SIN-${cleanSiniestro}`;

  try {
    // 1. Get provisional vehicle parts
    const vehicles = await getVehiclesList();
    const provisional = vehicles.find(v => 
      v.folio === provisionalFolio || 
      (v.isPendingRegistration && (v.orderNumber === cleanSiniestro || v.siniestro === cleanSiniestro))
    );

    let partsToMigrate = [];
    if (provisional && provisional.orderedParts && provisional.orderedParts.length > 0) {
      partsToMigrate = [...provisional.orderedParts];
    }

    // 2. Add migrated parts to the official vehicle
    if (partsToMigrate.length > 0) {
      const officialVehicle = vehicles.find(v => v.folio === officialVehicleFolio);
      const existingOfficialParts = officialVehicle?.orderedParts || [];
      
      // Combine and prevent duplicate IDs
      const combinedParts = [...existingOfficialParts];
      partsToMigrate.forEach(p => {
        if (!combinedParts.some(ep => ep.id === p.id)) {
          combinedParts.push(p);
        }
      });

      // Update in LocalStorage
      const localVehicles = JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
      const vIdx = localVehicles.findIndex(v => v.folio === officialVehicleFolio);
      if (vIdx !== -1) {
        localVehicles[vIdx].orderedParts = combinedParts;
        localStorage.setItem("workshop_vehicles", JSON.stringify(localVehicles));
      }

      // Update in Firestore
      if (!useLocalFallback) {
        try {
          const vRef = doc(db, "vehicles", officialVehicleFolio);
          await updateDoc(vRef, { orderedParts: combinedParts });
        } catch (fErr) {
          console.warn("Firestore parts migration note:", fErr);
        }
      }
    }

    // 3. Migrate Outgoings from provisional folio to official folio
    const localOutgoings = JSON.parse(localStorage.getItem("workshop_outgoings") || "[]");
    let outgoingsUpdated = false;
    localOutgoings.forEach(out => {
      if (out.vehicleFolio === provisionalFolio || out.vehicleFolio === cleanSiniestro) {
        out.vehicleFolio = officialVehicleFolio;
        outgoingsUpdated = true;
      }
    });
    if (outgoingsUpdated) {
      localStorage.setItem("workshop_outgoings", JSON.stringify(localOutgoings));
    }

    if (!useLocalFallback) {
      try {
        const qOut = query(collection(db, "outgoings"), where("vehicleFolio", "in", [provisionalFolio, cleanSiniestro]));
        const snapOut = await getDocs(qOut);
        const bOut = writeBatch(db);
        snapOut.forEach(d => {
          bOut.update(d.ref, { vehicleFolio: officialVehicleFolio });
        });
        if (!snapOut.empty) await bOut.commit();
      } catch (errOut) {
        console.warn("Firestore outgoings migration note:", errOut);
      }
    }

    // 4. Migrate Invoices from provisional folio to official folio
    const localInvoices = JSON.parse(localStorage.getItem("workshop_invoices") || "[]");
    let invoicesUpdated = false;
    localInvoices.forEach(inv => {
      if (
        inv.vehicleFolio === provisionalFolio || 
        inv.vehicleFolio === cleanSiniestro ||
        (inv.reportNumber && inv.reportNumber.toUpperCase() === cleanSiniestro && (!inv.vehicleFolio || inv.vehicleFolio.startsWith('SIN-')))
      ) {
        inv.vehicleFolio = officialVehicleFolio;
        invoicesUpdated = true;
      }
    });
    if (invoicesUpdated) {
      localStorage.setItem("workshop_invoices", JSON.stringify(localInvoices));
    }

    if (!useLocalFallback) {
      try {
        const snapInv = await getDocs(collection(db, "invoices"));
        const bInv = writeBatch(db);
        let count = 0;
        snapInv.forEach(d => {
          const data = d.data();
          if (
            data.vehicleFolio === provisionalFolio ||
            data.vehicleFolio === cleanSiniestro ||
            (data.reportNumber && data.reportNumber.toUpperCase() === cleanSiniestro && (!data.vehicleFolio || data.vehicleFolio.startsWith('SIN-')))
          ) {
            bInv.update(d.ref, { vehicleFolio: officialVehicleFolio });
            count++;
          }
        });
        if (count > 0) await bInv.commit();
      } catch (errInv) {
        console.warn("Firestore invoices migration note:", errInv);
      }
    }

    // 5. Delete the provisional vehicle record
    if (provisional && provisional.isPendingRegistration) {
      // LocalStorage
      const localVehicles = JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
      const filteredVehicles = localVehicles.filter(v => v.folio !== provisional.folio);
      localStorage.setItem("workshop_vehicles", JSON.stringify(filteredVehicles));

      // Firestore
      if (!useLocalFallback) {
        try {
          await deleteDoc(doc(db, "vehicles", provisional.folio));
        } catch (dErr) {
          console.warn("Firestore provisional delete note:", dErr);
        }
      }
    }

    return true;
  } catch (e) {
    console.error("linkPendingSiniestroToVehicle error:", e);
  }
};

/**
 * Returns a list of all pending/provisional vehicles that need official registration,
 * along with statistics of registered parts, outgoings, and invoices.
 */
export const getPendingSiniestrosList = async () => {
  try {
    const [vehicles, outgoings, invoices] = await Promise.all([
      getVehiclesList().catch(() => []),
      getOutgoingsList().catch(() => []),
      getInvoicesList().catch(() => [])
    ]);

    const pendingVehicles = (vehicles || []).filter(v => v.isPendingRegistration);

    return pendingVehicles.map(pv => {
      const partsCount = (pv.orderedParts || []).length;
      const partsCost = (pv.orderedParts || []).reduce((acc, p) => acc + (parseFloat(p.cost) || 0), 0);
      const relatedOutgoings = (outgoings || []).filter(o => o.vehicleFolio === pv.folio || o.vehicleFolio === pv.orderNumber);
      const relatedInvoices = (invoices || []).filter(i => i.vehicleFolio === pv.folio || i.reportNumber === pv.orderNumber);

      return {
        ...pv,
        siniestro: pv.orderNumber || pv.folio.replace("SIN-", ""),
        partsCount,
        partsCost,
        outgoingsCount: relatedOutgoings.length,
        outgoingsCost: relatedOutgoings.reduce((acc, o) => acc + (parseFloat(o.totalCost) || 0), 0),
        invoicesCount: relatedInvoices.length,
        invoicesTotal: relatedInvoices.reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0)
      };
    });
  } catch (err) {
    console.warn("getPendingSiniestrosList error:", err);
    return [];
  }
};




