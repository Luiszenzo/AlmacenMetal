import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Calendar, User, Package, Car, ArrowUpRight, ChevronDown, Layers, Droplet, Scale, Ruler, Box } from 'lucide-react';
import { getOutgoingsList, registerOutgoing, getInventoryList, getVehiclesList, getUsersList } from '../config/dbService';
import { formatStockDisplay } from './Inventory';

const formatOutgoingQty = (out) => {
  if (out.quantityFormatted) return out.quantityFormatted;
  const sym = out.unitSymbol || (out.unitType === 'liters' ? 'L' : out.unitType === 'kilos' ? 'kg' : out.unitType === 'centimeters' ? 'cm' : out.unitType === 'parts' ? 'partes' : 'pzas');
  return `${out.quantity} ${sym}`;
};

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
  
  // Dispatch mode: 'container' (envase completo), 'sub' (ml, g, cm, partes), 'base' (L, kg, m)
  const [dispatchMode, setDispatchMode] = useState('container');
  const [containerCount, setContainerCount] = useState(1);
  const [subQuantity, setSubQuantity] = useState('');
  const [baseQuantity, setBaseQuantity] = useState(1);
  
  // Custom container size override if the workshop got a different bottle (e.g. standard was 750ml but this bottle is 500ml)
  const [customContainerCap, setCustomContainerCap] = useState('');
  const [customContainerUnit, setCustomContainerUnit] = useState('ml');

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
    setDispatchMode('container');
    setContainerCount(1);
    setSubQuantity('');
    setBaseQuantity(1);
    setCustomContainerCap('');
    setDate(new Date().toISOString().slice(0, 16)); // Current local time
    setError('');
    setSuccess('');
    setShowAddModal(true);
  };

  const selectedMaterialObj = inventory.find(i => i.id === materialId);

  // When selected material changes, reset defaults
  const handleSelectMaterial = (item) => {
    setMaterialId(item.id);
    setMaterialSearch('');
    setMaterialOpen(false);
    
    const uType = item.unitType || 'unit';
    const cCap = item.containerCapacity !== undefined && item.containerCapacity !== '' ? item.containerCapacity : '';
    const cUnit = item.containerUnit || (uType === 'liters' ? 'ml' : uType === 'kilos' ? 'g' : uType === 'centimeters' ? 'm' : 'partes');
    
    setCustomContainerCap(cCap);
    setCustomContainerUnit(cUnit);
    setContainerCount(1);

    if (uType === 'liters') {
      setDispatchMode('sub');
      setSubQuantity(cCap || '');
      setBaseQuantity(1);
    } else if (uType === 'kilos') {
      setDispatchMode('sub');
      setSubQuantity(cCap || '');
      setBaseQuantity(1);
    } else if (uType === 'centimeters') {
      setDispatchMode('sub');
      setSubQuantity('');
      setBaseQuantity(1);
    } else if (uType === 'parts') {
      setDispatchMode('sub');
      setSubQuantity(1);
      setBaseQuantity(1);
    } else {
      setDispatchMode('base');
      setBaseQuantity(1);
    }
  };

  // Calculate deduction in base unit (L, kg, cm, partes, pza)
  const getDeductionAmount = () => {
    if (!selectedMaterialObj) return 0;
    const uType = selectedMaterialObj.unitType || 'unit';

    if (uType === 'liters') {
      if (dispatchMode === 'container') {
        const capInL = customContainerUnit === 'ml' ? (parseFloat(customContainerCap) || 750) / 1000 : (parseFloat(customContainerCap) || 1);
        return Math.round((parseFloat(containerCount) || 0) * capInL * 1000) / 1000;
      }
      if (dispatchMode === 'sub') {
        // sub is in ml
        return Math.round(((parseFloat(subQuantity) || 0) / 1000) * 1000) / 1000;
      }
      // base is in L
      return parseFloat(baseQuantity) || 0;
    }

    if (uType === 'kilos') {
      if (dispatchMode === 'container') {
        const capInKg = customContainerUnit === 'g' ? (parseFloat(customContainerCap) || 500) / 1000 : (parseFloat(customContainerCap) || 1);
        return Math.round((parseFloat(containerCount) || 0) * capInKg * 1000) / 1000;
      }
      if (dispatchMode === 'sub') {
        // sub is in g
        return Math.round(((parseFloat(subQuantity) || 0) / 1000) * 1000) / 1000;
      }
      // base is in kg
      return parseFloat(baseQuantity) || 0;
    }

    if (uType === 'centimeters') {
      if (dispatchMode === 'container') {
        const capInCm = customContainerUnit === 'm' ? (parseFloat(customContainerCap) || 10) * 100 : (parseFloat(customContainerCap) || 100);
        return Math.round((parseFloat(containerCount) || 0) * capInCm);
      }
      if (dispatchMode === 'sub') {
        // sub is in cm
        return parseFloat(subQuantity) || 0;
      }
      // base is in m
      return Math.round((parseFloat(baseQuantity) || 0) * 100);
    }

    if (uType === 'parts') {
      const ppu = parseInt(selectedMaterialObj.partsPerUnit) || 1;
      if (dispatchMode === 'container') {
        return Math.round((parseFloat(containerCount) || 0) * ppu);
      }
      return Math.round(parseFloat(subQuantity) || 0);
    }

    // unit
    return parseFloat(baseQuantity) || 0;
  };

  const calculateSubtotal = () => {
    if (!selectedMaterialObj) return 0;
    const deduct = getDeductionAmount();
    return deduct * (parseFloat(selectedMaterialObj.cost) || 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const deduction = getDeductionAmount();

    if (!materialId || !vehicleFolio || !technicianId || deduction <= 0) {
      setError('Por favor complete todos los campos y use una cantidad válida mayor a cero.');
      return;
    }

    const material = inventory.find(i => i.id === materialId);
    if (!material) {
      setError('Material seleccionado no válido.');
      return;
    }

    const currentStock = parseFloat(material.quantity) || 0;
    if (currentStock < deduction) {
      setError(`Stock insuficiente. Solo quedan ${formatStockDisplay(material)} de ${material.name}.`);
      return;
    }

    const vehicle = vehicles.find(v => v.folio === vehicleFolio);
    const tech = technicians.find(u => u.uid === technicianId);

    const subtotal = calculateSubtotal();

    // Format display string
    let formattedQty = '';
    const uType = material.unitType || 'unit';
    const cName = material.containerName || 'Envase';

    if (uType === 'liters') {
      if (dispatchMode === 'container') {
        formattedQty = `${containerCount} ${cName}${parseFloat(containerCount) === 1 ? '' : 's'} (${customContainerCap}${customContainerUnit} c/u • ${deduction} L)`;
      } else if (dispatchMode === 'sub') {
        formattedQty = `${subQuantity} ml (${deduction} L)`;
      } else {
        formattedQty = `${baseQuantity} L`;
      }
    } else if (uType === 'kilos') {
      if (dispatchMode === 'container') {
        formattedQty = `${containerCount} ${cName}${parseFloat(containerCount) === 1 ? '' : 's'} (${customContainerCap}${customContainerUnit} c/u • ${deduction} kg)`;
      } else if (dispatchMode === 'sub') {
        formattedQty = `${subQuantity} g (${deduction} kg)`;
      } else {
        formattedQty = `${baseQuantity} kg`;
      }
    } else if (uType === 'centimeters') {
      if (dispatchMode === 'container') {
        formattedQty = `${containerCount} ${cName}${parseFloat(containerCount) === 1 ? '' : 's'} (${customContainerCap}${customContainerUnit} c/u • ${deduction} cm)`;
      } else if (dispatchMode === 'sub') {
        formattedQty = `${subQuantity} cm`;
      } else {
        formattedQty = `${baseQuantity} m (${deduction} cm)`;
      }
    } else if (uType === 'parts') {
      const ppu = parseInt(material.partsPerUnit) || 1;
      const mName = material.masterUnitName || 'pliego';
      if (dispatchMode === 'container') {
        formattedQty = `${containerCount} ${mName}${parseFloat(containerCount) === 1 ? '' : 's'} (${deduction} partes)`;
      } else {
        formattedQty = `${deduction} parte${deduction === 1 ? '' : 's'}`;
      }
    } else {
      formattedQty = `${baseQuantity} pza${parseFloat(baseQuantity) === 1 ? '' : 's'}`;
    }

    try {
      await registerOutgoing({
        materialId,
        materialName: material.name,
        unitType: uType,
        unitSymbol: uType === 'liters' ? 'L' : uType === 'kilos' ? 'kg' : uType === 'centimeters' ? 'cm' : uType === 'parts' ? 'partes' : 'pza',
        quantity: deduction,
        quantityFormatted: formattedQty,
        stockDeducted: deduction,
        technicianId,
        technicianName: tech ? tech.name : 'Técnico',
        vehicleFolio,
        date: new Date(date).toISOString(),
        costPerUnit: material.cost,
        totalCost: subtotal
      });

      setSuccess('Salida registrada exitosamente.');
      loadAllData();
      setTimeout(() => {
        setShowAddModal(false);
        setSuccess('');
      }, 1200);
    } catch (err) {
      setError(err.message || 'Error al guardar la salida.');
    }
  };

  const filteredOutgoings = outgoings.filter(out => {
    const term = search.toLowerCase();
    return (
      (out.materialName || '').toLowerCase().includes(term) ||
      (out.technicianName || '').toLowerCase().includes(term) ||
      (out.vehicleFolio || '').toLowerCase().includes(term)
    );
  });

  const totalDeduction = getDeductionAmount();
  const subtotalCost = calculateSubtotal();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Módulo de Salidas</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Registra entregas de materiales, líquidos fraccionables (750ml, 500ml), peso/medidas y repuestos a los mecánicos.
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
                <th style={{ textAlign: 'center' }}>Cantidad Entregada</th>
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
                  const cost = parseFloat(out.costPerUnit) || 0;
                  const qty = parseFloat(out.quantity) || 0;
                  const tot = out.totalCost !== undefined ? parseFloat(out.totalCost) : (cost * qty);
                  return (
                    <tr key={out.id}>
                      <td>{new Date(out.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ fontWeight: '600', color: 'white' }}>{out.materialName}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-info" style={{ fontWeight: 'bold', gap: '4px' }}>
                          {formatOutgoingQty(out)}
                        </span>
                      </td>
                      <td>{out.technicianName}</td>
                      <td style={{ fontWeight: '600', color: 'white' }}>{out.vehicleFolio}</td>
                      <td style={{ textAlign: 'right' }}>${cost.toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#34d399' }}>
                        ${(tot * 1.16).toFixed(2)}
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
          <div className="glass-panel modal-content" style={{ maxWidth: '640px', maxHeight: '92vh', overflowY: 'auto' }}>
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
                    placeholder={materialId ? '' : 'Buscar repuesto, pintura, aceite o material...'}
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
                      .map(item => {
                        const noStock = parseFloat(item.quantity) <= 0;
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              if (noStock) return;
                              handleSelectMaterial(item);
                            }}
                            style={{
                              padding: '0.6rem 0.85rem',
                              cursor: noStock ? 'not-allowed' : 'pointer',
                              opacity: noStock ? 0.45 : 1,
                              borderBottom: '1px solid var(--panel-border)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.875rem',
                              background: materialId === item.id ? 'rgba(99,102,241,0.18)' : 'transparent',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { if (!noStock) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = materialId === item.id ? 'rgba(99,102,241,0.18)' : 'transparent'; }}
                          >
                            <span><strong style={{ color: '#a5b4fc' }}>{item.code}</strong> — {item.name}</span>
                            <span style={{ fontSize: '0.78rem', color: noStock ? '#ef4444' : parseFloat(item.quantity) <= parseFloat(item.minStock) ? '#fbbf24' : '#34d399', marginLeft: '0.5rem', flexShrink: 0 }}>
                              {noStock ? 'SIN STOCK' : `Stock: ${formatStockDisplay(item)}`}
                            </span>
                          </div>
                        );
                      })
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
                  <span style={{ fontSize: '0.8rem', color: parseFloat(selectedMaterialObj.quantity) <= parseFloat(selectedMaterialObj.minStock) ? '#fbbf24' : '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Stock disponible: <strong>{formatStockDisplay(selectedMaterialObj)}</strong> | Costo base: ${(parseFloat(selectedMaterialObj.cost) || 0).toFixed(2)}
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

              {/* ── SELECTOR DE UNIDADES Y CANTIDADES INTELIGENTES ── */}
              {selectedMaterialObj && selectedMaterialObj.unitType !== 'unit' && (
                <div style={{ 
                  background: 'rgba(99, 102, 241, 0.08)', 
                  border: '1px solid rgba(99, 102, 241, 0.25)', 
                  borderRadius: '8px', 
                  padding: '1rem', 
                  marginBottom: '1rem' 
                }}>
                  <label style={{ fontWeight: '600', color: '#a5b4fc', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>
                    ¿En qué unidad deseas registrar la entrega al mecánico?
                  </label>
                  
                  {/* Selector de modo según el tipo de material */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    {selectedMaterialObj.unitType === 'liters' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('container')}
                          className={`btn btn-sm ${dispatchMode === 'container' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem', minWidth: '130px' }}
                        >
                          🍶 Por Envases ({customContainerCap} {customContainerUnit})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('sub')}
                          className={`btn btn-sm ${dispatchMode === 'sub' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem', minWidth: '130px' }}
                        >
                          🧪 Por Mililitros (ml)
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('base')}
                          className={`btn btn-sm ${dispatchMode === 'base' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem', minWidth: '130px' }}
                        >
                          🛢️ Por Litros (L)
                        </button>
                      </>
                    )}

                    {selectedMaterialObj.unitType === 'kilos' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('container')}
                          className={`btn btn-sm ${dispatchMode === 'container' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem', minWidth: '130px' }}
                        >
                          🥫 Por Envases ({customContainerCap} {customContainerUnit})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('sub')}
                          className={`btn btn-sm ${dispatchMode === 'sub' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem', minWidth: '130px' }}
                        >
                          ⚖️ Por Gramos (g)
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('base')}
                          className={`btn btn-sm ${dispatchMode === 'base' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem', minWidth: '130px' }}
                        >
                          📦 Por Kilos (kg)
                        </button>
                      </>
                    )}

                    {selectedMaterialObj.unitType === 'centimeters' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('container')}
                          className={`btn btn-sm ${dispatchMode === 'container' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem', minWidth: '130px' }}
                        >
                          🌀 Por Rollos ({customContainerCap} {customContainerUnit})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('sub')}
                          className={`btn btn-sm ${dispatchMode === 'sub' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem', minWidth: '130px' }}
                        >
                          📏 Por Centímetros (cm)
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('base')}
                          className={`btn btn-sm ${dispatchMode === 'base' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem', minWidth: '130px' }}
                        >
                          📐 Por Metros (m)
                        </button>
                      </>
                    )}

                    {selectedMaterialObj.unitType === 'parts' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('sub')}
                          className={`btn btn-sm ${dispatchMode === 'sub' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem' }}
                        >
                          ✂️ Por Partes Fraccionadas
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispatchMode('container')}
                          className={`btn btn-sm ${dispatchMode === 'container' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '0.8rem' }}
                        >
                          📄 Por {selectedMaterialObj.masterUnitName || 'Pliego'} Completo ({selectedMaterialObj.partsPerUnit || 4} partes)
                        </button>
                      </>
                    )}
                  </div>

                  {/* Input según el modo seleccionado */}
                  {dispatchMode === 'container' && (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '0.8rem' }}>Cantidad de Envases *</label>
                          <input 
                            type="number" 
                            step="any"
                            className="input-field" 
                            value={containerCount} 
                            onChange={(e) => setContainerCount(e.target.value)}
                            min={0.1}
                            placeholder="ej. 1"
                            required
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '0.8rem' }}>Tamaño de este Envase</label>
                          <input 
                            type="number" 
                            step="any"
                            className="input-field" 
                            value={customContainerCap} 
                            onChange={(e) => setCustomContainerCap(e.target.value)}
                            min={0.001}
                            placeholder="ej. 750 o 500"
                            required
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '0.8rem' }}>Unidad</label>
                          <select 
                            className="select-field" 
                            value={customContainerUnit} 
                            onChange={(e) => setCustomContainerUnit(e.target.value)}
                          >
                            {selectedMaterialObj.unitType === 'liters' && (
                              <>
                                <option value="ml">ml (mililitros)</option>
                                <option value="L">Litros (L)</option>
                              </>
                            )}
                            {selectedMaterialObj.unitType === 'kilos' && (
                              <>
                                <option value="g">g (gramos)</option>
                                <option value="kg">kg (kilos)</option>
                              </>
                            )}
                            {selectedMaterialObj.unitType === 'centimeters' && (
                              <>
                                <option value="m">m (metros)</option>
                                <option value="cm">cm (centímetros)</option>
                              </>
                            )}
                            {selectedMaterialObj.unitType === 'parts' && (
                              <option value="partes">partes</option>
                            )}
                          </select>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#34d399', marginTop: '4px', display: 'block' }}>
                        ↳ Descontará: <strong>{getDeductionAmount()} {selectedMaterialObj.unitType === 'liters' ? 'Litros' : selectedMaterialObj.unitType === 'kilos' ? 'kg' : selectedMaterialObj.unitType === 'centimeters' ? 'cm' : 'partes'}</strong> de stock.
                      </span>
                    </div>
                  )}

                  {dispatchMode === 'sub' && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.82rem' }}>
                        Cantidad a Entregar en {selectedMaterialObj.unitType === 'liters' ? 'Mililitros (ml)' : selectedMaterialObj.unitType === 'kilos' ? 'Gramos (g)' : selectedMaterialObj.unitType === 'centimeters' ? 'Centímetros (cm)' : 'Partes'} *
                      </label>
                      <input 
                        type="number" 
                        step="any"
                        className="input-field" 
                        value={subQuantity} 
                        onChange={(e) => setSubQuantity(e.target.value)}
                        min={selectedMaterialObj.unitType === 'parts' ? 1 : 0.1}
                        placeholder={selectedMaterialObj.unitType === 'liters' ? 'ej. 750, 500, 250' : selectedMaterialObj.unitType === 'kilos' ? 'ej. 500, 250, 100' : 'ej. 45, 100'}
                        required
                      />
                      <span style={{ fontSize: '0.78rem', color: '#34d399', marginTop: '4px', display: 'block' }}>
                        ↳ Descontará: <strong>{getDeductionAmount()} {selectedMaterialObj.unitType === 'liters' ? 'Litros' : selectedMaterialObj.unitType === 'kilos' ? 'kg' : selectedMaterialObj.unitType === 'centimeters' ? 'cm' : 'partes'}</strong> de stock.
                      </span>
                    </div>
                  )}

                  {dispatchMode === 'base' && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.82rem' }}>
                        Cantidad a Entregar en {selectedMaterialObj.unitType === 'liters' ? 'Litros (L)' : selectedMaterialObj.unitType === 'kilos' ? 'Kilos (kg)' : 'Metros (m)'} *
                      </label>
                      <input 
                        type="number" 
                        step="any"
                        className="input-field" 
                        value={baseQuantity} 
                        onChange={(e) => setBaseQuantity(e.target.value)}
                        min={0.001}
                        placeholder="ej. 1.5"
                        required
                      />
                      <span style={{ fontSize: '0.78rem', color: '#34d399', marginTop: '4px', display: 'block' }}>
                        ↳ Descontará: <strong>{getDeductionAmount()} {selectedMaterialObj.unitType === 'liters' ? 'Litros' : selectedMaterialObj.unitType === 'kilos' ? 'kg' : selectedMaterialObj.unitType === 'centimeters' ? 'cm' : 'partes'}</strong> de stock.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Regular unit item */}
              {selectedMaterialObj && selectedMaterialObj.unitType === 'unit' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Cantidad de Piezas a Entregar *</label>
                    <input 
                      type="number" 
                      step="any"
                      className="input-field" 
                      value={baseQuantity} 
                      onChange={(e) => setBaseQuantity(e.target.value)}
                      min={0.1}
                      max={parseFloat(selectedMaterialObj.quantity) || undefined}
                      placeholder="ej. 1"
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
              )}

              {selectedMaterialObj && selectedMaterialObj.unitType !== 'unit' && (
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
              )}

              {selectedMaterialObj && totalDeduction > 0 && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span>Cantidad descontada de stock:</span>
                    <strong style={{ color: '#a5b4fc' }}>
                      {totalDeduction} {selectedMaterialObj.unitType === 'liters' ? 'L' : selectedMaterialObj.unitType === 'kilos' ? 'kg' : selectedMaterialObj.unitType === 'centimeters' ? 'cm' : selectedMaterialObj.unitType === 'parts' ? 'partes' : 'pzas'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span>Subtotal (Sin IVA):</span>
                    <span>${subtotalCost.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#34d399' }}>
                    <span>Total de la Salida (Con IVA 16%):</span>
                    <span>${(subtotalCost * 1.16).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={!selectedMaterialObj || parseFloat(selectedMaterialObj.quantity) < totalDeduction || totalDeduction <= 0}
                >
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

