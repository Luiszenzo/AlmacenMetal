import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Calendar, User, Package, Car, ArrowUpRight, ChevronDown } from 'lucide-react';
import { getOutgoingsList, registerOutgoing, getInventoryList, getVehiclesList, getUsersList } from '../config/dbService';

const Outgoings = ({ currentUser }) => {
  const [outgoings, setOutgoings] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [materialId, setMaterialId] = useState('');
  const [vehicleFolio, setVehicleFolio] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [date, setDate] = useState('');

  // Searchable dropdown state
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialOpen, setMaterialOpen] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleOpen, setVehicleOpen] = useState(false);

  const materialRef = useRef(null);
  const vehicleRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (materialRef.current && !materialRef.current.contains(e.target)) setMaterialOpen(false);
      if (vehicleRef.current && !vehicleRef.current.contains(e.target)) setVehicleOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isEditable = currentUser?.role === 'admin' || currentUser?.role === 'encargado';

  const loadAllData = async () => {
    setLoading(true);
    try {
      const outList = await getOutgoingsList();
      const invList = await getInventoryList();
      const vehList = await getVehiclesList();
      const usrList = await getUsersList();
      
      setOutgoings(outList);
      setInventory(invList);
      setVehicles(vehList.filter(v => v.active)); // Only active vehicles can receive parts
      setTechnicians(usrList.filter(u => u.role === 'tecnico' && u.active));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleOpenAdd = () => {
    setMaterialId('');
    setMaterialSearch('');
    setVehicleFolio('');
    setVehicleSearch('');
    setTechnicianId('');
    setQuantity(1);
    setDate(new Date().toISOString().slice(0, 16)); // Current local time
    setError('');
    setSuccess('');
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!materialId || !vehicleFolio || !technicianId || quantity <= 0) {
      setError('Por favor complete todos los campos y use una cantidad válida.');
      return;
    }

    const material = inventory.find(i => i.id === materialId);
    if (!material) {
      setError('Material seleccionado no válido.');
      return;
    }

    if (material.quantity < quantity) {
      setError(`Stock insuficiente. Solo quedan ${material.quantity} unidades de ${material.name}.`);
      return;
    }

    const vehicle = vehicles.find(v => v.folio === vehicleFolio);
    const tech = technicians.find(u => u.uid === technicianId);

    try {
      await registerOutgoing({
        materialId,
        materialName: material.name,
        quantity: parseInt(quantity),
        technicianId,
        technicianName: tech ? tech.name : 'Técnico',
        vehicleFolio,
        date: new Date(date).toISOString(),
        costPerUnit: material.cost,
        totalCost: material.cost * parseInt(quantity)
      });

      setSuccess('Salida registrada exitosamente.');
      loadAllData();
      setTimeout(() => {
        setShowAddModal(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Error al guardar la salida.');
    }
  };

  const selectedMaterialObj = inventory.find(i => i.id === materialId);

  const filteredOutgoings = outgoings.filter(out => {
    const term = search.toLowerCase();
    return (
      out.materialName.toLowerCase().includes(term) ||
      out.technicianName.toLowerCase().includes(term) ||
      out.vehicleFolio.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Módulo de Salidas</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Registra y consulta el flujo de salida de materiales entregados a los mecánicos.
          </p>
        </div>
        {isEditable && (
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <Plus size={18} />
            <span>Registrar Salida</span>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="search-filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Buscar por material, técnico o folio de vehículo..." 
            className="input-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          Cargando historial de salidas...
        </div>
      ) : (
        <div className="glass-panel table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Material</th>
                <th style={{ textAlign: 'center' }}>Cantidad</th>
                <th>Técnico</th>
                <th>Vehículo</th>
                <th style={{ textAlign: 'right' }}>Costo Unit (s/IVA)</th>
                <th style={{ textAlign: 'right' }}>Total (c/IVA)</th>
              </tr>
            </thead>
            <tbody>
              {filteredOutgoings.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                    No se han registrado salidas en el sistema.
                  </td>
                </tr>
              ) : (
                filteredOutgoings.map((out) => {
                  const cost = out.costPerUnit || 0;
                  const qty = out.quantity || 0;
                  return (
                    <tr key={out.id}>
                      <td>{new Date(out.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ fontWeight: '600', color: 'white' }}>{out.materialName}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-info" style={{ fontWeight: 'bold' }}>
                          {qty}
                        </span>
                      </td>
                      <td>{out.technicianName}</td>
                      <td style={{ fontWeight: '600', color: 'white' }}>{out.vehicleFolio}</td>
                      <td style={{ textAlign: 'right' }}>${cost.toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#34d399' }}>
                        ${(cost * qty * 1.16).toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Registrar Salida de Material</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            {error && <div className="badge badge-danger" style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem', boxSizing: 'border-box' }}>{error}</div>}
            {success && <div className="badge badge-success" style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem', boxSizing: 'border-box' }}>{success}</div>}

            <form onSubmit={handleSubmit}>
              {/* ── Seleccionar Material (searchable) ── */}
              <div className="form-group" ref={materialRef} style={{ position: 'relative' }}>
                <label>Seleccionar Material *</label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'var(--input-bg, rgba(255,255,255,0.05))',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '8px',
                    padding: '0 0.75rem',
                    cursor: 'text',
                  }}
                  onClick={() => setMaterialOpen(true)}
                >
                  <Search size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder={materialId ? '' : 'Buscar repuesto o material...'}
                    value={materialOpen ? materialSearch : (selectedMaterialObj ? `${selectedMaterialObj.code} - ${selectedMaterialObj.name}` : '')}
                    onChange={(e) => { setMaterialSearch(e.target.value); setMaterialOpen(true); }}
                    onFocus={() => { setMaterialSearch(''); setMaterialOpen(true); }}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      padding: '0.65rem 0',
                    }}
                    autoComplete="off"
                  />
                  <ChevronDown size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0, transform: materialOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>

                {materialOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    zIndex: 999,
                    background: 'var(--panel-bg, #1e2535)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '8px',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}>
                    {inventory
                      .filter(item =>
                        `${item.code} ${item.name}`.toLowerCase().includes(materialSearch.toLowerCase())
                      )
                      .map(item => (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (item.quantity === 0) return;
                            setMaterialId(item.id);
                            setMaterialSearch('');
                            setMaterialOpen(false);
                          }}
                          style={{
                            padding: '0.6rem 0.85rem',
                            cursor: item.quantity === 0 ? 'not-allowed' : 'pointer',
                            opacity: item.quantity === 0 ? 0.45 : 1,
                            borderBottom: '1px solid var(--panel-border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.875rem',
                            background: materialId === item.id ? 'rgba(99,102,241,0.18)' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { if (item.quantity > 0) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = materialId === item.id ? 'rgba(99,102,241,0.18)' : 'transparent'; }}
                        >
                          <span><strong style={{ color: '#a5b4fc' }}>{item.code}</strong> — {item.name}</span>
                          <span style={{ fontSize: '0.78rem', color: item.quantity === 0 ? '#ef4444' : item.quantity <= item.minStock ? '#fbbf24' : '#34d399', marginLeft: '0.5rem', flexShrink: 0 }}>
                            {item.quantity === 0 ? 'SIN STOCK' : `Stock: ${item.quantity}`}
                          </span>
                        </div>
                      ))
                    }
                    {inventory.filter(item =>
                      `${item.code} ${item.name}`.toLowerCase().includes(materialSearch.toLowerCase())
                    ).length === 0 && (
                      <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Sin resultados
                      </div>
                    )}
                  </div>
                )}

                {selectedMaterialObj && (
                  <span style={{ fontSize: '0.8rem', color: selectedMaterialObj.quantity <= selectedMaterialObj.minStock ? '#fbbf24' : '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Stock disponible: {selectedMaterialObj.quantity} unidades | Costo: ${selectedMaterialObj.cost.toFixed(2)}
                  </span>
                )}
              </div>

              {/* ── Vehículo Destino (searchable) ── */}
              <div className="form-group" ref={vehicleRef} style={{ position: 'relative' }}>
                <label>Vehículo Destino (Activos en Taller) *</label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'var(--input-bg, rgba(255,255,255,0.05))',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '8px',
                    padding: '0 0.75rem',
                    cursor: 'text',
                  }}
                  onClick={() => setVehicleOpen(true)}
                >
                  <Search size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder={vehicleFolio ? '' : 'Buscar por folio o placa...'}
                    value={vehicleOpen ? vehicleSearch : (vehicleFolio ? (() => { const v = vehicles.find(v => v.folio === vehicleFolio); return v ? `${v.folio} - ${v.plate} (${v.type})` : vehicleFolio; })() : '')}
                    onChange={(e) => { setVehicleSearch(e.target.value); setVehicleOpen(true); }}
                    onFocus={() => { setVehicleSearch(''); setVehicleOpen(true); }}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      padding: '0.65rem 0',
                    }}
                    autoComplete="off"
                  />
                  <ChevronDown size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0, transform: vehicleOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>

                {vehicleOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    zIndex: 999,
                    background: 'var(--panel-bg, #1e2535)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '8px',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}>
                    {vehicles
                      .filter(v =>
                        `${v.folio} ${v.plate} ${v.type}`.toLowerCase().includes(vehicleSearch.toLowerCase())
                      )
                      .map(v => (
                        <div
                          key={v.folio}
                          onClick={() => {
                            setVehicleFolio(v.folio);
                            setVehicleSearch('');
                            setVehicleOpen(false);
                          }}
                          style={{
                            padding: '0.6rem 0.85rem',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--panel-border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.875rem',
                            background: vehicleFolio === v.folio ? 'rgba(99,102,241,0.18)' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = vehicleFolio === v.folio ? 'rgba(99,102,241,0.18)' : 'transparent'; }}
                        >
                          <span><strong style={{ color: '#a5b4fc' }}>{v.folio}</strong> — {v.plate}</span>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: '0.5rem' }}>{v.type}</span>
                        </div>
                      ))
                    }
                    {vehicles.filter(v =>
                      `${v.folio} ${v.plate} ${v.type}`.toLowerCase().includes(vehicleSearch.toLowerCase())
                    ).length === 0 && (
                      <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Sin resultados
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Técnico Solicitante *</label>
                <select 
                  className="select-field" 
                  value={technicianId} 
                  onChange={(e) => setTechnicianId(e.target.value)}
                  required
                >
                  <option value="">-- Selecciona el Técnico --</option>
                  {technicians.map(t => (
                    <option key={t.uid} value={t.uid}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Cantidad a Entregar *</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    value={quantity} 
                    onChange={(e) => setQuantity(e.target.value)}
                    min={1}
                    max={selectedMaterialObj ? selectedMaterialObj.quantity : undefined}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Fecha y Hora *</label>
                  <input 
                    type="datetime-local" 
                    className="input-field" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {selectedMaterialObj && quantity > 0 && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span>Subtotal (Sin IVA):</span>
                    <span>${(selectedMaterialObj.cost * quantity).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#34d399' }}>
                    <span>Total de la Salida (Con IVA 16%):</span>
                    <span>${(selectedMaterialObj.cost * quantity * 1.16).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={!selectedMaterialObj || selectedMaterialObj.quantity < quantity}>
                  Registrar Salida
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Outgoings;
