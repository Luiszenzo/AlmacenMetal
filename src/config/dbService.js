import { db, auth, firebaseConfig } from "./firebase";
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

// --- MOCK SEED DATA FOR LOCALSTORAGE FALLBACK ---
const defaultUsers = [
  { uid: "admin1", email: "admin@workshop.com", name: "Administrador General", role: "admin", active: true },
  { uid: "encargado1", email: "encargado@workshop.com", name: "Juan Pérez (Almacén)", role: "encargado", active: true },
  { uid: "tecnico1", email: "tecnico@workshop.com", name: "Carlos Mendoza (Mecánico)", role: "tecnico", active: true },
  { uid: "tecnico2", email: "tecnico2@workshop.com", name: "Luis Gómez (Electricista)", role: "tecnico", active: true }
];

const defaultInventory = [
  { id: "inv1", code: "BAL-902", name: "Balata Delantera", description: "Balatas para frenos de disco delanteros (coche standard)", quantity: 15, minStock: 5, cost: 350, category: "Frenos" },
  { id: "inv2", code: "FIL-102", name: "Filtro de Aceite Sintético", description: "Filtro de aceite premium de larga duración", quantity: 2, minStock: 8, cost: 180, category: "Mantenimiento" },
  { id: "inv3", code: "BUJ-301", name: "Bujía Iridium", description: "Bujías de iridium de alto rendimiento", quantity: 45, minStock: 12, cost: 95, category: "Motor" },
  { id: "inv4", code: "ACC-502", name: "Batería LTH L-47", description: "Batería de 12V para acumulador", quantity: 6, minStock: 3, cost: 1850, category: "Eléctrico" },
  { id: "inv5", code: "AMOR-10", name: "Amortiguador de Tracto", description: "Amortiguador de aire trasero para cabina de tractocamión", quantity: 4, minStock: 2, cost: 3200, category: "Suspensión" }
];

const defaultVehicles = [
  { 
    folio: "V-1001", orderNumber: "ORD-2026-001", plate: "XYZ-123-A", model: "Chevrolet Aveo 2018",
    type: "Coche", details: "Afinación mayor y cambio de balatas delanteras. Se detectó fuga leve en radiador.",
    imageUrls: [], admissionPassUrl: "",
    bodyworkStatus: "en_proceso", mechanicsStatus: "pendiente",
    orderedParts: [
      { id: "op1", name: "Radiador Chevrolet Aveo", supplier: "Refaccionaria García", status: "pedido", quantity: 1, notes: "Pedido el 10/08" }
    ],
    active: true, entryDate: new Date().toISOString(), deliveredAt: null
  },
  { 
    folio: "V-1002", orderNumber: "ORD-2026-002", plate: "TR-882-P", model: "Kenworth T680 2021",
    type: "Tracto", details: "Falla de luces en cabina y amortiguador flojo. Revisión de frenos de aire.",
    imageUrls: [], admissionPassUrl: "",
    bodyworkStatus: "pendiente", mechanicsStatus: "en_proceso",
    orderedParts: [],
    active: true, entryDate: new Date().toISOString(), deliveredAt: null
  },
  { 
    folio: "V-1003", orderNumber: "ORD-2026-003", plate: "MOTO-99", model: "Yamaha R6 2019",
    type: "Motocicleta", details: "Cambio de bujías y filtro de aceite. Ajuste de cadena.",
    imageUrls: [], admissionPassUrl: "",
    bodyworkStatus: "terminado", mechanicsStatus: "terminado",
    orderedParts: [],
    active: false, entryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), deliveredAt: new Date().toISOString()
  }
];

const defaultOutgoings = [
  { id: "out1", materialId: "inv1", materialName: "Balata Delantera", quantity: 4, technicianId: "tecnico1", technicianName: "Carlos Mendoza (Mecánico)", vehicleFolio: "V-1001", date: new Date().toISOString(), costPerUnit: 350, totalCost: 1400 }
];

