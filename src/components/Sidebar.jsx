import React from 'react';
import { 
  Car, 
  Layers,
  Package, 
  ArrowUpRight, 
  BarChart3, 
  Users, 
  LogOut, 
  Wrench,
  Database,
  Search,
  FileText
} from 'lucide-react';
import { resetFirebaseConnection } from '../config/dbService';

const Sidebar = ({ currentView, setView, user, onLogout, isFirebaseConnected }) => {
  const menuItems = [
    { id: 'vehicles', label: 'Vehículos', icon: Car, roles: ['admin', 'encargado', 'tecnico'] },
    { id: 'parts', label: 'Piezas / Refacc.', icon: Layers, roles: ['admin', 'encargado', 'tecnico'] },
    { id: 'inventory', label: 'Inventario', icon: Package, roles: ['admin', 'encargado', 'tecnico'] },
    { id: 'outgoings', label: 'Salidas', icon: ArrowUpRight, roles: ['admin', 'encargado', 'tecnico'] },
    { id: 'invoices', label: 'Facturas', icon: FileText, roles: ['admin', 'encargado'] },
    { id: 'reports', label: 'Reportes', icon: BarChart3, roles: ['admin', 'encargado'] },
    { id: 'users', label: 'Usuarios', icon: Users, roles: ['admin', 'encargado'] },
    { id: 'client-tracking', label: 'Vista Cliente', icon: Search, roles: ['admin', 'encargado', 'tecnico'] },
  ];


  const filteredItems = menuItems.filter(item => item.roles.includes(user?.role));

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Wrench size={24} />
        <span>Metal Shapers</span>
      </div>

      <ul className="sidebar-menu">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <li key={item.id} className={`sidebar-item ${isActive ? 'active' : ''}`}>
              <button onClick={() => setView(item.id)}>
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-user">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          <div 
            onClick={!isFirebaseConnected ? resetFirebaseConnection : undefined}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              cursor: !isFirebaseConnected ? 'pointer' : 'default',
              padding: !isFirebaseConnected ? '6px 10px' : '0px',
              borderRadius: '8px',
              background: !isFirebaseConnected ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
              border: !isFirebaseConnected ? '1px dashed rgba(245, 158, 11, 0.2)' : 'none',
              width: 'fit-content'
            }}
            title={!isFirebaseConnected ? "Click para intentar conectar a Firebase Cloud nuevamente" : undefined}
          >
            <Database size={14} color={isFirebaseConnected ? '#10b981' : '#f59e0b'} />
            <span style={{ fontSize: '0.72rem', color: isFirebaseConnected ? '#34d399' : '#fbbf24', fontWeight: 500 }}>
              {isFirebaseConnected ? 'Firebase Nube' : 'Modo Local (Conectar)'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px #10b981',
              display: 'inline-block'
            }} className="pulse-dot" />
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500 }}>
              Sincronización en vivo
            </span>
          </div>
        </div>
        
        <div className="user-info">
          <div className="user-avatar">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="user-details">
            <span className="user-name">{user?.name || 'Usuario'}</span>
            <span className="user-role">
              {user?.role === 'admin' ? 'Administrador' : user?.role === 'encargado' ? 'Encargado' : 'Técnico'}
            </span>
          </div>
        </div>
        <button onClick={onLogout} className="btn-logout">
          <LogOut size={16} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
