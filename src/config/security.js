// ============================================================
// MÓDULO DE SEGURIDAD CENTRALIZADO - Metal Shapers Garage
// ============================================================
// Protecciones implementadas:
//   1. Rate Limiter para Login (brute force)
//   2. Throttle para búsquedas públicas (bots / scraping)
//   3. Sanitizador de inputs (XSS / injection)
//   4. Validador de tamaño de datos
//   5. Registro de auditoría de intentos fallidos
// ============================================================

const STORAGE_KEYS = {
  LOGIN_ATTEMPTS: 'sec_login_attempts',
  LOCKOUT_UNTIL:  'sec_lockout_until',
  SEARCH_LOG:     'sec_search_log',
  AUDIT_LOG:      'sec_audit_log',
};

// ── 1. RATE LIMITER PARA LOGIN ───────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS    = 15 * 60 * 1000; // 15 minutos
const LOCKOUT_MS         = 30 * 60 * 1000; // 30 minutos de bloqueo

/**
 * Verifica si el usuario está actualmente bloqueado por demasiados intentos.
 * @returns {{ blocked: boolean, remainingMs?: number }}
 */
export const checkLoginRateLimit = () => {
  const lockoutUntil = parseInt(localStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL) || '0', 10);
  const now = Date.now();

  if (lockoutUntil && now < lockoutUntil) {
    return { blocked: true, remainingMs: lockoutUntil - now };
  }

  // Si el bloqueo expiró, limpiar
  if (lockoutUntil && now >= lockoutUntil) {
    localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    localStorage.removeItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
  }

  return { blocked: false };
};

/**
 * Registra un intento fallido. Si supera el límite, activa el bloqueo.
 * @param {string} email - email que intentó ingresar (se trunca para auditoría)
 * @returns {{ locked: boolean, attemptsLeft: number }}
 */
export const recordFailedLoginAttempt = (email = '') => {
  const now = Date.now();
  let attempts = [];

  try {
    attempts = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGIN_ATTEMPTS) || '[]');
  } catch {
    attempts = [];
  }

  // Filtrar solo los intentos dentro de la ventana actual
  attempts = attempts.filter(ts => now - ts < LOGIN_WINDOW_MS);
  attempts.push(now);
  localStorage.setItem(STORAGE_KEYS.LOGIN_ATTEMPTS, JSON.stringify(attempts));

  // Registrar en auditoría interna
  _addAuditEntry({
    type: 'FAILED_LOGIN',
    email: email.substring(0, 50),
    timestamp: new Date().toISOString(),
    attemptCount: attempts.length,
  });

  if (attempts.length >= MAX_LOGIN_ATTEMPTS) {
    const lockUntil = now + LOCKOUT_MS;
    localStorage.setItem(STORAGE_KEYS.LOCKOUT_UNTIL, String(lockUntil));
    localStorage.removeItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
    return { locked: true, attemptsLeft: 0 };
  }

  return { locked: false, attemptsLeft: MAX_LOGIN_ATTEMPTS - attempts.length };
};

/**
 * Limpia los contadores tras un login exitoso.
 */
export const clearLoginAttempts = () => {
  localStorage.removeItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
  localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
};

// ── 2. THROTTLE PARA BÚSQUEDAS PÚBLICAS ─────────────────────
const MAX_SEARCHES_PER_MINUTE = 10;

/**
 * Verifica si el usuario puede realizar una búsqueda de vehículo.
 * Máximo 10 búsquedas por minuto desde el portal público.
 * @returns {{ allowed: boolean, remainingSearches: number }}
 */
export const checkSearchThrottle = () => {
  const now = Date.now();
  let log = [];

  try {
    log = JSON.parse(localStorage.getItem(STORAGE_KEYS.SEARCH_LOG) || '[]');
  } catch {
    log = [];
  }

  // Solo contar búsquedas en los últimos 60 segundos
  log = log.filter(ts => now - ts < 60_000);

  if (log.length >= MAX_SEARCHES_PER_MINUTE) {
    return { allowed: false, remainingSearches: 0 };
  }

  log.push(now);
  localStorage.setItem(STORAGE_KEYS.SEARCH_LOG, JSON.stringify(log));
  return { allowed: true, remainingSearches: MAX_SEARCHES_PER_MINUTE - log.length };
};

