import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, User, Package, Car, ArrowUpRight } from 'lucide-react';
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
    setVehicleFolio('');
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
              <div className="form-group">
                <label>Seleccionar Material *</label>
                <select 
                  className="select-field" 
                  value={materialId} 
                  onChange={(e) => setMaterialId(e.target.value)}
                  required
                >
                  <option value="">-- Elige un repuesto/material --</option>
                  {inventory.map(item => (
                    <option key={item.id} value={item.id} disabled={item.quantity === 0}>
                      {item.code} - {item.name} (Stock: {item.quantity}) {item.quantity === 0 ? '[SIN STOCK]' : ''}
                    </option>
                  ))}
                </select>
                {selectedMaterialObj && (
                  <span style={{ fontSize: '0.8rem', color: selectedMaterialObj.quantity <= selectedMaterialObj.minStock ? '#fbbf24' : '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Stock disponible: {selectedMaterialObj.quantity} unidades | Costo: ${selectedMaterialObj.cost.toFixed(2)}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label>Vehículo Destino (Activos en Taller) *</label>
                <select 
                  className="select-field" 
                  value={vehicleFolio} 
                  onChange={(e) => setVehicleFolio(e.target.value)}
                  required
                >
                  <option value="">-- Selecciona el Folio del Vehículo --</option>
                  {vehicles.map(v => (
                    <option key={v.folio} value={v.folio}>
                      {v.folio} - {v.plate} ({v.type})
                    </option>
                  ))}
                </select>
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