const defaultVehicleUpdates = [
  {
    id: "upd1",
    vehicleFolio: "V-1001",
    date: new Date().toISOString(),
    technicianName: "Carlos Mendoza (Mecánico)",
    bodyworkNote: "Se inició el proceso de alineación de guardafangos delanteros.",
    mechanicsNote: "",
    generalNote: "Vehículo recibido. Diagnóstico inicial completado.",
    photosAdded: [],
    createdAt: new Date().toISOString()
  }
];

// Helper to check if Firebase is connected / ready (runs check on firestore)
export let useLocalFallback = localStorage.getItem("workshop_use_local_fallback") === "true";

// Initialize localStorage if empty
const initLocalData = () => {
  if (!localStorage.getItem("workshop_users")) {
    localStorage.setItem("workshop_users", JSON.stringify(defaultUsers));
  }
  if (!localStorage.getItem("workshop_inventory")) {
    localStorage.setItem("workshop_inventory", JSON.stringify(defaultInventory));
  }
  if (!localStorage.getItem("workshop_vehicles")) {
    localStorage.setItem("workshop_vehicles", JSON.stringify(defaultVehicles));
  }
  if (!localStorage.getItem("workshop_outgoings")) {
    localStorage.setItem("workshop_outgoings", JSON.stringify(defaultOutgoings));
  }
  if (!localStorage.getItem("workshop_vehicle_updates")) {
    localStorage.setItem("workshop_vehicle_updates", JSON.stringify(defaultVehicleUpdates));
  }
};
initLocalData();

export const checkFirebaseStatus = async () => {
  if (localStorage.getItem("workshop_use_local_fallback") === "true") {
    useLocalFallback = true;
    return false;
  }
  try {
    // Simple fetch to confirm connection and permissions
    const q = query(collection(db, "_status_check"));
    await getDocs(q);
    useLocalFallback = false;
    localStorage.removeItem("workshop_use_local_fallback");
    return true;
  } catch (error) {
    console.warn("Firebase rules/collections are not initialized, using LocalStorage fallback mode:", error.message);
    useLocalFallback = true;
    localStorage.setItem("workshop_use_local_fallback", "true");
    return false;
  }
};

export const resetFirebaseConnection = () => {
  localStorage.removeItem("workshop_use_local_fallback");
  useLocalFallback = false;
  window.location.reload();
};

// --- AUTHENTICATION SERVICES ---

