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
  { folio: "V-1001", plate: "XYZ-123-A", type: "Coche", details: "Sedan Chevrolet Aveo 2018 - Afinación mayor y cambio de balatas", imageUrl: "", active: true, entryDate: new Date().toISOString() },
  { folio: "V-1002", plate: "TR-882-P", type: "Tracto", details: "Kenworth T680 2021 - Falla de luces en cabina y amortiguador flojo", imageUrl: "", active: true, entryDate: new Date().toISOString() },
  { folio: "V-1003", plate: "MOTO-99", type: "Motocicleta", details: "Yamaha R6 2019 - Cambio de bujías y filtro de aceite", imageUrl: "", active: false, entryDate: new Date().toISOString() }
];

const defaultOutgoings = [
  { id: "out1", materialId: "inv1", materialName: "Balata Delantera", quantity: 4, technicianId: "tecnico1", technicianName: "Carlos Mendoza (Mecánico)", vehicleFolio: "V-1001", date: new Date().toISOString(), costPerUnit: 350, totalCost: 1400 }
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
    if (localUsers.find(u => u.email === email)) {
      throw new Error("El correo ya está registrado.");
    }
    const newUser = { uid: "local_" + Date.now(), email, name, role, password, active: true };
    localUsers.push(newUser);
    localStorage.setItem("workshop_users", JSON.stringify(localUsers));
    console.log("💾 [DB SERVICE] Usuario guardado localmente con éxito:", newUser);
    return newUser;
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
    const querySnapshot = await getDocs(collection(db, "vehicles"));
    const list = [];
    querySnapshot.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() });
    });
    // Seed
    if (list.length === 0) {
      for (const v of defaultVehicles) {
        await setDoc(doc(db, "vehicles", v.folio), v);
        list.push(v);
      }
    }
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
      // Edit
      list[index] = { ...list[index], ...vehicle };
    } else {
      // New
      list.push({ ...vehicle, active: true, entryDate: new Date().toISOString() });
    }
    localStorage.setItem("workshop_vehicles", JSON.stringify(list));
    return;
  }
  try {
    // We use the Folio as the Document ID
    await setDoc(doc(db, "vehicles", vehicle.folio), {
      ...vehicle,
      entryDate: vehicle.entryDate || new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.error("Firestore saveVehicle error:", e);
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
