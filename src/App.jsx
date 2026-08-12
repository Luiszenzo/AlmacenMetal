import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
import { checkFirebaseStatus, logoutUser } from './config/dbService';
import { Wrench, LogOut } from 'lucide-react';

// Views
import Login from './views/Login';
import Vehicles from './views/Vehicles';
import Inventory from './views/Inventory';
import Outgoings from './views/Outgoings';
import Reports from './views/Reports';
import Users from './views/Users';

// Components
import Sidebar from './components/Sidebar';

function App() {
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('vehicles');
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initialize and check Firebase connection status
  useEffect(() => {
    const initApp = async () => {
      // Check if Firebase Firestore is reachable
      const connected = await checkFirebaseStatus();
      setIsFirebaseConnected(connected);

      // Try reading persisted local session
      const savedLocalUser = localStorage.getItem('workshop_current_user');
      if (savedLocalUser) {
        setUser(JSON.parse(savedLocalUser));
      }

      // Sync with Firebase Auth state
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          // If we logged in via Firebase Auth, we update/restore local session role
          const saved = localStorage.getItem('workshop_current_user');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.email === firebaseUser.email) {
              setUser(parsed);
              setLoading(false);
              return;
            }
          }
          // Default role mapping if not in local storage yet
          const tempUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.email.split('@')[0],
            role: 'tecnico',
            active: true
          };
          setUser(tempUser);
          localStorage.setItem('workshop_current_user', JSON.stringify(tempUser));
        } else {
          // If Firebase Auth logged out and we were not using local fallback
          const saved = localStorage.getItem('workshop_current_user');
          if (saved) {
            const parsed = JSON.parse(saved);
            // Only force logout if the current user was not a local demo user
            if (!parsed.uid.startsWith('local_') && parsed.uid !== 'admin1' && parsed.uid !== 'encargado1' && parsed.uid !== 'tecnico1' && parsed.uid !== 'tecnico2') {
              setUser(null);
              localStorage.removeItem('workshop_current_user');
            }
          }
        }
        setLoading(false);
      });

      return () => unsubscribe();
    };

    initApp();
  }, []);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    localStorage.setItem('workshop_current_user', JSON.stringify(loggedInUser));
    
    // Default starting view depending on role
    if (loggedInUser.role === 'tecnico') {
      setCurrentView('vehicles');
    } else {
      setCurrentView('vehicles');
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    localStorage.removeItem('workshop_current_user');
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: '#0b0f19',
        color: '#f8fafc',
        fontFamily: 'sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Iniciando Sistema de Almacén...</h2>
          <p style={{ color: '#94a3b8', marginTop: '8px' }}>Verificando servicios e inicializando base de datos...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated, show Login screen
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Render view
  const renderView = () => {
    switch (currentView) {
      case 'vehicles':
        return <Vehicles currentUser={user} />;
      case 'inventory':
        return <Inventory currentUser={user} />;
      case 'outgoings':
        return <Outgoings currentUser={user} />;
      case 'reports':
        // Safe check for role restriction
        if (user.role === 'tecnico') {
          setCurrentView('vehicles');
          return <Vehicles currentUser={user} />;
        }
        return <Reports />;
      case 'users':
        if (user.role === 'tecnico') {
          setCurrentView('vehicles');
          return <Vehicles currentUser={user} />;
        }
        return <Users currentUser={user} />;
      default:
        return <Vehicles currentUser={user} />;
    }
  };

  return (
    <div className="app-container">
      <header className="mobile-header">
        <div className="mobile-header-logo">
          <Wrench size={20} />
          <span>Metal Shapers</span>
        </div>
        <button 
          onClick={handleLogout} 
          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          title="Cerrar Sesión"
        >
          <LogOut size={20} />
        </button>
      </header>

      <Sidebar 
        currentView={currentView} 
        setView={setCurrentView} 
        user={user} 
        onLogout={handleLogout}
        isFirebaseConnected={isFirebaseConnected}
      />
      <main className="main-content">
        {renderView()}
      </main>
    </div>
  );
}

export default App;
