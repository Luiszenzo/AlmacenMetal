import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Car, Truck, Bike, Calendar, FileText,
  Settings, CheckCircle, XCircle, ChevronRight, Upload,
  AlertCircle, ClipboardList, Wrench, Package, BookOpen,
  PlusCircle, Camera, X, Eye, Hammer, Cog, Clock,
  CheckSquare, ShoppingCart, Info, Edit3, Save, Trash2
} from 'lucide-react';
import {
  getVehiclesList,
  saveVehicle,
  toggleVehicleStatus,
  getOutgoingsList,
  getVehicleUpdates,
  saveVehicleUpdate,
  saveOrderedPart
} from '../config/dbService';
import { generateVehiclePDF, generateGeneralPDF } from '../utils/reports';

// ---- Helpers ----
const PROCESS_LABELS = { pendiente: 'Pendiente', en_proceso: 'En Proceso', terminado: 'Terminado' };
const PART_STATUS_LABELS = { pendiente: 'Pendiente', pedido: 'Pedido', recibido: 'Recibido' };

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const ProcessStatusSelector = ({ value, onChange, disabled }) => (
  <div className="process-status-selector">
    {['pendiente', 'en_proceso', 'terminado'].map(s => (
      <button
        key={s}
        type="button"
        className={`process-status-btn ${value === s ? `active-${s}` : ''}`}
        onClick={() => !disabled && onChange(s)}
        disabled={disabled}
      >
        {PROCESS_LABELS[s]}
      </button>
    ))}
  </div>
);

