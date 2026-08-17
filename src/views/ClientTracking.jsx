import React, { useState, useEffect } from 'react';
import {
  Search, Wrench, Car, Truck, Bike, Calendar, ShieldCheck,
  Clock, CheckCircle2, AlertCircle, MessageSquare, Send, User,
  Phone, ArrowLeft, Package, FileText, ChevronRight, CheckCircle, Hammer, Cog, Info, RefreshCw, LogIn, Camera, ShieldAlert
} from 'lucide-react';
import {
  searchVehicleForClient,
  getVehicleUpdates,
  getVehicleComments,
  addVehicleComment
} from '../config/dbService';
import { checkSearchThrottle, sanitizeInput } from '../config/security';

const PROCESS_LABELS = {
  pendiente: 'Pendiente',
  en_proceso: 'En Proceso',
  terminado: 'Terminado / Listo'
};

const PROCESS_BADGES = {
  pendiente: 'badge-warning',
  en_proceso: 'badge-info',
  terminado: 'badge-success'
};

const ClientTracking = ({ onBackToLogin }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [vehicle, setVehicle] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [updates, setUpdates] = useState([]);
  const [comments, setComments] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState({});

  // Form states for new comment
  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentSuccess, setCommentSuccess] = useState('');
  const [commentError, setCommentError] = useState('');

  const [searchThrottled, setSearchThrottled] = useState(false);

  // Perform search
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    // ── Seguridad: Throttle de búsquedas ──
    const throttle = checkSearchThrottle();
    if (!throttle.allowed) {
      setSearchThrottled(true);
      // Desbloquear después de 60 segundos
      setTimeout(() => setSearchThrottled(false), 60_000);
      return;
    }
    setSearchThrottled(false);

    // Sanitizar el término de búsqueda
    const cleanQuery = sanitizeInput(searchQuery, 'plate');
    if (!cleanQuery) return;

    setSearching(true);
    setHasSearched(true);
    setCommentSuccess('');
    setCommentError('');

    try {
      const found = await searchVehicleForClient(cleanQuery);
      setVehicle(found);

      if (found) {
        setLoadingDetails(true);
        const [updatesData, commentsData] = await Promise.all([
          getVehicleUpdates(found.folio),
          getVehicleComments(found.folio)
        ]);
        setUpdates(updatesData);
        setComments(commentsData);
        setLoadingDetails(false);
      } else {
        setUpdates([]);
        setComments([]);
      }
    } catch (err) {
      setVehicle(null);
    } finally {
      setSearching(false);
    }
  };

  const handleQuickSearch = (term) => {
    // Sanitizar término de búsqueda rápida
    const cleanTerm = sanitizeInput(term, 'plate');
    if (!cleanTerm) return;

    const throttle = checkSearchThrottle();
    if (!throttle.allowed) {
      setSearchThrottled(true);
      setTimeout(() => setSearchThrottled(false), 60_000);
      return;
    }

    setSearchQuery(cleanTerm);
    setSearching(true);
    setHasSearched(true);
    searchVehicleForClient(cleanTerm).then(async (found) => {
      setVehicle(found);
      if (found) {
        setLoadingDetails(true);
        const [updatesData, commentsData] = await Promise.all([
          getVehicleUpdates(found.folio),
          getVehicleComments(found.folio)
        ]);
        setUpdates(updatesData);
        setComments(commentsData);
        setLoadingDetails(false);
      }
      setSearching(false);
    });
  };

  // Submit comment
  const handleSendComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !clientName.trim() || !vehicle) return;

    // ── Seguridad: Sanitizar campos del comentario ──
    const cleanName    = sanitizeInput(clientName,    'name');
    const cleanContact = sanitizeInput(clientContact, 'generic');
    const cleanText    = sanitizeInput(commentText,   'text');

    if (!cleanName || !cleanText) return;
    if (cleanText.length < 5) {
      setCommentError('El comentario debe tener al menos 5 caracteres.');
      return;
    }

    setSubmittingComment(true);
    setCommentSuccess('');
    setCommentError('');

    try {
      const newComment = await addVehicleComment({
        vehicleFolio: vehicle.folio,
        authorName:   cleanName,
        authorRole:   'cliente',
        contact:      cleanContact,
        text:         cleanText
      });

      setComments(prev => [newComment, ...prev]);
      setCommentText('');
      setCommentSuccess('¡Tu comentario fue enviado con éxito! El equipo del taller revisará tu mensaje.');
      setTimeout(() => setCommentSuccess(''), 6000);
    } catch (err) {
      setCommentError('Ocurrió un error al enviar el comentario. Inténtalo nuevamente.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const getVehicleIcon = (type) => {
    switch (type) {
      case 'Tracto': return <Truck size={28} className="text-primary" />;
      case 'Motocicleta': return <Bike size={28} className="text-primary" />;
      default: return <Car size={28} className="text-primary" />;
    }
  };

  // Calculate overall progress stage (0 to 100%)
  const calculateOverallProgress = (v) => {
    if (!v) return 0;
    // Use the precise slider value saved by the workshop if available
    if (typeof v.serviceProgress === 'number') return v.serviceProgress;
    // Legacy fallback: derive from status fields
    if (v.deliveredAt || (v.bodyworkStatus === 'terminado' && v.mechanicsStatus === 'terminado')) {
      return 100;
    }
    let score = 25; // Admission done
    if (v.bodyworkStatus === 'en_proceso') score += 20;
    if (v.bodyworkStatus === 'terminado') score += 35;
    if (v.mechanicsStatus === 'en_proceso') score += 15;
    if (v.mechanicsStatus === 'terminado') score += 25;
    return Math.min(score, 95);
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: '#0b0f19',
      color: '#f8fafc',
      fontFamily: 'var(--font-sans)',
      paddingBottom: '3rem'
    }}>
      {/* Lightbox Modal */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1.5rem',
            cursor: 'pointer'
          }}
        >
          <button
            onClick={() => setLightboxSrc(null)}
            style={{
              position: 'absolute',
              top: '1.5rem',
              right: '1.5rem',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              color: '#fff',
              fontSize: '1.2rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
          <img
            src={lightboxSrc}
            alt="Foto bitácora ampliada"
            style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Top Header Bar */}
      <header style={{
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '1rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
            padding: '8px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}>
            <Wrench size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #00d2ff, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Metal Shapers Garage
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>Portal de Consulta de Estado de Vehículos</p>
          </div>
        </div>

        {onBackToLogin && (
          <button
            onClick={onBackToLogin}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', fontWeight: 600, padding: '0.5rem 1rem' }}
          >
            <LogIn size={16} />
            <span>Iniciar Sesión</span>
          </button>
        )}
      </header>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Search Hero Section */}
        <div className="glass-panel" style={{ padding: '2.5rem 2rem', textAlign: 'center', marginBottom: '2rem', borderRadius: '20px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(0, 210, 255, 0.1)',
            border: '1px solid rgba(0, 210, 255, 0.25)',
            padding: '0.35rem 1rem',
            borderRadius: '20px',
            color: 'var(--primary)',
            fontSize: '0.82rem',
            fontWeight: 600,
            marginBottom: '1rem'
          }}>
            <ShieldCheck size={16} />
            Rastreo en Tiempo Real sin Iniciar Sesión
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            ¿En qué proceso está tu vehículo?
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', maxWidth: '600px', margin: '0 auto 1.5rem' }}>
            Ingresa tu <strong>Número de Placa</strong> o <strong>Número de Orden / Folio</strong> para ver los avances, refacciones y dejar tus observaciones.
          </p>

          <form onSubmit={handleSearch} style={{ maxWidth: '650px', margin: '0 auto', display: 'flex', gap: '0.75rem', position: 'relative' }}>
            <div style={{ position: 'relative', flexGrow: 1 }}>
              <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                className="input-field"
                placeholder="Ejemplo: XYZ-123-A  ó  ORD-2026-001  ó  V-1001"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={searchThrottled}
                maxLength={50}
                style={{
                  paddingLeft: '3rem',
                  fontSize: '1.05rem',
                  height: '52px',
                  borderRadius: '12px',
                  border: searchThrottled
                    ? '1px solid rgba(220, 38, 38, 0.4)'
                    : '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(15, 23, 42, 0.9)'
                }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={searching || searchThrottled}
              style={{
                height: '52px',
                padding: '0 1.75rem',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {searching ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Buscando...</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span>Consultar</span>
                </>
              )}
            </button>
          </form>

          {/* Aviso de throttle de búsquedas */}
          {searchThrottled && (
            <div style={{
              maxWidth: '650px',
              margin: '0.75rem auto 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: '10px',
              padding: '0.6rem 1rem',
              fontSize: '0.83rem',
              color: '#fca5a5'
            }}>
              <ShieldAlert size={16} style={{ flexShrink: 0 }} />
              Demasiadas búsquedas en poco tiempo. Por favor espera unos segundos antes de intentar nuevamente.
            </div>
          )}

          {/* Quick suggestions for testing */}
        </div>

        {/* Not Found State */}
        {hasSearched && !searching && !vehicle && (
          <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', borderRadius: '16px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              color: '#ef4444'
            }}>
              <AlertCircle size={32} />
            </div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No se encontró ningún vehículo</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto' }}>
              No localizamos un registro activo con el término <strong style={{ color: '#fff' }}>"{searchQuery}"</strong>. Por favor verifica que la placa o número de orden esté escrito correctamente.
            </p>
          </div>
        )}

        {/* Vehicle Found View */}
        {vehicle && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header Card */}
            <div className="glass-panel" style={{ padding: '1.75rem', borderRadius: '16px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '14px',
                    background: 'rgba(0, 210, 255, 0.12)',
                    border: '1px solid rgba(0, 210, 255, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {getVehicleIcon(vehicle.type)}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>{vehicle.model}</h2>
                      <span className={`badge ${vehicle.active ? 'badge-success' : 'badge-danger'}`}>
                        {vehicle.active ? 'En Taller / Activo' : 'Entregado'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.4rem', color: '#94a3b8', fontSize: '0.88rem', flexWrap: 'wrap' }}>
                      <span><strong>Placa:</strong> <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{vehicle.plate}</span></span>
                      <span><strong>Orden / Folio:</strong> {vehicle.orderNumber || vehicle.folio}</span>
                      <span><strong>Tipo:</strong> {vehicle.type}</span>
                      {vehicle.entryDate && (
                        <span><strong>Ingreso:</strong> {new Date(vehicle.entryDate).toLocaleDateString('es-MX')}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block' }}>Estado Global</span>
                  <span className={`badge ${vehicle.deliveredAt ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '0.95rem', padding: '0.4rem 0.9rem', marginTop: '4px' }}>
                    {vehicle.deliveredAt ? '✓ Vehículo Entregado' : '⚡ En Servicio'}
                  </span>
                </div>
              </div>

              {/* General details note */}
              {vehicle.details && (
                <div style={{
                  marginTop: '1.25rem',
                  padding: '1rem',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  borderLeft: '4px solid var(--primary)',
                  fontSize: '0.9rem',
                  color: '#cbd5e1'
                }}>
                  <strong style={{ color: '#fff', display: 'block', marginBottom: '4px' }}>Motivo de Ingreso / Trabajos solicitados:</strong>
                  {vehicle.details}
                </div>
              )}
            </div>

            {/* Reception Photos / Cómo llegó el vehículo (Visible si showInitialPhotosToClient !== false) */}
            {vehicle.showInitialPhotosToClient !== false && (vehicle.imageUrls || []).length > 0 && (
              <div className="glass-panel" style={{ padding: '1.75rem', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Camera size={20} className="text-primary" />
                  Fotografías de Recepción (Cómo llegó el vehículo)
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  Registro fotográfico inicial al momento del ingreso al taller. Haz clic en cualquier imagen para verla en tamaño completo.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem' }}>
                  {vehicle.imageUrls.map((url, i) => (
                    <div
                      key={i}
                      onClick={() => setLightboxSrc(url)}
                      style={{
                        position: 'relative',
                        aspectRatio: '4/3',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                        background: 'rgba(15, 23, 42, 0.5)'
                      }}
                    >
                      <img
                        src={url}
                        alt={`Foto recepción ${i + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.2s' }}
                      />
                      <span style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.65)', borderRadius: '6px', padding: '2px 6px', fontSize: '0.7rem', color: '#fff' }}>
                        Foto {i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overall Progress Tracker / Process Bar */}
            <div className="glass-panel" style={{ padding: '1.75rem', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <Clock size={20} className="text-primary" />
                  Avance General del Servicio
                </h3>
              </div>

              {/* Progress Bar Container */}
              {(() => {
                const pct = calculateOverallProgress(vehicle);
                const barColor = pct < 40
                  ? 'linear-gradient(90deg, #ef4444, #f59e0b)'
                  : pct < 75
                  ? 'linear-gradient(90deg, #3b82f6, #00d2ff)'
                  : 'linear-gradient(90deg, #00d2ff, #10b981)';
                const textColor = pct < 40 ? '#ef4444' : pct < 75 ? '#3b82f6' : '#10b981';
                const statusLabel = pct === 0 ? 'Sin iniciar'
                  : pct < 25 ? 'Diagnóstico'
                  : pct < 50 ? 'En proceso inicial'
                  : pct < 75 ? 'Avance intermedio'
                  : pct < 100 ? 'Casi terminado'
                  : 'Terminado ✓';
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{statusLabel}</span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: textColor, transition: 'color 0.3s' }}>{pct}%</span>
                    </div>
                    <div style={{ width: '100%', height: '12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '6px', overflow: 'hidden', marginBottom: '2rem' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: barColor,
                        borderRadius: '6px',
                        transition: 'width 0.6s ease'
                      }} />
                    </div>
                  </>
                );
              })()}

             

              {/* Ordered Parts Status (Visible si showPartsToClient !== false) */}
              {vehicle.showPartsToClient !== false && vehicle.orderedParts && vehicle.orderedParts.length > 0 && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Package size={16} className="text-primary" />
                    Estado de Refacciones Pedidas para este Vehículo:
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {vehicle.orderedParts.map((part, idx) => (
                      <div key={part.id || idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(15, 23, 42, 0.5)',
                        padding: '0.65rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem'
                      }}>
                        <div>
                          <strong style={{ color: '#f8fafc' }}>{part.name}</strong>
                          {part.supplier && <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>({part.supplier})</span>}
                        </div>
                        <span className={`badge ${part.status === 'recibido' ? 'badge-success' : part.status === 'pedido' ? 'badge-info' : 'badge-warning'}`}>
                          {part.status === 'recibido' ? '✓ Recibido en Taller' : part.status === 'pedido' ? '📦 Pedido al Proveedor' : 'Pendiente por solicitar'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Timeline / Bitácora Section */}
            <div className="glass-panel" style={{ padding: '1.75rem', borderRadius: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={20} className="text-primary" />
                Bitácora de Actualizaciones del Taller
              </h3>

              {(() => {
                // Filter out hidden folders and entries (publicVisible !== false)
                const visibleUpdates = updates.filter(u => u.publicVisible !== false);
                const folders = visibleUpdates.filter(u => u.type === 'folder');
                const legacyEntries = visibleUpdates.filter(u => !u.type || u.type === 'update');
                const orphanEntries = visibleUpdates.filter(u => u.type === 'entry' && (!u.folderId || !folders.some(f => f.id === u.folderId)));

                if (loadingDetails) {
                  return <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Cargando bitácora...</p>;
                }

                if (folders.length === 0 && legacyEntries.length === 0 && orphanEntries.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                      <Info size={28} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>No hay notas de bitácora disponibles para este vehículo por el momento.</p>
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Folders & Folder Entries */}
                    {folders.map(folder => {
                      const folderEntries = visibleUpdates.filter(u => u.type === 'entry' && u.folderId === folder.id);
                      const isExpanded = expandedFolderIds[folder.id] !== false; // Default expanded so clients see everything

                      return (
                        <div key={folder.id} style={{
                          background: 'rgba(15, 23, 42, 0.65)',
                          border: '1px solid rgba(0, 210, 255, 0.2)',
                          borderRadius: '14px',
                          overflow: 'hidden'
                        }}>
                          {/* Folder Header */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '1rem 1.25rem',
                              cursor: 'pointer',
                              background: isExpanded ? 'rgba(0, 210, 255, 0.06)' : 'transparent',
                              borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none'
                            }}
                            onClick={() => setExpandedFolderIds(prev => ({ ...prev, [folder.id]: !isExpanded }))}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{isExpanded ? '📂' : '📁'}</span>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{folder.name}</div>
                                {folder.description && (
                                  <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.15rem' }}>{folder.description}</div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', borderRadius: '20px', padding: '0.2rem 0.6rem' }}>
                                {folderEntries.length} {folderEntries.length === 1 ? 'avance' : 'avances'}
                              </span>
                              <ChevronRight size={18} style={{ color: '#94a3b8', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                            </div>
                          </div>

                          {/* Folder Entries */}
                          {isExpanded && (
                            <div style={{ padding: '1.25rem' }}>
                              {folderEntries.length === 0 ? (
                                <p style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>Sin avances registrados en esta etapa.</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  {folderEntries.map(entry => (
                                    <div key={entry.id} style={{
                                      background: 'rgba(15, 23, 42, 0.5)',
                                      border: '1px solid rgba(255, 255, 255, 0.06)',
                                      borderRadius: '10px',
                                      padding: '1rem'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600 }}>
                                          {entry.createdAt ? new Date(entry.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                                        </span>
                                        {entry.createdBy && (
                                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                            Técnico: {entry.createdBy}
                                          </span>
                                        )}
                                      </div>
                                      <p style={{ fontSize: '0.9rem', color: '#f1f5f9', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                                        {entry.note}
                                      </p>
                                      {entry.photos && entry.photos.length > 0 && (
                                        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                                          {entry.photos.map((photo, i) => (
                                            <img
                                              key={i}
                                              src={photo}
                                              alt={`Foto ${i + 1}`}
                                              onClick={() => setLightboxSrc(photo)}
                                              style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.15)', cursor: 'pointer', transition: 'transform 0.15s ease' }}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Orphan or Legacy Entries */}
                    {(legacyEntries.length > 0 || orphanEntries.length > 0) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                        {[...orphanEntries, ...legacyEntries].map(upd => (
                          <div key={upd.id} style={{
                            background: 'rgba(15, 23, 42, 0.6)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '12px',
                            padding: '1.25rem'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600 }}>
                                {upd.createdAt ? new Date(upd.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Fecha no especificada'}
                              </span>
                              {(upd.createdBy || upd.technicianName) && (
                                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                  Por: {upd.createdBy || upd.technicianName}
                                </span>
                              )}
                            </div>
                            {upd.note && (
                              <p style={{ fontSize: '0.9rem', color: '#f8fafc', marginBottom: '0.5rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                {upd.note}
                              </p>
                            )}
                            {upd.generalNote && (
                              <p style={{ fontSize: '0.9rem', color: '#f8fafc', marginBottom: '0.5rem', lineHeight: '1.5' }}>
                                {upd.generalNote}
                              </p>
                            )}
                            {upd.bodyworkNote && (
                              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                                <strong style={{ color: 'var(--warning)' }}>Hojalatería:</strong> {upd.bodyworkNote}
                              </div>
                            )}
                            {upd.mechanicsNote && (
                              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                                <strong style={{ color: 'var(--primary)' }}>Mecánica:</strong> {upd.mechanicsNote}
                              </div>
                            )}
                            {((upd.photos && upd.photos.length > 0) || (upd.photosAdded && upd.photosAdded.length > 0)) && (
                              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                                {(upd.photos || upd.photosAdded || []).map((photo, i) => (
                                  <img
                                    key={i}
                                    src={photo}
                                    alt="Avance taller"
                                    onClick={() => setLightboxSrc(photo)}
                                    style={{ width: '85px', height: '85px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.15)', cursor: 'pointer' }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Client Comments & Feedback Section */}
            <div className="glass-panel" style={{ padding: '1.75rem', borderRadius: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquare size={20} className="text-primary" />
                Sección de Comentarios y Mensajes para el Taller
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginBottom: '1.5rem' }}>
                ¿Tienes dudas sobre los trabajos, repuestos o tiempo estimado? Déjanos un mensaje aquí y nuestro equipo técnico te responderá a la brevedad.
              </p>

              {/* Form */}
              <form onSubmit={handleSendComment} style={{ marginBottom: '2rem', background: 'rgba(15, 23, 42, 0.8)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                {commentSuccess && (
                  <div className="badge badge-success" style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle size={16} />
                    {commentSuccess}
                  </div>
                )}
                {commentError && (
                  <div className="badge badge-danger" style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem', fontSize: '0.85rem' }}>
                    {commentError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.4rem', fontWeight: 500 }}>
                      Tu Nombre <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Ej. Juan Alarcón"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        style={{ paddingLeft: '2.5rem' }}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.4rem', fontWeight: 500 }}>
                      Teléfono o Correo de Contacto (Opcional)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Ej. 555-0192 o cliente@email.com"
                        value={clientContact}
                        onChange={(e) => setClientContact(e.target.value)}
                        style={{ paddingLeft: '2.5rem' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.4rem', fontWeight: 500 }}>
                    Tu Comentario u Observación <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <textarea
                    className="input-field"
                    rows={3}
                    placeholder="Escribe aquí tus preguntas, sugerencias o especificaciones sobre tu vehículo..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submittingComment}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
                  >
                    {submittingComment ? (
                      <>Enviando...</>
                    ) : (
                      <>
                        <Send size={16} />
                        Enviar Comentario
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* History of Comments */}
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem', color: '#cbd5e1' }}>
                Historial de Mensajes ({comments.length})
              </h4>

              {comments.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.88rem', fontStyle: 'italic' }}>
                  Aún no hay comentarios en este vehículo. ¡Sé el primero en dejar un mensaje!
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {comments.map((com) => (
                    <div key={com.id} style={{
                      padding: '1rem 1.25rem',
                      borderRadius: '12px',
                      background: com.authorRole === 'taller' ? 'rgba(0, 210, 255, 0.08)' : 'rgba(15, 23, 42, 0.6)',
                      border: com.authorRole === 'taller' ? '1px solid rgba(0, 210, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)',
                      marginLeft: com.authorRole === 'taller' ? '1.5rem' : '0'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ color: com.authorRole === 'taller' ? 'var(--primary)' : '#fff', fontSize: '0.9rem' }}>
                            {com.authorName}
                          </strong>
                          <span className={`badge ${com.authorRole === 'taller' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: '0.72rem', padding: '2px 7px' }}>
                            {com.authorRole === 'taller' ? 'Respuesta del Taller' : 'Cliente'}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {com.createdAt ? new Date(com.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.88rem', color: '#e2e8f0', margin: 0, lineHeight: '1.45' }}>
                        {com.text}
                      </p>
                      {com.contact && (
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                          Contacto proporcionado: {com.contact}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientTracking;
