import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, Plus, Eye, EyeOff } from 'lucide-react';
import { getUsersList, createNewUser, toggleUserActiveStatus } from '../config/dbService';

const Users = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('tecnico');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsersList();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      await createNewUser(name, email, password, role);
      setSuccess('Usuario registrado exitosamente.');
      setName('');
      setEmail('');
      setPassword('');
      setRole('tecnico');
      loadUsers();
      setTimeout(() => {
        setShowModal(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Error al registrar usuario.');
    }
  };

  const handleToggleStatus = async (user) => {
    if (user.uid === currentUser.uid) {
      alert("No puedes desactivarte a ti mismo.");
      return;
    }
    try {
      await toggleUserActiveStatus(user.uid, user.active);
      loadUsers();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestión de Usuarios</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Controla quién accede al almacén y qué permisos tienen.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} />
          <span>Registrar Usuario</span>
        </button>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          Cargando usuarios...
        </div>
      ) : (
        <div className="glass-panel table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo Electrónico</th>
                <th>Rol</th>
                <th>Estatus</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.uid}>
                  <td style={{ fontWeight: '600', color: 'white' }}>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`badge ${
                      user.role === 'admin' ? 'badge-danger' : user.role === 'encargado' ? 'badge-warning' : 'badge-info'
                    }`}>
                      {user.role === 'admin' ? 'Admin' : user.role === 'encargado' ? 'Encargado' : 'Técnico'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${user.active ? 'badge-success' : 'badge-danger'}`}>
                      {user.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button 
                      onClick={() => handleToggleStatus(user)}
                      className={`btn btn-sm ${user.active ? 'btn-danger' : 'btn-primary'}`}
                      style={{ padding: '0.3rem 0.6rem' }}
                      disabled={user.uid === currentUser.uid}
                    >
                      {user.active ? <EyeOff size={14} /> : <Eye size={14} />}
                      <span style={{ marginLeft: '4px' }}>{user.active ? 'Desactivar' : 'Activar'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Registration Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Registrar Nuevo Usuario</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {error && <div className="badge badge-danger" style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem', boxSizing: 'border-box' }}>{error}</div>}
            {success && <div className="badge badge-success" style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem', boxSizing: 'border-box' }}>{success}</div>}

            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label>Nombre Completo</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="ej. Pedro Pascal"
                  required 
                />
              </div>

              <div className="form-group">
                <label>Correo Electrónico</label>
                <input 
                  type="email" 
                  className="input-field" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="ej. pedro@taller.com"
                  required 
                />
              </div>

              <div className="form-group">
                <label>Contraseña</label>
                <input 
                  type="password" 
                  className="input-field" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="Mínimo 6 caracteres"
                  required 
                />
              </div>

              <div className="form-group">
                <label>Rol de Usuario</label>
                <select className="select-field" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="tecnico">Técnico (Solo lectura y salidas asignadas)</option>
                  <option value="encargado">Encargado de Almacén (Gestión completa de inventario)</option>
                  <option value="admin">Administrador (Acceso total y gestión de usuarios)</option>
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
