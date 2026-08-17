import React, { useState, useEffect, useCallback } from 'react';
import { Wrench, Mail, Lock, Search, ArrowLeft, ShieldAlert, Clock } from 'lucide-react';
import { loginUser } from '../config/dbService';
import {
  checkLoginRateLimit,
  sanitizeInput,
  formatLockoutTime
} from '../config/security';

const Login = ({ onLoginSuccess, onOpenClientTracking }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Estado del rate limiter
  const [isLocked, setIsLocked]           = useState(false);
  const [lockCountdown, setLockCountdown] = useState('');

  // Verificar si ya hay un bloqueo activo al montar el componente
  useEffect(() => {
    const check = checkLoginRateLimit();
    if (check.blocked) {
      setIsLocked(true);
    }
  }, []);

  // Contador regresivo mientras está bloqueado
  useEffect(() => {
    if (!isLocked) return;

    const interval = setInterval(() => {
      const check = checkLoginRateLimit();
      if (!check.blocked) {
        setIsLocked(false);
        setLockCountdown('');
        setError('');
        clearInterval(interval);
      } else {
        setLockCountdown(formatLockoutTime(check.remainingMs));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLocked]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Verificar bloqueo antes de enviar
    const rateCheck = checkLoginRateLimit();
    if (rateCheck.blocked) {
      setIsLocked(true);
      return;
    }

    // Sanitizar inputs en el frontend también
    const cleanEmail    = sanitizeInput(email,    'email');
    const cleanPassword = sanitizeInput(password, 'password');

    if (!cleanEmail || !cleanPassword) {
      setError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);

    try {
      const user = await loginUser(cleanEmail, cleanPassword);
      onLoginSuccess(user);
    } catch (err) {
      const msg = err.message || '';
      // Manejar el código especial de rate limit
      if (msg.startsWith('RATE_LIMITED:')) {
        setIsLocked(true);
        setError('');
      } else {
        setError(msg || 'Error al iniciar sesión.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="glass-panel login-card">
        {onOpenClientTracking && (
          <button
            type="button"
            onClick={onOpenClientTracking}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--primary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              padding: 0
            }}
          >
            <ArrowLeft size={16} />
            <span>Volver al Buscador de Vehículos</span>
          </button>
        )}

        <div className="login-header">
          <div className="login-logo">
            <Wrench size={32} />
          </div>
          <h2 className="login-title">Control de Almacén</h2>
          <h2 className="login-title">Metal Shapers Garage</h2>
          <p className="login-subtitle">Inicia sesión para acceder al taller</p>
        </div>

        {/* Bloqueo por demasiados intentos */}
        {isLocked && (
          <div style={{
            background: 'rgba(220, 38, 38, 0.12)',
            border: '1px solid rgba(220, 38, 38, 0.4)',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', fontWeight: 600 }}>
              <ShieldAlert size={18} />
              Acceso bloqueado temporalmente
            </div>
            <p style={{ fontSize: '0.82rem', color: '#fca5a5', margin: 0 }}>
              Demasiados intentos fallidos. Intenta de nuevo en:
            </p>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '1.4rem',
              fontWeight: 700,
              color: '#f87171',
              fontFamily: 'monospace'
            }}>
              <Clock size={18} />
              {lockCountdown}
            </div>
          </div>
        )}

        {/* Error normal (no bloqueo) */}
        {error && !isLocked && (
          <div className="badge badge-danger" style={{ display: 'flex', width: '100%', marginBottom: '1.25rem', padding: '0.75rem', fontSize: '0.85rem', boxSizing: 'border-box' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email">Correo Electrónico</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
              <input
                type="email"
                id="login-email"
                className="input-field"
                placeholder="ejemplo@taller.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                disabled={isLocked || loading}
                maxLength={254}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Contraseña</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
              <input
                type="password"
                id="login-password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                disabled={isLocked || loading}
                maxLength={128}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1rem', display: 'flex', justifyContent: 'center' }}
            disabled={loading || isLocked}
          >
            {loading ? 'Iniciando sesión...' : isLocked ? `Bloqueado (${lockCountdown})` : 'Iniciar Sesión'}
          </button>
        </form>

        <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
            ¿Eres cliente y quieres consultar el avance de tu vehículo?
          </p>
          <button
            type="button"
            onClick={onOpenClientTracking}
            className="btn btn-secondary"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              background: 'rgba(0, 210, 255, 0.1)',
              border: '1px solid rgba(0, 210, 255, 0.3)',
              color: 'var(--primary)',
              fontWeight: 600
            }}
          >
            <Search size={16} />
            Ir al Buscador Público de Vehículos
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;

