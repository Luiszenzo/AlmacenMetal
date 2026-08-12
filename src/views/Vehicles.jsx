import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Car, Truck, Bike, Calendar, FileText, 
  Settings, CheckCircle, XCircle, ChevronRight, Upload, AlertCircle
} from 'lucide-react';
import { getVehiclesList, saveVehicle, toggleVehicleStatus, getOutgoingsList } from '../config/dbService';
import { generateVehiclePDF, generateGeneralPDF } from '../utils/reports';

const Vehicles = ({ currentUser }) => {
  const [vehicles, setVehicles] = useState([]);
  const [outgoings, setOutgoings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [error, setError] = useState('');

  // Form State
  const [folio, setFolio] = useState('');
  const [plate, setPlate] = useState('');
  const [type, setType] = useState('Coche');
  const [details, setDetails] = useState('');
  const [image, setImage] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  const isEditable = currentUser?.role === 'admin' || currentUser?.role === 'encargado';

  const loadData = async () => {
    setLoading(true);
    try {
      const vList = await getVehiclesList();
      const oList = await getOutgoingsList();
      setVehicles(vList);
      setOutgoings(oList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (limit base64 storage to ~800KB for firestore limits)
      if (file.size > 800 * 1024) {
        alert("La imagen es demasiado grande. Elige una de menos de 800 KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenAdd = () => {
    setIsEditMode(false);
    setFolio('');
    setPlate('');
    setType('Coche');
    setDetails('');
    setImage('');
    setEntryDate(new Date().toISOString().slice(0, 16)); // Now
    setError('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (v, e) => {
    e.stopPropagation(); // Avoid opening details modal
    setIsEditMode(true);
    setFolio(v.folio);
    setPlate(v.plate);
    setType(v.type);
    setDetails(v.details || '');
    setImage(v.imageUrl || '');
    // Format timestamp string to datetime-local value (YYYY-MM-DDTHH:MM)
    const dateObj = new Date(v.entryDate);
    const tzOffset = dateObj.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISODate = (new Date(dateObj.getTime() - tzOffset)).toISOString().slice(0, 16);
    setEntryDate(localISODate);
    setError('');
    setShowAddModal(true);
  };

  const handleOpenDetails = (v) => {
    setSelectedVehicle(v);
    setShowDetailModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!folio.trim() || !plate.trim()) {
      setError('El Folio y la Placa son campos requeridos.');
      return;
    }

    // Check if Folio already exists when adding new vehicle
    if (!isEditMode && vehicles.some(v => v.folio.toLowerCase() === folio.trim().toLowerCase())) {
      setError('Ya existe un vehículo registrado con este Folio.');
      return;
    }

    try {
      await saveVehicle({
        folio: folio.trim().toUpperCase(),
        plate: plate.trim().toUpperCase(),
        type,
        details: details.trim(),
        imageUrl: image,
        entryDate: new Date(entryDate).toISOString(),
        active: isEditMode ? (vehicles.find(v => v.folio === folio)?.active ?? true) : true
      });
      setShowAddModal(false);
      loadData();
    } catch (err) {
      setError(err.message || 'Error al guardar el vehículo.');
    }
  };

  const handleToggleStatus = async (folio, currentStatus, e) => {
    if (e) e.stopPropagation();
    try {
      await toggleVehicleStatus(folio, currentStatus);
      loadData();
      // If details modal is open, update selected vehicle
      if (selectedVehicle && selectedVehicle.folio === folio) {
        setSelectedVehicle(prev => ({ ...prev, active: !currentStatus }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReportVehicle = (v) => {
    const vOutgoings = outgoings.filter(o => o.vehicleFolio === v.folio);
    const totalCost = vOutgoings.reduce((acc, o) => acc + ((o.costPerUnit || 0) * (o.quantity || 0)), 0);
    generateVehiclePDF(v, vOutgoings, totalCost);
  };

  const handleReportGeneral = () => {
    generateGeneralPDF(vehicles, outgoings);
  };

  // Filter Logic
  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = 
      v.folio.toLowerCase().includes(search.toLowerCase()) || 
      v.plate.toLowerCase().includes(search.toLowerCase()) ||
      v.details.toLowerCase().includes(search.toLowerCase());
    
    const matchesType = typeFilter === '' || v.type === typeFilter;
    
    let matchesStatus = true;
    if (statusFilter === 'activo') matchesStatus = v.active;
    if (statusFilter === 'inactivo') matchesStatus = !v.active;

    return matchesSearch && matchesType && matchesStatus;
  });

  const getVehicleIcon = (type) => {
    switch (type) {
      case 'Tracto': return <Truck size={24} />;
      case 'Motocicleta': return <Bike size={24} />;
      default: return <Car size={24} />;
    }
  };

  const getVehicleOutgoings = (folio) => {
    return outgoings.filter(o => o.vehicleFolio === folio);
  };

  const getVehicleTotalCost = (folio) => {
    const list = getVehicleOutgoings(folio);
    return list.reduce((acc, o) => acc + ((o.costPerUnit || 0) * (o.quantity || 0) * 1.16), 0); // With IVA
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Catálogo de Vehículos</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Controla las unidades que ingresan al taller, sus estatus y los materiales gastados en cada una.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={handleReportGeneral} disabled={vehicles.length === 0}>
            <FileText size={18} />
            <span>Reporte General</span>
          </button>
          {isEditable && (
            <button className="btn btn-primary" onClick={handleOpenAdd}>
              <Plus size={18} />
              <span>Registrar Vehículo</span>
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="search-filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Buscar por folio, placa o falla..." 
            className="input-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select 
          className="select-field" 
          value={typeFilter} 
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ maxWidth: '160px' }}
        >
          <option value="">Todos los Tipos</option>
          <option value="Coche">Coche</option>
          <option value="Tracto">Tracto / Camión</option>
          <option value="Motocicleta">Motocicleta</option>
        </select>
        <select 
          className="select-field" 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ maxWidth: '160px' }}
        >
          <option value="">Todos los Estatus</option>
          <option value="activo">Activo (Taller)</option>
          <option value="inactivo">Inactivo (Entregado)</option>
        </select>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          Cargando vehículos...
        </div>
      ) : (
        <div>
          {filteredVehicles.length === 0 ? (
            <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No se encontraron vehículos que coincidan con los filtros.
            </div>
          ) : (
            <div className="cards-grid">
              {filteredVehicles.map((v) => {
                const totalCostVal = getVehicleTotalCost(v.folio);
                return (
                  <div key={v.folio} className="glass-panel vehicle-card" onClick={() => handleOpenDetails(v)}>
                    <div className="vehicle-card-img">
                      {v.imageUrl ? (
                        <img src={v.imageUrl} alt={`Vehículo ${v.folio}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          {getVehicleIcon(v.type)}
                          <span style={{ fontSize: '0.8rem' }}>Sin Imagen</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="vehicle-card-info">
                      <div className="vehicle-card-header">
                        <div>
                          <h3 className="vehicle-card-title">{v.folio}</h3>
                          <span className="vehicle-card-plate">{v.plate}</span>
                        </div>
                        <span className={`badge ${v.active ? 'badge-success' : 'badge-danger'}`}>
                          {v.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>

                      <p className="vehicle-card-detail">{v.details || 'Sin detalles'}</p>
                      
                      <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tipo: <strong>{v.type}</strong></span>
                        <span style={{ color: totalCostVal > 0 ? '#34d399' : 'var(--text-secondary)', fontWeight: '600' }}>
                          Gasto: ${totalCostVal.toFixed(2)}
                        </span>
                      </div>

                      <div className="vehicle-card-footer">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} />
                          <span>{new Date(v.entryDate).toLocaleDateString('es-MX')}</span>
                        </div>
                        {isEditable && (
                          <button 
                            onClick={(e) => handleOpenEdit(v, e)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            <Settings size={12} />
                            <span>Editar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CRUD modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h3 className="modal-title">{isEditMode ? `Modificar Vehículo: ${folio}` : 'Registrar Nuevo Vehículo'}</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            {error && <div className="badge badge-danger" style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem', boxSizing: 'border-box' }}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Folio (Identificador único) *</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={folio} 
                    onChange={(e) => setFolio(e.target.value)} 
                    placeholder="ej. V-1004"
                    disabled={isEditMode}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Placa del Vehículo *</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={plate} 
                    onChange={(e) => setPlate(e.target.value)} 
                    placeholder="ej. XYZ-456-B"
                    required 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Tipo de Vehículo *</label>
                  <select className="select-field" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="Coche">Coche</option>
                    <option value="Tracto">Tracto / Camión</option>
                    <option value="Motocicleta">Motocicleta</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Fecha de Entrada *</label>
                  <input 
                    type="datetime-local" 
                    className="input-field" 
                    value={entryDate} 
                    onChange={(e) => setEntryDate(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Detalles / Reporte de Falla / Diagnóstico</label>
                <textarea 
                  className="input-field" 
                  value={details} 
                  onChange={(e) => setDetails(e.target.value)} 
                  placeholder="Detalles sobre lo que le duele al vehículo, trabajos a realizar..."
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>Fotografía del Vehículo</label>
                <div className="image-upload-box">
                  <Upload size={24} />
                  <span>Haz clic aquí para seleccionar una imagen</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Máx. 800 KB</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    onChange={handleFileChange}
                  />
                  {image && <img src={image} className="image-preview" alt="Preview" />}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Vehículo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail & Material Spendings Modal */}
      {showDetailModal && selectedVehicle && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Detalle del Vehículo: {selectedVehicle.folio}</h3>
              <button className="modal-close" onClick={() => setShowDetailModal(false)}>✕</button>
            </div>

            <div className="detail-grid">
              {/* Column 1: Info & Photo */}
              <div>
                <div style={{ width: '100%', height: '200px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  {selectedVehicle.imageUrl ? (
                    <img src={selectedVehicle.imageUrl} alt="Vehículo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      {getVehicleIcon(selectedVehicle.type)}
                      <span>Sin Imagen</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
                  <div><strong>Placa:</strong> {selectedVehicle.plate}</div>
                  <div><strong>Tipo:</strong> {selectedVehicle.type}</div>
                  <div><strong>Fecha Entrada:</strong> {new Date(selectedVehicle.entryDate).toLocaleString('es-MX')}</div>
                  <div className="status-toggle" style={{ marginTop: '0.5rem' }}>
                    <strong>Estatus (Activo/Inactivo):</strong>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={selectedVehicle.active} 
                        onChange={() => handleToggleStatus(selectedVehicle.folio, selectedVehicle.active)}
                        disabled={!isEditable}
                      />
                      <span className="slider"></span>
                    </label>
                    <span style={{ fontSize: '0.8rem', color: selectedVehicle.active ? '#34d399' : '#f87171' }}>
                      {selectedVehicle.active ? '(Taller)' : '(Entregado)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Column 2: Material Spent List & Actions */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ flexGrow: 1 }}>
                  <h4 style={{ fontSize: '1rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.25rem' }}>
                    Material Gastado en Vehículo
                  </h4>
                  
                  {getVehicleOutgoings(selectedVehicle.folio).length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '1rem 0' }}>
                      No se han registrado salidas de material para este vehículo aún.
                    </p>
                  ) : (
                    <div className="table-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Material</th>
                            <th style={{ textAlign: 'center' }}>Cant</th>
                            <th style={{ textAlign: 'right' }}>Total (c/IVA)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getVehicleOutgoings(selectedVehicle.folio).map(o => (
                            <tr key={o.id}>
                              <td>{new Date(o.date).toLocaleDateString('es-MX')}</td>
                              <td style={{ fontWeight: '500', color: 'white' }}>{o.materialName}</td>
                              <td style={{ textAlign: 'center' }}>{o.quantity}</td>
                              <td style={{ textAlign: 'right' }}>
                                ${((o.costPerUnit || 0) * (o.quantity || 0) * 1.16).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Costo Total Acumulado (con IVA):</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: '700', color: '#34d399' }}>
                      ${getVehicleTotalCost(selectedVehicle.folio).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => handleReportVehicle(selectedVehicle)}>
                    <FileText size={16} />
                    <span>Reporte Individual</span>
                  </button>
                  <button className="btn btn-primary" onClick={() => setShowDetailModal(false)}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vehicles;