// ---- Main Component ----
const Vehicles = ({ currentUser }) => {
  const [vehicles, setVehicles] = useState([]);
  const [outgoings, setOutgoings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [processFilter, setProcessFilter] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [activeTab, setActiveTab] = useState('info');

  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // Add/Edit form state
  const [isEditMode, setIsEditMode] = useState(false);
  const [formFolio, setFormFolio] = useState('');
  const [formOrderNumber, setFormOrderNumber] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formPlate, setFormPlate] = useState('');
  const [formType, setFormType] = useState('Coche');
  const [formDetails, setFormDetails] = useState('');
  const [formEntryDate, setFormEntryDate] = useState('');
  const [formImageUrls, setFormImageUrls] = useState([]); // up to 4
  const [formAdmissionPass, setFormAdmissionPass] = useState('');
  const [formBodyworkStatus, setFormBodyworkStatus] = useState('pendiente');
  const [formMechanicsStatus, setFormMechanicsStatus] = useState('pendiente');
  const [formColor, setFormColor] = useState('');
  const [formInsurance, setFormInsurance] = useState('');
  const [formError, setFormError] = useState('');

  // Detail tab states
  const [vehicleUpdates, setVehicleUpdates] = useState([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);

  // New update form
  const [newUpdateBodywork, setNewUpdateBodywork] = useState('');
  const [newUpdateMechanics, setNewUpdateMechanics] = useState('');
  const [newUpdateGeneral, setNewUpdateGeneral] = useState('');
  const [newUpdatePhotos, setNewUpdatePhotos] = useState([]);
  const [savingUpdate, setSavingUpdate] = useState(false);

  // Ordered parts
  const [showAddPartForm, setShowAddPartForm] = useState(false);
  const [partName, setPartName] = useState('');
  const [partSupplier, setPartSupplier] = useState('');
  const [partQty, setPartQty] = useState(1);
  const [partNotes, setPartNotes] = useState('');
  const [savingPart, setSavingPart] = useState(false);

  const isEditable = currentUser?.role === 'admin' || currentUser?.role === 'encargado';

  // ---- Data Loading ----
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [vList, oList] = await Promise.all([getVehiclesList(), getOutgoingsList()]);
      setVehicles(vList);
      setOutgoings(oList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadVehicleUpdates = useCallback(async (folio) => {
    setUpdatesLoading(true);
    try {
      const updates = await getVehicleUpdates(folio);
      setVehicleUpdates(updates);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatesLoading(false);
    }
  }, []);

  // ---- Open Modals ----
  const handleOpenAdd = () => {
    setIsEditMode(false);
    setFormFolio(''); setFormOrderNumber(''); setFormModel('');
    setFormPlate(''); setFormType('Coche'); setFormDetails('');
    setFormEntryDate(new Date().toISOString().slice(0, 16));
    setFormImageUrls([]); setFormAdmissionPass('');
    setFormBodyworkStatus('pendiente'); setFormMechanicsStatus('pendiente');
    setFormColor(''); setFormInsurance('');
    setFormError('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (v, e) => {
    e.stopPropagation();
    setIsEditMode(true);
    setFormFolio(v.folio);
    setFormOrderNumber(v.orderNumber || '');
    setFormModel(v.model || '');
    setFormPlate(v.plate);
    setFormType(v.type);
    setFormDetails(v.details || '');
    setFormImageUrls(v.imageUrls || []);
    setFormAdmissionPass(v.admissionPassUrl || '');
    setFormBodyworkStatus(v.bodyworkStatus || 'pendiente');
    setFormMechanicsStatus(v.mechanicsStatus || 'pendiente');
    setFormColor(v.color || '');
    setFormInsurance(v.insurance || '');
    const dateObj = new Date(v.entryDate);
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    setFormEntryDate(new Date(dateObj.getTime() - tzOffset).toISOString().slice(0, 16));
    setFormError('');
    setShowAddModal(true);
  };

  const handleOpenDetails = (v) => {
    setSelectedVehicle(v);
    setActiveTab('info');
    setVehicleUpdates([]);
    setNewUpdateBodywork(''); setNewUpdateMechanics('');
    setNewUpdateGeneral(''); setNewUpdatePhotos([]);
    setShowAddPartForm(false);
    setShowDetailModal(true);
    loadVehicleUpdates(v.folio);
  };

  // ---- Photo Handling ----
  const handleAddPhoto = async (e, index) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert('Imagen demasiado grande. Máx 500 KB por foto.'); return; }
    try {
      const b64 = await readFileAsBase64(file);
      const updated = [...formImageUrls];
      updated[index] = b64;
      setFormImageUrls(updated);
    } catch { alert('Error al cargar la imagen.'); }
  };

  const handleRemovePhoto = (index) => {
    const updated = [...formImageUrls];
    updated.splice(index, 1);
    setFormImageUrls(updated);
  };

  const handleAdmissionPassChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 600 * 1024) { alert('Imagen demasiado grande. Máx 600 KB.'); return; }
    try {
      const b64 = await readFileAsBase64(file);
      setFormAdmissionPass(b64);
    } catch { alert('Error al cargar el pase de admisión.'); }
  };

  // ---- Submit Form ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formFolio.trim() || !formPlate.trim()) {
      setFormError('El Folio y la Placa son campos requeridos.');
      return;
    }
    if (!isEditMode && vehicles.some(v => v.folio.toLowerCase() === formFolio.trim().toLowerCase())) {
      setFormError('Ya existe un vehículo con este Folio.');
      return;
    }
    try {
      await saveVehicle({
        folio: formFolio.trim().toUpperCase(),
        orderNumber: formOrderNumber.trim().toUpperCase(),
        model: formModel.trim(),
        plate: formPlate.trim().toUpperCase(),
        type: formType,
        details: formDetails.trim(),
        imageUrls: formImageUrls,
        admissionPassUrl: formAdmissionPass,
        bodyworkStatus: formBodyworkStatus,
        mechanicsStatus: formMechanicsStatus,
        color: formColor.trim(),
        insurance: formInsurance.trim(),
        entryDate: new Date(formEntryDate).toISOString(),
        active: isEditMode ? (vehicles.find(v => v.folio === formFolio.trim().toUpperCase())?.active ?? true) : true,
        deliveredAt: null
      });
      setShowAddModal(false);
      loadData();
    } catch (err) {
      setFormError(err.message || 'Error al guardar el vehículo.');
    }
  };

  // ---- Toggle Status / Deliver ----
  const handleToggleStatus = async (folio, currentStatus, e) => {
    if (e) e.stopPropagation();
    try {
      await toggleVehicleStatus(folio, currentStatus);
      loadData();
      if (selectedVehicle?.folio === folio) {
        setSelectedVehicle(prev => ({ ...prev, active: !currentStatus }));
      }
    } catch (err) { console.error(err); }
  };

  const handleMarkDelivered = async () => {
    if (!selectedVehicle) return;
    const confirmed = window.confirm(`¿Confirmar entrega del vehículo ${selectedVehicle.folio}?`);
    if (!confirmed) return;
    try {
      await saveVehicle({
        ...selectedVehicle,
        active: false,
        deliveredAt: new Date().toISOString(),
        bodyworkStatus: 'terminado',
        mechanicsStatus: 'terminado'
      });
      const updated = { ...selectedVehicle, active: false, deliveredAt: new Date().toISOString(), bodyworkStatus: 'terminado', mechanicsStatus: 'terminado' };
      setSelectedVehicle(updated);
      loadData();
    } catch (err) { console.error(err); }
  };

  // ---- Process Status Update (from detail modal) ----
  const handleUpdateProcessStatus = async (field, value) => {
    if (!selectedVehicle || !isEditable) return;
    try {
      const updated = { ...selectedVehicle, [field]: value };
      await saveVehicle(updated);
      setSelectedVehicle(updated);
      setVehicles(prev => prev.map(v => v.folio === updated.folio ? updated : v));
    } catch (err) { console.error(err); }
  };

  // ---- Save Daily Update ----
  const handleSaveUpdate = async () => {
    if (!newUpdateGeneral.trim() && !newUpdateBodywork.trim() && !newUpdateMechanics.trim()) {
      alert('Escribe al menos una nota para guardar la actualización.');
      return;
    }
    setSavingUpdate(true);
    try {
      await saveVehicleUpdate({
        vehicleFolio: selectedVehicle.folio,
        date: new Date().toISOString(),
        technicianName: currentUser?.name || 'Usuario',
        bodyworkNote: newUpdateBodywork.trim(),
        mechanicsNote: newUpdateMechanics.trim(),
        generalNote: newUpdateGeneral.trim(),
        photosAdded: newUpdatePhotos
      });
      setNewUpdateBodywork('');
      setNewUpdateMechanics('');
      setNewUpdateGeneral('');
      setNewUpdatePhotos([]);
      await loadVehicleUpdates(selectedVehicle.folio);
    } catch (err) {
      alert('Error al guardar actualización: ' + err.message);
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleUpdatePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert('Imagen demasiado grande. Máx 500 KB.'); return; }
    try {
      const b64 = await readFileAsBase64(file);
      setNewUpdatePhotos(prev => [...prev, b64]);
    } catch { alert('Error al cargar imagen.'); }
  };

  // ---- Save Ordered Part ----
  const handleSaveOrderedPart = async () => {
    if (!partName.trim()) { alert('Escribe el nombre de la pieza.'); return; }
    setSavingPart(true);
    try {
      await saveOrderedPart(selectedVehicle.folio, {
        name: partName.trim(),
        supplier: partSupplier.trim(),
        quantity: partQty,
        notes: partNotes.trim(),
        status: 'pendiente'
      });
      // Reload vehicle data to get updated orderedParts
      const vList = await getVehiclesList();
      setVehicles(vList);
      const refreshed = vList.find(v => v.folio === selectedVehicle.folio);
      if (refreshed) setSelectedVehicle(refreshed);
      setPartName(''); setPartSupplier(''); setPartQty(1); setPartNotes('');
      setShowAddPartForm(false);
    } catch (err) {
      alert('Error al guardar pieza: ' + err.message);
    } finally {
      setSavingPart(false);
    }
  };

  const handleUpdatePartStatus = async (part, newStatus) => {
    if (!isEditable) return;
    try {
      await saveOrderedPart(selectedVehicle.folio, { ...part, status: newStatus });
      const vList = await getVehiclesList();
      setVehicles(vList);
      const refreshed = vList.find(v => v.folio === selectedVehicle.folio);
      if (refreshed) setSelectedVehicle(refreshed);
    } catch (err) { console.error(err); }
  };

  // ---- Computed ----
  const filteredVehicles = vehicles.filter(v => {
    const q = search.toLowerCase();
    const matchesSearch =
      (v.folio || '').toLowerCase().includes(q) ||
      (v.plate || '').toLowerCase().includes(q) ||
      (v.model || '').toLowerCase().includes(q) ||
      (v.orderNumber || '').toLowerCase().includes(q) ||
      (v.details || '').toLowerCase().includes(q);
    const matchesType = typeFilter === '' || v.type === typeFilter;
    let matchesStatus = true;
    if (statusFilter === 'activo') matchesStatus = v.active;
    if (statusFilter === 'inactivo') matchesStatus = !v.active;
    let matchesProcess = true;
    if (processFilter === 'hojalateria') matchesProcess = v.bodyworkStatus === 'en_proceso';
    if (processFilter === 'mecanica') matchesProcess = v.mechanicsStatus === 'en_proceso';
    if (processFilter === 'terminado') matchesProcess = v.bodyworkStatus === 'terminado' && v.mechanicsStatus === 'terminado';
    return matchesSearch && matchesType && matchesStatus && matchesProcess;
  });

  const getVehicleIcon = (type) => {
    switch (type) {
      case 'Tracto': return <Truck size={24} />;
      case 'Motocicleta': return <Bike size={24} />;
      default: return <Car size={24} />;
    }
  };

  const getVehicleOutgoings = (folio) => outgoings.filter(o => o.vehicleFolio === folio);
  const getVehicleTotalCost = (folio) =>
    getVehicleOutgoings(folio).reduce((acc, o) => acc + ((o.costPerUnit || 0) * (o.quantity || 0) * 1.16), 0);

  const handleReportVehicle = (v) => {
    const vOutgoings = outgoings.filter(o => o.vehicleFolio === v.folio);
    const totalCost = vOutgoings.reduce((acc, o) => acc + ((o.costPerUnit || 0) * (o.quantity || 0)), 0);
    generateVehiclePDF(v, vOutgoings, totalCost);
  };

  const handleReportGeneral = () => generateGeneralPDF(vehicles, outgoings);

  // ---- Render Tabs ----
  const renderInfoTab = () => (
    <div>
      {/* Photo Gallery */}
      <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Fotografías del Vehículo
      </h4>
      {(selectedVehicle.imageUrls || []).length > 0 ? (
        <div className="photo-gallery" style={{ marginBottom: '1rem' }}>
          {(selectedVehicle.imageUrls || []).map((url, i) => (
            <div key={i} className="photo-gallery-item" onClick={() => setLightboxSrc(url)}>
              <img src={url} alt={`Foto ${i + 1}`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="photo-gallery-empty" style={{ marginBottom: '1rem' }}>
          <Camera size={24} />
          <span>Sin fotografías</span>
        </div>
      )}

      <div className="section-divider" />

      {/* General Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem', fontSize: '0.9rem', marginBottom: '1rem' }}>
        <div><span style={{ color: 'var(--text-secondary)' }}>No. Orden:</span> <strong style={{ color: 'var(--primary)' }}>{selectedVehicle.orderNumber || '—'}</strong></div>
        <div><span style={{ color: 'var(--text-secondary)' }}>Folio:</span> <strong>{selectedVehicle.folio}</strong></div>
        <div><span style={{ color: 'var(--text-secondary)' }}>Modelo:</span> <strong>{selectedVehicle.model || '—'}</strong></div>
        <div><span style={{ color: 'var(--text-secondary)' }}>Placa:</span> <strong style={{ fontFamily: 'monospace' }}>{selectedVehicle.plate}</strong></div>
        <div><span style={{ color: 'var(--text-secondary)' }}>Tipo:</span> <strong>{selectedVehicle.type}</strong></div>
        <div><span style={{ color: 'var(--text-secondary)' }}>Color:</span> <strong>{selectedVehicle.color || '—'}</strong></div>
        <div><span style={{ color: 'var(--text-secondary)' }}>Aseguradora:</span> <strong>{selectedVehicle.insurance || '—'}</strong></div>
        <div><span style={{ color: 'var(--text-secondary)' }}>Entrada:</span> <strong>{new Date(selectedVehicle.entryDate).toLocaleDateString('es-MX')}</strong></div>
        {selectedVehicle.deliveredAt && (
          <div><span style={{ color: 'var(--text-secondary)' }}>Entregado:</span> <strong style={{ color: '#34d399' }}>{new Date(selectedVehicle.deliveredAt).toLocaleDateString('es-MX')}</strong></div>
        )}
      </div>

      {/* Damage details */}
      <div style={{ background: 'rgba(15,23,42,0.4)', borderRadius: '10px', border: '1px solid var(--panel-border)', padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detalles del Daño / Reparación</div>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>{selectedVehicle.details || 'Sin detalles registrados.'}</p>
      </div>

      {/* Admission Pass */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pase de Admisión</div>
        {selectedVehicle.admissionPassUrl ? (
          <div className="admission-pass-box" onClick={() => setLightboxSrc(selectedVehicle.admissionPassUrl)}>
            <img src={selectedVehicle.admissionPassUrl} alt="Pase de Admisión" />
          </div>
        ) : (
          <div className="photo-gallery-empty">
            <FileText size={24} />
            <span>Sin pase de admisión</span>
          </div>
        )}
      </div>

      <div className="section-divider" />

      {/* Status toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="status-toggle">
          <strong style={{ fontSize: '0.9rem' }}>Estatus en Taller:</strong>
          <label className="switch">
            <input
              type="checkbox"
              checked={selectedVehicle.active}
              onChange={() => handleToggleStatus(selectedVehicle.folio, selectedVehicle.active)}
              disabled={!isEditable}
            />
            <span className="slider" />
          </label>
          <span style={{ fontSize: '0.8rem', color: selectedVehicle.active ? '#34d399' : '#f87171' }}>
            {selectedVehicle.active ? 'En Taller' : 'Entregado / Inactivo'}
          </span>
        </div>
        {isEditable && selectedVehicle.active && (
          <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 15px rgba(16,185,129,0.2)' }} onClick={handleMarkDelivered}>
            <CheckSquare size={16} />
            <span>Marcar Entregado</span>
          </button>
        )}
      </div>
    </div>
  );

  const renderProcessTab = () => (
    <div>
      {/* Hojalatería */}
      <div className="process-section">
        <div className="process-section-header">
          <div className="process-section-title">
            <Hammer size={18} style={{ color: '#fbbf24' }} />
            <span>Hojalatería</span>
          </div>
          <ProcessStatusSelector
            value={selectedVehicle.bodyworkStatus || 'pendiente'}
            onChange={(v) => handleUpdateProcessStatus('bodyworkStatus', v)}
            disabled={!isEditable}
          />
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Estado actual: <span className={`process-badge ${selectedVehicle.bodyworkStatus || 'pendiente'}`} style={{ cursor: 'default', fontSize: '0.8rem' }}>
            {PROCESS_LABELS[selectedVehicle.bodyworkStatus || 'pendiente']}
          </span>
        </div>
      </div>

      {/* Mecánica */}
      <div className="process-section">
        <div className="process-section-header">
          <div className="process-section-title">
            <Cog size={18} style={{ color: '#60a5fa' }} />
            <span>Mecánica</span>
          </div>
          <ProcessStatusSelector
            value={selectedVehicle.mechanicsStatus || 'pendiente'}
            onChange={(v) => handleUpdateProcessStatus('mechanicsStatus', v)}
            disabled={!isEditable}
          />
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Estado actual: <span className={`process-badge ${selectedVehicle.mechanicsStatus || 'pendiente'}`} style={{ cursor: 'default', fontSize: '0.8rem' }}>
            {PROCESS_LABELS[selectedVehicle.mechanicsStatus || 'pendiente']}
          </span>
        </div>
      </div>

      {/* Materials Summary */}
      <div className="section-divider" />
      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Material Gastado en este Vehículo</h4>
      {getVehicleOutgoings(selectedVehicle.folio).length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Sin salidas de material registradas.</p>
      ) : (
        <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
          <table className="custom-table" style={{ fontSize: '0.8rem' }}>
            <thead>
              <tr><th>Fecha</th><th>Material</th><th style={{ textAlign: 'center' }}>Cant</th><th style={{ textAlign: 'right' }}>Total (c/IVA)</th></tr>
            </thead>
            <tbody>
              {getVehicleOutgoings(selectedVehicle.folio).map(o => (
                <tr key={o.id}>
                  <td>{new Date(o.date).toLocaleDateString('es-MX')}</td>
                  <td style={{ fontWeight: 500, color: 'white' }}>{o.materialName}</td>
                  <td style={{ textAlign: 'center' }}>{o.quantity}</td>
                  <td style={{ textAlign: 'right' }}>${((o.costPerUnit || 0) * (o.quantity || 0) * 1.16).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Costo total acumulado (con IVA):</span>
        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#34d399' }}>${getVehicleTotalCost(selectedVehicle.folio).toFixed(2)}</span>
      </div>

      {/* Deliver Button */}
      {isEditable && selectedVehicle.active && (
        <>
          <div className="section-divider" />
          <div className="delivery-confirm-box">
            <CheckCircle size={28} style={{ color: '#34d399', marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              ¿El vehículo ya está listo? Márcalo como entregado para cerrarlo.
            </p>
            <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }} onClick={handleMarkDelivered}>
              <CheckSquare size={16} /> <span>Confirmar Entrega del Vehículo</span>
            </button>
          </div>
        </>
      )}
    </div>
  );

  const renderPartsTab = () => {
    const orderedParts = selectedVehicle.orderedParts || [];
    return (
      <div>
        {/* Piezas del Almacén */}
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Package size={16} style={{ color: 'var(--primary)' }} />
          Piezas del Almacén (Salidas Registradas)
        </h4>
        {getVehicleOutgoings(selectedVehicle.folio).length === 0 ? (
          <div style={{ background: 'rgba(15,23,42,0.3)', borderRadius: '10px', padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', border: '1px solid var(--panel-border)' }}>
            Sin piezas del almacén usadas. Regístralas en el módulo de <strong>Salidas</strong>.
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '1.5rem' }}>
            <table className="custom-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr><th>Material</th><th>Cant</th><th>Técnico</th><th style={{ textAlign: 'right' }}>Costo (IVA)</th></tr>
              </thead>
              <tbody>
                {getVehicleOutgoings(selectedVehicle.folio).map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 500, color: 'white' }}>{o.materialName}</td>
                    <td>{o.quantity}</td>
                    <td style={{ fontSize: '0.75rem' }}>{o.technicianName}</td>
                    <td style={{ textAlign: 'right' }}>${((o.costPerUnit || 0) * (o.quantity || 0) * 1.16).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="section-divider" />

        {/* Piezas Encargadas / Pedidas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShoppingCart size={16} style={{ color: '#fbbf24' }} />
            Piezas Encargadas / Pedidas
          </h4>
          {isEditable && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddPartForm(p => !p)}>
              <PlusCircle size={14} />
              <span>{showAddPartForm ? 'Cancelar' : 'Agregar Pieza'}</span>
            </button>
          )}
        </div>

        {/* Add part form */}
        {showAddPartForm && (
          <div className="add-update-form" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Nombre de la Pieza *</label>
                <input className="input-field" style={{ padding: '0.5rem 0.75rem' }} value={partName} onChange={e => setPartName(e.target.value)} placeholder="ej. Amortiguador delantero" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Proveedor</label>
                <input className="input-field" style={{ padding: '0.5rem 0.75rem' }} value={partSupplier} onChange={e => setPartSupplier(e.target.value)} placeholder="ej. Refaccionaria Pérez" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Cantidad</label>
                <input className="input-field" style={{ padding: '0.5rem 0.75rem' }} type="number" min={1} value={partQty} onChange={e => setPartQty(parseInt(e.target.value) || 1)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Notas</label>
                <input className="input-field" style={{ padding: '0.5rem 0.75rem' }} value={partNotes} onChange={e => setPartNotes(e.target.value)} placeholder="ej. Pedido el lunes" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button className="btn btn-primary btn-sm" onClick={handleSaveOrderedPart} disabled={savingPart}>
                <Save size={14} />
                <span>{savingPart ? 'Guardando...' : 'Guardar Pieza'}</span>
              </button>
            </div>
          </div>
        )}

        {orderedParts.length === 0 ? (
          <div style={{ background: 'rgba(15,23,42,0.3)', borderRadius: '10px', padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px solid var(--panel-border)' }}>
            No hay piezas encargadas registradas.
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr><th>Pieza</th><th>Proveedor</th><th style={{ textAlign: 'center' }}>Cant</th><th style={{ textAlign: 'center' }}>Estatus</th><th>Notas</th></tr>
              </thead>
              <tbody>
                {orderedParts.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500, color: 'white' }}>{p.name}</td>
                    <td>{p.supplier || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{p.quantity}</td>
                    <td style={{ textAlign: 'center' }}>
                      {isEditable ? (
                        <select
                          className="parts-status-select"
                          value={p.status}
                          onChange={e => handleUpdatePartStatus(p, e.target.value)}
                          style={{
                            color: p.status === 'recibido' ? '#34d399' : p.status === 'pedido' ? '#fbbf24' : '#94a3b8'
                          }}
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="pedido">Pedido</option>
                          <option value="recibido">Recibido</option>
                        </select>
                      ) : (
                        <span className={`process-mini-badge ${p.status === 'recibido' ? 'terminado' : p.status === 'pedido' ? 'en_proceso' : 'pendiente'}`}>
                          {PART_STATUS_LABELS[p.status] || p.status}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.75rem' }}>{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderBitacoraTab = () => (
    <div>
      {/* Add Update Form */}
      {isEditable && (
        <div className="add-update-form">
          <div className="add-update-form-title">
            <PlusCircle size={16} />
            Agregar Actualización de Hoy — {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Hammer size={13} /> Nota de Hojalatería</label>
            <textarea
              className="input-field"
              rows={2}
              value={newUpdateBodywork}
              onChange={e => setNewUpdateBodywork(e.target.value)}
              placeholder="¿Qué se trabajó hoy en hojalatería?"
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Cog size={13} /> Nota de Mecánica</label>
            <textarea
              className="input-field"
              rows={2}
              value={newUpdateMechanics}
              onChange={e => setNewUpdateMechanics(e.target.value)}
              placeholder="¿Qué se trabajó hoy en mecánica?"
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><BookOpen size={13} /> Nota General</label>
            <textarea
              className="input-field"
              rows={2}
              value={newUpdateGeneral}
              onChange={e => setNewUpdateGeneral(e.target.value)}
              placeholder="Notas generales del día (observaciones, pendientes, etc.)"
            />
          </div>
          {/* Update photos */}
          {newUpdatePhotos.length > 0 && (
            <div className="photo-gallery" style={{ marginBottom: '0.75rem' }}>
              {newUpdatePhotos.map((url, i) => (
                <div key={i} className="photo-gallery-item" style={{ position: 'relative' }}>
                  <img src={url} alt="" />
                  <button
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239,68,68,0.8)', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', color: 'white', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setNewUpdatePhotos(p => p.filter((_, j) => j !== i))}
                  >✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)', border: '1px dashed var(--panel-border)', borderRadius: '8px', padding: '0.4rem 0.75rem' }}>
              <Camera size={14} />
              <span>Agregar foto del progreso</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpdatePhoto} />
            </label>
            <button className="btn btn-primary btn-sm" onClick={handleSaveUpdate} disabled={savingUpdate}>
              <Save size={14} />
              <span>{savingUpdate ? 'Guardando...' : 'Guardar Actualización'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {updatesLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Cargando bitácora...</div>
      ) : vehicleUpdates.length === 0 ? (
        <div style={{ background: 'rgba(15,23,42,0.3)', borderRadius: '10px', padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', border: '1px solid var(--panel-border)' }}>
          <BookOpen size={32} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
          <p style={{ fontSize: '0.9rem' }}>No hay registros en la bitácora aún.</p>
          <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Agrega la primera actualización del día.</p>
        </div>
      ) : (
        <div className="timeline">
          {vehicleUpdates.map(u => (
            <div key={u.id} className="timeline-item">
              <div className="timeline-dot" />
              <div className="timeline-card">
                <div className="timeline-header">
                  <span className="timeline-date">
                    {new Date(u.createdAt).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {' — '}
                    {new Date(u.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="timeline-author">{u.technicianName}</span>
                </div>
                <div className="timeline-notes">
                  {u.bodyworkNote && (
                    <div className="timeline-note-row">
                      <span className="timeline-note-label"><Hammer size={11} style={{ display: 'inline', marginRight: 3 }} />Hojalatería:</span>
                      <span className="timeline-note-text">{u.bodyworkNote}</span>
                    </div>
                  )}
                  {u.mechanicsNote && (
                    <div className="timeline-note-row">
                      <span className="timeline-note-label"><Cog size={11} style={{ display: 'inline', marginRight: 3 }} />Mecánica:</span>
                      <span className="timeline-note-text">{u.mechanicsNote}</span>
                    </div>
                  )}
                  {u.generalNote && (
                    <div className="timeline-note-row">
                      <span className="timeline-note-label"><BookOpen size={11} style={{ display: 'inline', marginRight: 3 }} />General:</span>
                      <span className="timeline-note-text">{u.generalNote}</span>
                    </div>
                  )}
                </div>
                {/* Progress photos */}
                {(u.photosAdded || []).length > 0 && (
                  <div className="photo-gallery" style={{ marginTop: '0.75rem' }}>
                    {(u.photosAdded || []).map((url, i) => (
                      <div key={i} className="photo-gallery-item" onClick={() => setLightboxSrc(url)}>
                        <img src={url} alt="" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ---- Main Render ----
  return (
    <div>
      {/* Lightbox */}
      {lightboxSrc && (
        <div className="lightbox-overlay" onClick={() => setLightboxSrc(null)}>
          <button className="lightbox-close" onClick={() => setLightboxSrc(null)}>✕</button>
          <img src={lightboxSrc} alt="Vista ampliada" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestión de Vehículos</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Seguimiento completo del proceso de reparación — Hojalatería, Mecánica y Bitácora diaria.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleReportGeneral} disabled={vehicles.length === 0}>
            <FileText size={18} /><span>Reporte General</span>
          </button>
          {isEditable && (
            <button className="btn btn-primary" onClick={handleOpenAdd}>
              <Plus size={18} /><span>Registrar Vehículo</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Vehículos', value: vehicles.length, color: 'primary' },
          { label: 'En Taller', value: vehicles.filter(v => v.active).length, color: 'warning' },
          { label: 'Hojalatería Activa', value: vehicles.filter(v => v.bodyworkStatus === 'en_proceso').length, color: 'secondary' },
          { label: 'Mecánica Activa', value: vehicles.filter(v => v.mechanicsStatus === 'en_proceso').length, color: 'success' },
        ].map(s => (
          <div key={s.label} className="glass-panel stat-card">
            <div className={`stat-icon ${s.color}`}>
              <Car size={22} />
            </div>
            <div className="stat-info">
              <span className="stat-label">{s.label}</span>
              <span className="stat-value">{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="search-filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por folio, orden, modelo, placa..."
            className="input-field"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="select-field" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ maxWidth: '150px' }}>
          <option value="">Todos los Tipos</option>
          <option value="Coche">Coche</option>
          <option value="Tracto">Tracto / Camión</option>
          <option value="Motocicleta">Motocicleta</option>
        </select>
        <select className="select-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ maxWidth: '150px' }}>
          <option value="">Todos los Estatus</option>
          <option value="activo">En Taller</option>
          <option value="inactivo">Entregado</option>
        </select>
        <select className="select-field" value={processFilter} onChange={e => setProcessFilter(e.target.value)} style={{ maxWidth: '160px' }}>
          <option value="">Todos los Procesos</option>
          <option value="hojalateria">Hojalatería Activa</option>
          <option value="mecanica">Mecánica Activa</option>
          <option value="terminado">Ambos Terminados</option>
        </select>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Cargando vehículos...
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No se encontraron vehículos con los filtros seleccionados.
        </div>
      ) : (
        <div className="cards-grid">
          {filteredVehicles.map(v => {
            const totalCostVal = getVehicleTotalCost(v.folio);
            const mainPhoto = (v.imageUrls || [])[0] || v.imageUrl || '';
            return (
              <div key={v.folio} className="glass-panel vehicle-card" onClick={() => handleOpenDetails(v)}>
                <div className="vehicle-card-img">
                  {mainPhoto ? (
                    <img src={mainPhoto} alt={`Vehículo ${v.folio}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      {getVehicleIcon(v.type)}
                      <span style={{ fontSize: '0.8rem' }}>Sin Imagen</span>
                    </div>
                  )}
                  {/* Status overlay badge */}
                  <div style={{ position: 'absolute', top: 10, right: 10 }}>
                    <span className={`badge ${v.active ? 'badge-warning' : 'badge-success'}`}>
                      {v.active ? 'En Taller' : 'Entregado'}
                    </span>
                  </div>
                </div>

                <div className="vehicle-card-info">
                  {v.orderNumber && <div className="vehicle-order-number">📋 {v.orderNumber}</div>}
                  <div className="vehicle-card-header">
                    <div>
                      <h3 className="vehicle-card-title">{v.folio}</h3>
                      {v.model && <div className="vehicle-model-name">{v.model}</div>}
                      <span className="vehicle-card-plate">{v.plate}</span>
                    </div>
                  </div>

                  {/* Process mini badges */}
                  <div className="vehicle-card-process-bar">
                    <span className={`process-mini-badge ${v.bodyworkStatus || 'pendiente'}`}>
                      🔨 {PROCESS_LABELS[v.bodyworkStatus || 'pendiente']}
                    </span>
                    <span className={`process-mini-badge ${v.mechanicsStatus || 'pendiente'}`}>
                      ⚙️ {PROCESS_LABELS[v.mechanicsStatus || 'pendiente']}
                    </span>
                  </div>

                  <p className="vehicle-card-detail">{v.details || 'Sin detalles'}</p>

                  <div style={{ fontSize: '0.82rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Tipo: <strong>{v.type}</strong></span>
                    <span style={{ color: totalCostVal > 0 ? '#34d399' : 'var(--text-secondary)', fontWeight: 600 }}>
                      ${totalCostVal.toFixed(2)}
                    </span>
                  </div>

                  <div className="vehicle-card-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} />
                      <span>{new Date(v.entryDate).toLocaleDateString('es-MX')}</span>
                    </div>
                    {isEditable && (
                      <button
                        onClick={e => handleOpenEdit(v, e)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        <Settings size={12} /><span>Editar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ====== ADD / EDIT MODAL ====== */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{isEditMode ? `Editar Vehículo: ${formFolio}` : 'Registrar Nuevo Vehículo'}</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            {formError && (
              <div className="badge badge-danger" style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem', boxSizing: 'border-box' }}>
                <AlertCircle size={14} /> {formError}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Row 1: Folio + Order Number */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Folio (ID Interno) *</label>
                  <input
                    type="text" className="input-field" value={formFolio}
                    onChange={e => setFormFolio(e.target.value)}
                    placeholder="ej. V-1005" disabled={isEditMode} required
                  />
                </div>
                <div className="form-group">
                  <label>Número de Orden</label>
                  <input
                    type="text" className="input-field" value={formOrderNumber}
                    onChange={e => setFormOrderNumber(e.target.value)}
                    placeholder="ej. ORD-2026-010"
                  />
                </div>
              </div>

              {/* Row 2: Model + Plate */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Modelo del Vehículo</label>
                  <input
                    type="text" className="input-field" value={formModel}
                    onChange={e => setFormModel(e.target.value)}
                    placeholder="ej. Chevrolet Aveo 2018"
                  />
                </div>
                <div className="form-group">
                  <label>Placas *</label>
                  <input
                    type="text" className="input-field" value={formPlate}
                    onChange={e => setFormPlate(e.target.value)}
                    placeholder="ej. XYZ-456-B" required
                  />
                </div>
              </div>

              {/* Row 3: Type + Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Tipo de Vehículo</label>
                  <select className="select-field" value={formType} onChange={e => setFormType(e.target.value)}>
                    <option value="Coche">Coche</option>
                    <option value="Tracto">Tracto / Camión</option>
                    <option value="Motocicleta">Motocicleta</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Fecha de Entrada</label>
                  <input
                    type="datetime-local" className="input-field" value={formEntryDate}
                    onChange={e => setFormEntryDate(e.target.value)} required
                  />
                </div>
              </div>

              {/* Row 4: Color + Insurance */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Color del Vehículo</label>
                  <input
                    type="text" className="input-field" value={formColor}
                    onChange={e => setFormColor(e.target.value)}
                    placeholder="ej. Rojo, Blanco perla, Gris"
                  />
                </div>
                <div className="form-group">
                  <label>Aseguradora</label>
                  <input
                    type="text" className="input-field" value={formInsurance}
                    onChange={e => setFormInsurance(e.target.value)}
                    placeholder="ej. GNP, AXA, Qualitas"
                  />
                </div>
              </div>

              {/* Damage details */}
              <div className="form-group">
                <label>Detalles del Daño / Reparación</label>
                <textarea
                  className="input-field" value={formDetails}
                  onChange={e => setFormDetails(e.target.value)}
                  placeholder="Describe el daño, falla o trabajos a realizar..."
                  rows={3}
                />
              </div>

              {/* Process status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Hammer size={13} /> Estado de Hojalatería
                  </label>
                  <ProcessStatusSelector value={formBodyworkStatus} onChange={setFormBodyworkStatus} />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Cog size={13} /> Estado de Mecánica
                  </label>
                  <ProcessStatusSelector value={formMechanicsStatus} onChange={setFormMechanicsStatus} />
                </div>
              </div>

              {/* Vehicle Photos — 4 slots */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Camera size={13} /> Fotografías del Vehículo (hasta 4)
                </label>
                <div className="multi-upload-zone">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="upload-slot">
                      {formImageUrls[i] ? (
                        <>
                          <img src={formImageUrls[i]} alt="" />
                          <button type="button" className="remove-photo" onClick={() => handleRemovePhoto(i)}>✕</button>
                        </>
                      ) : (
                        <>
                          <Camera size={18} />
                          <span>Foto {i + 1}</span>
                          <input type="file" accept="image/*" onChange={e => handleAddPhoto(e, i)} />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Admission Pass */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FileText size={13} /> Pase de Admisión (imagen)
                </label>
                <div className="image-upload-box" style={{ height: '100px' }}>
                  {formAdmissionPass ? (
                    <>
                      <img src={formAdmissionPass} className="image-preview" alt="Pase" style={{ height: '100%', objectFit: 'contain' }} />
                      <button type="button" style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(239,68,68,0.8)', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', color: 'white', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setFormAdmissionPass('')}>✕</button>
                    </>
                  ) : (
                    <>
                      <Upload size={20} />
                      <span style={{ fontSize: '0.8rem' }}>Pase de admisión (Máx. 600 KB)</span>
                      <input type="file" accept="image/*" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} onChange={handleAdmissionPassChange} />
                    </>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">
                  <Save size={16} /> <span>Guardar Vehículo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====== DETAIL MODAL — 4 TABS ====== */}
      {showDetailModal && selectedVehicle && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content-wide">
            <div className="modal-header" style={{ marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, marginBottom: '0.15rem' }}>
                  {selectedVehicle.orderNumber || selectedVehicle.folio}
                </div>
                <h3 className="modal-title">
                  {selectedVehicle.model || selectedVehicle.folio}
                  <span style={{ marginLeft: '0.5rem', fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    [{selectedVehicle.plate}]
                  </span>
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => handleReportVehicle(selectedVehicle)}>
                  <FileText size={14} /><span>PDF</span>
                </button>
                <button className="modal-close" onClick={() => setShowDetailModal(false)}>✕</button>
              </div>
            </div>

            {/* Tabs */}
            <div className="tabs-header">
              {[
                { id: 'info', label: 'Información', icon: <Info size={14} /> },
                { id: 'process', label: 'Proceso de Reparación', icon: <Wrench size={14} /> },
                { id: 'parts', label: 'Piezas', icon: <Package size={14} /> },
                { id: 'bitacora', label: 'Bitácora Diaria', icon: <BookOpen size={14} /> },
              ].map(t => (
                <button
                  key={t.id}
                  className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div>
              {activeTab === 'info' && renderInfoTab()}
              {activeTab === 'process' && renderProcessTab()}
              {activeTab === 'parts' && renderPartsTab()}
              {activeTab === 'bitacora' && renderBitacoraTab()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vehicles;
