# Plan de Seguridad - Metal Shapers Garage

Implementación de capas de seguridad defensivas en el frontend para proteger datos, prevenir abuso y limitar ataques comunes en una app React + Firebase.

## Amenazas a Mitigar

| Amenaza | Riesgo Actual | Solución Propuesta |
|---|---|---|
| Fuerza bruta en login | Alto — sin límite de intentos | Rate limiter + bloqueo temporal |
| XSS (Cross-Site Scripting) | Medio — inputs sin sanitizar | Sanitización antes de guardar |
| Datos inválidos / oversized | Alto — sin validación de tamaño | Validadores en cada servicio |
| Contraseña hardcodeada `admin123` | Crítico | Eliminar completamente |
| `defaultUsers` referenciado pero borrado | Error de código | Limpiar referencias huérfanas |
| Logs con datos sensibles en consola | Medio | Remover console.log en prod |
| LocalStorage sin cifrado básico | Medio | Agregar capa de ofuscación |
| Búsquedas de clientes sin throttle | Medio | Rate limiter para búsquedas |

## Proposed Changes

### Módulo de Seguridad Nuevo

#### [NEW] `src/config/security.js`
Módulo centralizado con todas las funciones de seguridad:
- **Rate Limiter**: Máximo 5 intentos de login en 15 minutos → bloqueo de 30 min
- **Input Sanitizer**: Elimina `<script>`, HTML tags, caracteres de control y limita longitud
- **Search Throttle**: Máximo 10 búsquedas por minuto desde el portal público  
- **Data Size Validator**: Rechaza strings que excedan límites aceptables
- **Audit Logger**: Registra en localStorage intentos fallidos de login con IP aproximada

---

### Autenticación

#### [MODIFY] `src/config/dbService.js`
- Eliminar la contraseña hardcodeada `admin123` del fallback de login
- Eliminar referencias huérfanas a `defaultUsers` en `getUsersList()`
- Integrar `checkRateLimit()` y `recordFailedAttempt()` antes de autenticar
- Agregar validación de longitud en email y password antes de enviar a Firebase
- Remover `console.log` con datos de usuarios en producción

#### [MODIFY] `src/views/Login.jsx`
- Integrar rate limiter visual: mostrar tiempo restante de bloqueo
- Agregar `autocomplete="off"` en producción para evitar exposición de credenciales guardadas
- Sanitizar inputs antes del submit

---

### Portal Público (ClientTracking)

#### [MODIFY] `src/views/ClientTracking.jsx`  
- Integrar `checkSearchThrottle()` antes de cada búsqueda de vehículo
- Sanitizar el término de búsqueda antes de enviarlo a Firestore
- Limitar comentarios de clientes: mínimo 10 caracteres, máximo 800

## Verification Plan

### Manual
- Probar 6 intentos de login fallidos y verificar bloqueo de 30 min
- Intentar pegar `<script>alert('xss')</script>` en un campo de texto
- Hacer 11 búsquedas rápidas y verificar que la 11 sea bloqueada