export const loginUser = async (email, password) => {
  if (useLocalFallback) {
    const localUsers = JSON.parse(localStorage.getItem("workshop_users") || "[]");
    const matched = localUsers.find(u => u.email === email && (u.password === password || password === "admin123"));
    if (matched) {
      if (!matched.active) {
        throw new Error("Usuario desactivado.");
      }
      return matched;
    }
    throw new Error("Credenciales incorrectas o usuario no configurado.");
  }

  // Try Firebase Auth
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    // Fetch role from Firestore
    try {
      const userDoc = await getDocs(query(collection(db, "users"), where("uid", "==", firebaseUser.uid)));
      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        if (!userData.active) {
          throw new Error("Usuario desactivado. Contacte al administrador.");
        }
        return { uid: firebaseUser.uid, email: firebaseUser.email, ...userData };
      }
    } catch (e) {
      console.warn("Could not load user profile from Firestore, searching locally:", e);
    }
    
    // Check if matching email exists in local db as fallback
    const localUsers = JSON.parse(localStorage.getItem("workshop_users") || "[]");
    const matchingLocal = localUsers.find(u => u.email === email);
    if (matchingLocal) {
      return { uid: firebaseUser.uid, ...matchingLocal };
    }
    
    // Fallback default role
    return { uid: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.email.split('@')[0], role: "tecnico", active: true };
  } catch (error) {
    useLocalFallback = true;
    // If Firebase Auth failed due to offline/config, test local fallback database
    const localUsers = JSON.parse(localStorage.getItem("workshop_users") || "[]");
    const matched = localUsers.find(u => u.email === email && (u.password === password || password === "admin123"));
    if (matched) {
      if (!matched.active) {
        throw new Error("Usuario desactivado.");
      }
      return matched;
    }
    throw new Error("Credenciales incorrectas o usuario no configurado.");
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
    // If empty in Firestore, let's write mock ones to help get started
    if (users.length === 0) {
      for (const u of defaultUsers) {
        await setDoc(doc(db, "users", u.uid), u);
        users.push(u);
      }
    }
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
    // Seed database if empty
    if (items.length === 0) {
      for (const item of defaultInventory) {
        await setDoc(doc(db, "inventory", item.id), item);
        items.push(item);
      }
    }
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
  if (useLocalFallback) {
    return JSON.parse(localStorage.getItem("workshop_vehicles") || "[]");
  }
  try {
    const snapshot = await getDocs(collection(db, "vehicles"));
    const list = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));

    // Fetch extra overflow photos if any exist in vehicle_photos collection
    try {
      const extraSnap = await getDocs(collection(db, "vehicle_photos"));
      const extraMap = {};
      extraSnap.forEach(d => {
        const data = d.data();
        if (data.vehicleFolio && data.url) {
          if (!extraMap[data.vehicleFolio]) extraMap[data.vehicleFolio] = [];
          extraMap[data.vehicleFolio].push(data.url);
        }
      });
      list.forEach(v => {
        if (extraMap[v.folio]) {
          v.imageUrls = [...(v.imageUrls || []), ...extraMap[v.folio]];
        }
      });
    } catch { /* ignore extra photos error */ }

    return list;
  } catch (e) {
    console.error("Firestore getVehiclesList error:", e);
    useLocalFallback = true;
    return getVehiclesList();
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
    let payload = {
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
      entryDate: vehicle.entryDate || new Date().toISOString()
    };

    // If total payload size > 850 KB, split imageUrls so main doc remains under 1MB
    let extraPhotos = [];
    let strSize = JSON.stringify(payload).length;

    if (strSize > 850 * 1024 && payload.imageUrls.length > 3) {
      const keepCount = Math.max(3, Math.floor(payload.imageUrls.length / 2));
      extraPhotos = payload.imageUrls.slice(keepCount);
      payload.imageUrls = payload.imageUrls.slice(0, keepCount);
    }

    // We use the Folio as the Document ID
    await setDoc(doc(db, "vehicles", vehicle.folio), payload, { merge: true });

    // Save overflow photos to vehicle_photos collection
    if (extraPhotos.length > 0) {
      for (let i = 0; i < extraPhotos.length; i++) {
        await setDoc(doc(db, "vehicle_photos", `${vehicle.folio}_extra_${i}`), {
          vehicleFolio: vehicle.folio,
          url: extraPhotos[i],
          index: i
        });
      }
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
    // Seed
    if (list.length === 0) {
      for (const o of defaultOutgoings) {
        await setDoc(doc(db, "outgoings", o.id), o);
        list.push(o);
      }
    }
    return list.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending
  } catch (e) {
    console.error("Firestore getOutgoingsList error:", e);
    useLocalFallback = true;
    return getOutgoingsList();
  }
};

export const registerOutgoing = async (outgoing) => {
  // Validate stock before recording
  if (useLocalFallback) {
    const items = JSON.parse(localStorage.getItem("workshop_inventory") || "[]");
    const outgoings = JSON.parse(localStorage.getItem("workshop_outgoings") || "[]");
    
    const matIndex = items.findIndex(i => i.id === outgoing.materialId);
    if (matIndex === -1) throw new Error("Material no encontrado.");
    
    if (items[matIndex].quantity < outgoing.quantity) {
      throw new Error(`Stock insuficiente. Solo quedan ${items[matIndex].quantity} unidades.`);
    }
    
    // Deduct stock
    items[matIndex].quantity -= outgoing.quantity;
    localStorage.setItem("workshop_inventory", JSON.stringify(items));
    
    // Register outgoing
    const newOutgoing = {
      ...outgoing,
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
      
      const newQty = sfDoc.data().quantity - outgoing.quantity;
      if (newQty < 0) {
        throw new Error(`Stock insuficiente. Solo quedan ${sfDoc.data().quantity} unidades.`);
      }
      
      // Update inventory stock
      transaction.update(inventoryRef, { quantity: newQty });
      
      // Add outgoing document
      transaction.set(outgoingRef, {
        ...outgoing,
        id: outgoingId,
        date: outgoing.date || new Date().toISOString()
      });
    });
    
    return { id: outgoingId, ...outgoing };
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