// ── 3. SANITIZADOR DE INPUTS ─────────────────────────────────
const MAX_FIELD_LENGTHS = {
  email:    254,
  password: 128,
  name:     80,
  plate:    15,
  folio:    20,
  text:     800,   // comentarios de cliente
  generic:  255,
};

/**
 * Elimina tags HTML, scripts, URIs peligrosos y caracteres de control.
 * @param {string} value
 * @param {'email'|'password'|'name'|'plate'|'folio'|'text'|'generic'} type
 * @returns {string}
 */
export const sanitizeInput = (value, type = 'generic') => {
  if (typeof value !== 'string') return '';

  let clean = value
    .replace(/<[^>]*>/g, '')                        // etiquetas HTML
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[\da-fA-F]+);/gi, '') // entidades HTML
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // caracteres de control
    .replace(/javascript\s*:/gi, '')                // javascript: URIs
    .replace(/data\s*:\s*text\/html/gi, '')         // data: URIs peligrosos
    .replace(/on\w+\s*=/gi, '')                     // event handlers inline
    .trim();

  const maxLen = MAX_FIELD_LENGTHS[type] ?? MAX_FIELD_LENGTHS.generic;
  if (clean.length > maxLen) {
    clean = clean.substring(0, maxLen);
  }

  return clean;
};

/**
 * Sanitiza todos los valores string de primer nivel en un objeto.
 * Útil antes de guardar en Firestore o localStorage.
 * @param {object} obj
 * @returns {object}
 */
export const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    cleaned[key] = typeof val === 'string' ? sanitizeInput(val, 'generic') : val;
  }
  return cleaned;
};

// ── 4. VALIDADOR DE TAMAÑO DE DATOS ─────────────────────────
const MAX_FIELD_BYTES = {
  email:    500,
  password: 500,
  name:     500,
  comment:  5_000,
  generic:  10_000,
};

/**
 * Verifica que un campo no supere el tamaño máximo en bytes.
 * @param {string} value
 * @param {'email'|'password'|'name'|'comment'|'generic'} type
 * @returns {{ valid: boolean, reason?: string }}
 */
export const validateFieldSize = (value, type = 'generic') => {
  if (typeof value !== 'string') return { valid: true };
  const maxBytes = MAX_FIELD_BYTES[type] ?? MAX_FIELD_BYTES.generic;
  const byteSize = new Blob([value]).size;
  if (byteSize > maxBytes) {
    return {
      valid: false,
      reason: `El campo excede el tamaño máximo permitido (${maxBytes} bytes).`
    };
  }
  return { valid: true };
};

// ── 5. AUDITORÍA INTERNA ─────────────────────────────────────
const MAX_AUDIT_ENTRIES = 50;

const _addAuditEntry = (entry) => {
  try {
    let log = [];
    try {
      log = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIT_LOG) || '[]');
    } catch {
      log = [];
    }
    log.unshift(entry);
    if (log.length > MAX_AUDIT_ENTRIES) log = log.slice(0, MAX_AUDIT_ENTRIES);
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(log));
  } catch {
    // Nunca debe romper el flujo principal
  }
};

/**
 * Devuelve el log de auditoría (solo para vistas de administrador).
 * @returns {Array}
 */
export const getAuditLog = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIT_LOG) || '[]');
  } catch {
    return [];
  }
};

// ── UTILIDAD: Formatear tiempo de bloqueo ────────────────────
/**
 * Convierte milisegundos a formato "MM:SS" para mostrar en pantalla.
 * @param {number} ms
 * @returns {string}
 */
export const formatLockoutTime = (ms) => {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
