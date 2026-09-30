import React from 'react';
import { Loader2, Wrench, Sparkles } from 'lucide-react';

/**
 * Modern High-Tech Shimmer Skeleton Row for Tables
 */
export const TableSkeleton = ({ rows = 5, columns = 6, height = 48 }) => {
  return (
    <div className="skeleton-table-wrapper">
      <div className="skeleton-table-header">
        {Array.from({ length: columns }).map((_, i) => (
          <div 
            key={i} 
            className="skeleton-shimmer skeleton-header-cell"
            style={{ 
              width: i === 0 ? '15%' : i === 1 ? '30%' : `${65 / (columns - 2)}%`,
              height: '24px'
            }} 
          />
        ))}
      </div>
      <div className="skeleton-table-body">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div 
            key={rowIdx} 
            className="skeleton-table-row" 
            style={{ height: `${height}px`, animationDelay: `${rowIdx * 0.08}s` }}
          >
            {Array.from({ length: columns }).map((_, colIdx) => (
              <div
                key={colIdx}
                className="skeleton-shimmer skeleton-cell"
                style={{
                  width: colIdx === 0 ? '60%' : colIdx === 1 ? '85%' : '70%',
                  height: '18px',
                  borderRadius: '6px'
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Modern Card Grid Skeleton for Vehicle Cards and Grid Views
 */
export const CardGridSkeleton = ({ count = 6 }) => {
  return (
    <div className="skeleton-cards-grid">
      {Array.from({ length: count }).map((_, idx) => (
        <div 
          key={idx} 
          className="skeleton-card glass-panel"
          style={{ animationDelay: `${idx * 0.06}s` }}
        >
          {/* Card Media Header */}
          <div className="skeleton-shimmer skeleton-card-media" />
          
          {/* Card Body */}
          <div className="skeleton-card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div className="skeleton-shimmer" style={{ width: '45%', height: '22px', borderRadius: '6px' }} />
              <div className="skeleton-shimmer" style={{ width: '25%', height: '20px', borderRadius: '12px' }} />
            </div>

            <div className="skeleton-shimmer" style={{ width: '70%', height: '16px', borderRadius: '4px', marginBottom: '8px' }} />
            <div className="skeleton-shimmer" style={{ width: '50%', height: '14px', borderRadius: '4px', marginBottom: '16px' }} />

            {/* Progress / Status Bar Skeleton */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div className="skeleton-shimmer" style={{ width: '30%', height: '12px', borderRadius: '4px' }} />
                <div className="skeleton-shimmer" style={{ width: '15%', height: '12px', borderRadius: '4px' }} />
              </div>
              <div className="skeleton-shimmer" style={{ width: '100%', height: '8px', borderRadius: '4px' }} />
            </div>

            {/* Footer tags */}
            <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div className="skeleton-shimmer" style={{ width: '30%', height: '24px', borderRadius: '6px' }} />
              <div className="skeleton-shimmer" style={{ width: '40%', height: '24px', borderRadius: '6px' }} />
              <div className="skeleton-shimmer" style={{ width: '20%', height: '24px', borderRadius: '6px', marginLeft: 'auto' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Metric/KPI Stat Cards Skeleton
 */
export const StatsGridSkeleton = ({ count = 4 }) => {
  return (
    <div className="stats-grid skeleton-stats-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className="glass-panel stat-card skeleton-stat-card"
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          <div className="skeleton-shimmer skeleton-stat-icon" />
          <div style={{ flex: 1 }}>
            <div className="skeleton-shimmer" style={{ width: '50%', height: '12px', borderRadius: '4px', marginBottom: '8px' }} />
            <div className="skeleton-shimmer" style={{ width: '75%', height: '26px', borderRadius: '6px', marginBottom: '6px' }} />
            <div className="skeleton-shimmer" style={{ width: '35%', height: '10px', borderRadius: '4px' }} />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Full Module Layout Skeleton (Page Header + Stats + Search Filters + Table or Cards)
 */
export const ModuleLoader = ({ 
  title = 'Cargando módulo...', 
  subtitle = 'Sincronizando datos con el servidor en tiempo real...',
  type = 'table', // 'table' | 'cards' | 'stats-only'
  showStats = true,
  statsCount = 4,
  tableRows = 6,
  tableCols = 6,
  cardCount = 6
}) => {
  return (
    <div className="module-loader-container animate-fade-in">
      {/* Module Header Skeleton */}
      <div className="module-loader-header">
        <div>
          <div className="module-loader-title-row">
            <div className="skeleton-shimmer" style={{ width: '220px', height: '32px', borderRadius: '8px' }} />
            <span className="live-sync-badge">
              <span className="live-sync-dot"></span>
              Sincronizando
            </span>
          </div>
          <div className="skeleton-shimmer" style={{ width: '340px', height: '16px', borderRadius: '4px', marginTop: '10px' }} />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="skeleton-shimmer" style={{ width: '100px', height: '40px', borderRadius: '10px' }} />
          <div className="skeleton-shimmer" style={{ width: '140px', height: '40px', borderRadius: '10px' }} />
        </div>
      </div>

      {/* KPI Stats Skeleton */}
      {showStats && <StatsGridSkeleton count={statsCount} />}

      {/* Filter / Search Bar Skeleton */}
      <div className="module-loader-filters glass-panel">
        <div className="skeleton-shimmer" style={{ flex: 1, minWidth: '220px', height: '42px', borderRadius: '10px' }} />
        <div className="skeleton-shimmer" style={{ width: '160px', height: '42px', borderRadius: '10px' }} />
        <div className="skeleton-shimmer" style={{ width: '160px', height: '42px', borderRadius: '10px' }} />
      </div>

      {/* Main Content Skeleton */}
      {type === 'cards' ? (
        <CardGridSkeleton count={cardCount} />
      ) : (
        <div className="glass-panel" style={{ padding: '1rem', overflow: 'hidden' }}>
          <TableSkeleton rows={tableRows} columns={tableCols} />
        </div>
      )}
    </div>
  );
};

/**
 * Detail Modal / Drawer Skeleton Loader
 */
export const DetailModalSkeleton = ({ title = 'Cargando información...' }) => {
  return (
    <div className="detail-modal-skeleton animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div className="skeleton-shimmer" style={{ width: '48px', height: '48px', borderRadius: '12px' }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton-shimmer" style={{ width: '60%', height: '24px', borderRadius: '6px', marginBottom: '8px' }} />
          <div className="skeleton-shimmer" style={{ width: '40%', height: '14px', borderRadius: '4px' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div className="skeleton-shimmer glass-panel" style={{ height: '80px', borderRadius: '12px' }} />
        <div className="skeleton-shimmer glass-panel" style={{ height: '80px', borderRadius: '12px' }} />
        <div className="skeleton-shimmer glass-panel" style={{ height: '80px', borderRadius: '12px' }} />
      </div>

      <div className="skeleton-shimmer glass-panel" style={{ height: '220px', borderRadius: '16px', marginBottom: '16px' }} />
      <div className="skeleton-shimmer glass-panel" style={{ height: '140px', borderRadius: '16px' }} />
    </div>
  );
};

/**
 * App Initial Splash / Booting Screen Loader
 */
export const AppSplashLoader = ({ 
  title = 'Iniciando Sistema de Almacén', 
  subtitle = 'Conectando con base de datos y optimizando caché...' 
}) => {
  return (
    <div className="app-splash-container">
      <div className="app-splash-card glass-panel">
        <div className="app-splash-logo-glow">
          <div className="splash-orbital-ring"></div>
          <div className="splash-orbital-ring-reverse"></div>
          <div className="splash-logo-icon">
            <Wrench size={38} className="splash-wrench-icon" />
          </div>
        </div>

        <h2 className="app-splash-title">
          <span>Metal Shapers</span>
        </h2>
        <div className="app-splash-badge">
          <Sparkles size={14} />
          <span>Almacén & Taller Pro</span>
        </div>

        <div className="app-splash-status">
          <Loader2 size={18} className="spinner-rotate" />
          <span>{title}</span>
        </div>
        <p className="app-splash-subtitle">{subtitle}</p>

        {/* High-tech Glowing Progress Bar */}
        <div className="app-splash-progress-track">
          <div className="app-splash-progress-bar"></div>
        </div>
      </div>
    </div>
  );
};

/**
 * Compact Glowing Spinner for inside buttons or small areas
 */
export const LoadingSpinner = ({ size = 20, text = '', color = 'var(--primary)' }) => {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color }}>
      <Loader2 size={size} className="spinner-rotate" />
      {text && <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{text}</span>}
    </div>
  );
};

export default ModuleLoader;
