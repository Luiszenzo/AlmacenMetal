import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  Plus,
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  FileText,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  Car,
  AlertCircle,
  X,
  Save,
  DollarSign,
  Calendar,
  Building2,
  Hash,
  Sparkles,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import {
  getVehiclesList,
  getAllPartsList,
  saveOrderedPart,
  deleteOrderedPart,
  saveProvisionalVehicleForSiniestro
} from '../config/dbService';
import { generatePartsPDF, exportToCSV } from '../utils/reports';

const PEDIDO_SUGGESTIONS = ['AGENCIA', 'TAPICERO', 'MOSTRADOR', 'ALMACÉN', 'TALLER', 'PENDIENTE', 'LISTO'];
const OC_STATUS_SUGGESTIONS = ['ENTREGADO', 'EN AGENCIA', 'PENDIENTE', 'LISTO', 'EN CAMINO', 'COTIZADO'];

const formatCurrency = (val) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0);
};

const Parts = ({ currentUser, onNavigateToVehicle }) => {
  const [parts, setParts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Vehicle searchable combobox
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  // Form Fields
  const [formPartId, setFormPartId] = useState('');
  const [formVehicleFolio, setFormVehicleFolio] = useState('');
  const [formItemNo, setFormItemNo] = useState('');
  const [formName, setFormName] = useState('');
  const [formSupplier, setFormSupplier] = useState('AGENCIA');
  const [formPurchaseOrder, setFormPurchaseOrder] = useState('PENDIENTE');
  const [formDeliveryDate, setFormDeliveryDate] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const isEditable = currentUser?.role === 'admin' || currentUser?.role === 'encargado';

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [vList, pList] = await Promise.all([
        getVehiclesList(),
        getAllPartsList()
      ]);
      setVehicles(vList || []);
      setParts(pList || []);
    } catch (err) {
      console.error('Error cargando refacciones y vehículos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Quick lookup of selected vehicle in the modal
  const currentSelectedVehicleInForm = useMemo(() => {
    return vehicles.find(v => v.folio === formVehicleFolio);
  }, [vehicles, formVehicleFolio]);

  // Open Modal for Create
  const handleOpenCreate = (preselectedFolio = '') => {
    setIsEditMode(false);
    setFormPartId('');
    const targetFolio = preselectedFolio || selectedVehicleFilter || '';
    setFormVehicleFolio(targetFolio);

    // Set vehicle search label if preselecting
    if (targetFolio) {
      const v = vehicles.find(x => x.folio === targetFolio);
      setVehicleSearch(v ? `${v.orderNumber || v.folio} — ${v.plate}` : '');
    } else {
      setVehicleSearch('');
    }
    setShowVehicleDropdown(false);

    // Auto-calculate next item number for this vehicle
    const vehicleParts = parts.filter(p => p.vehicleFolio === targetFolio);
    setFormItemNo(vehicleParts.length + 1);

    setFormName('');
    setFormSupplier('AGENCIA');
    setFormPurchaseOrder('PENDIENTE');
    setFormDeliveryDate('');
    setFormCost('');
    setFormNotes('');
    setFormError('');
    setShowModal(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (part) => {
    setIsEditMode(true);
    setFormPartId(part.id);
    setFormVehicleFolio(part.vehicleFolio);
    // Restore vehicle search label
    const v = vehicles.find(x => x.folio === part.vehicleFolio);
    setVehicleSearch(v ? `${v.orderNumber || v.folio} — ${v.plate}` : part.vehicleFolio);
    setShowVehicleDropdown(false);
    setFormItemNo(part.itemNo || 1);
    setFormName(part.name || '');
    setFormSupplier(part.supplier || 'AGENCIA');
    setFormPurchaseOrder(part.purchaseOrder || part.status || 'PENDIENTE');
    setFormDeliveryDate(part.deliveryDate || '');
    setFormCost(part.cost !== undefined ? part.cost : '');
    setFormNotes(part.notes || '');
  };

  // Create & Select provisional vehicle for unregistered siniestro
  const handleSelectProvisionalSiniestro = async (siniestroVal) => {
    try {
      const clean = (siniestroVal || '').trim().toUpperCase();
      if (!clean) return;
      const provVeh = await saveProvisionalVehicleForSiniestro(clean);
      // Reload vehicles list to keep in sync
      const vList = await getVehiclesList();
      setVehicles(vList || []);
      setFormVehicleFolio(provVeh.folio);
      setVehicleSearch(`${provVeh.orderNumber} (Pendiente de Alta)`);
      setShowVehicleDropdown(false);
      const vParts = parts.filter(p => p.vehicleFolio === provVeh.folio);
      setFormItemNo(vParts.length + 1);
    } catch (err) {
      console.error('Error al crear registro provisional:', err);
      setFormError('Error al crear vehículo provisional: ' + err.message);
    }
  };

  // Save Part (Create or Update)
  const handleSavePart = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formVehicleFolio) {
      setFormError('Por favor selecciona un vehículo.');
      return;
    }
    if (!formName.trim()) {
      setFormError('El nombre de la refacción es requerido.');
      return;
    }

    setSaving(true);
    try {
      const partPayload = {
        id: formPartId || undefined,
        itemNo: parseInt(formItemNo) || 1,
        name: formName.trim().toUpperCase(),
        supplier: formSupplier.trim().toUpperCase(),
        purchaseOrder: formPurchaseOrder.trim().toUpperCase(),
        status: formPurchaseOrder.trim().toLowerCase(),
        deliveryDate: formDeliveryDate || '',
        cost: parseFloat(formCost) || 0,
        notes: formNotes.trim()
      };

      await saveOrderedPart(formVehicleFolio, partPayload);
      await loadData();
      setShowModal(false);
    } catch (err) {
      console.error('Error al guardar refacción:', err);
      setFormError(err.message || 'Error al guardar la pieza.');
    } finally {
      setSaving(false);
    }
  };

  // Quick Status Change directly from the table
  const handleQuickStatusChange = async (part, newStatus) => {
    if (!isEditable) return;
    try {
      await saveOrderedPart(part.vehicleFolio, {
        ...part,
        purchaseOrder: newStatus.toUpperCase(),
        status: newStatus.toLowerCase()
      });
      await loadData();
    } catch (err) {
      console.error('Error al actualizar estatus:', err);
    }
  };

  // Delete Part
  const handleDeletePart = async (part) => {
    if (!isEditable) return;
    const confirmDelete = window.confirm(`¿Estás seguro de eliminar la refacción "${part.name}" del vehículo ${part.vehicleFolio}?`);
    if (!confirmDelete) return;

    try {
      await deleteOrderedPart(part.vehicleFolio, part.id);
      await loadData();
    } catch (err) {
      console.error('Error al eliminar refacción:', err);
      alert('Error al eliminar refacción: ' + err.message);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "SINIESTRO",
      "MARCA",
      "MODELO",
      "AÑO",
      "COLOR",
      "PLACA",
      "SERIE",
      "UBICACIÓN",
      "NO",
      "REFACCIÓN",
      "PEDIDO",
      "ORDEN DE COMPRA",
      "FECHA ENTREGA",
      "COSTO"
    ];

    const data = filteredParts.map((p, idx) => [
      p.vehicleOrderNumber || p.vehicleFolio || '',
      p.vehicleBrand || '',
      p.vehicleModel || '',
      p.vehicleYear || '',
      p.vehicleColor || '',
      p.vehiclePlate || '',
      p.vehicleSerial || '',
      p.vehicleLocation || '',
      p.itemNo || (idx + 1),
      p.name || '',
      p.supplier || '',
      p.purchaseOrder || p.status || '',
      p.deliveryDate || '',
      p.cost || 0
    ]);

    exportToCSV(data, `Refacciones_Vehiculos_${new Date().toISOString().slice(0, 10)}`, headers);
  };

  // Export to PDF
  const handleExportPDF = () => {
    const filterDesc = selectedVehicleFilter 
      ? `Vehículo: ${selectedVehicleFilter}` 
      : selectedStatusFilter 
      ? `Estatus: ${selectedStatusFilter}` 
      : 'General';
    generatePartsPDF(filteredParts, filterDesc);
  };

  // Filtered Parts
  const filteredParts = useMemo(() => {
    return parts.filter(p => {
      const q = search.toLowerCase().trim();
      const matchesSearch = !q || (
        (p.name || '').toLowerCase().includes(q) ||
        (p.vehicleOrderNumber || '').toLowerCase().includes(q) ||
        (p.vehiclePlate || '').toLowerCase().includes(q) ||
        (p.vehicleFolio || '').toLowerCase().includes(q) ||
        (p.vehicleBrand || '').toLowerCase().includes(q) ||
        (p.vehicleModel || '').toLowerCase().includes(q) ||
        (p.vehicleSerial || '').toLowerCase().includes(q) ||
        (p.supplier || '').toLowerCase().includes(q) ||
        (p.purchaseOrder || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q)
      );

      const matchesVehicle = !selectedVehicleFilter || p.vehicleFolio === selectedVehicleFilter;

      let matchesStatus = true;
      if (selectedStatusFilter) {
        const po = (p.purchaseOrder || p.status || '').toLowerCase();
        if (selectedStatusFilter === 'pendiente') {
          matchesStatus = po.includes('pendiente');
        } else if (selectedStatusFilter === 'en_agencia') {
          matchesStatus = po.includes('agencia') || po.includes('pedido') || po.includes('camino');
        } else if (selectedStatusFilter === 'entregado') {
          matchesStatus = po.includes('entregado') || po.includes('recibido') || po.includes('listo');
        }
      }

      let matchesSupplier = true;
      if (selectedSupplierFilter) {
        matchesSupplier = (p.supplier || '').toUpperCase() === selectedSupplierFilter.toUpperCase();
      }

      return matchesSearch && matchesVehicle && matchesStatus && matchesSupplier;
    });
  }, [parts, search, selectedVehicleFilter, selectedStatusFilter, selectedSupplierFilter]);

  // Aggregated Stats
  const stats = useMemo(() => {
    const total = parts.length;
    let pending = 0;
    let inAgency = 0;
    let delivered = 0;
    let totalCost = 0;

    parts.forEach(p => {
      const statusStr = (p.purchaseOrder || p.status || '').toLowerCase();
      if (statusStr.includes('entregado') || statusStr.includes('recibido') || statusStr.includes('listo')) {
        delivered++;
      } else if (statusStr.includes('agencia') || statusStr.includes('pedido') || statusStr.includes('camino')) {
        inAgency++;
      } else {
        pending++;
      }
      totalCost += parseFloat(p.cost) || 0;
    });

    return { total, pending, inAgency, delivered, totalCost };
  }, [parts]);

  // Unique suppliers list for filter
  const suppliersList = useMemo(() => {
    const set = new Set();
    parts.forEach(p => {
      if (p.supplier && p.supplier.trim()) {
        set.add(p.supplier.trim().toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [parts]);

  return (
    <div className="view-container">
      {/* ====== HEADER ====== */}
      <div className="view-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h2 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Layers className="view-title-icon" style={{ color: 'var(--primary)' }} />
            Control de Refacciones y Piezas
          </h2>
          <p className="view-subtitle">
            Gestión detallada de piezas requeridas por vehículo, proveedores, órdenes de compra y control de costos.
          </p>
        </div>

        <div className="view-header-actions" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleExportCSV}
            title="Exportar listado completo a Excel / CSV"
          >
            <FileSpreadsheet size={16} />
            <span>Excel / CSV</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleExportPDF}
            style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171' }}
            title="Generar e imprimir Reporte Oficial en PDF"
          >
            <FileText size={16} />
            <span>Reporte PDF</span>
          </button>

          {isEditable && (
            <button className="btn btn-primary" onClick={() => handleOpenCreate()}>
              <Plus size={18} />
              <span>Nueva Refacción</span>
            </button>
          )}
        </div>
      </div>

      {/* ====== METRICS SUMMARY CARDS ====== */}
      <div className="metrics-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="metric-card glass-panel">
          <div className="metric-icon-box" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
            <Layers size={22} />
          </div>
          <div className="metric-details">
            <span className="metric-title">Total de Refacciones</span>
            <div className="metric-value">{stats.total}</div>
            <span className="metric-subtext">Piezas registradas</span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon-box" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <Clock size={22} />
          </div>
          <div className="metric-details">
            <span className="metric-title">Pendientes</span>
            <div className="metric-value" style={{ color: '#fbbf24' }}>{stats.pending}</div>
            <span className="metric-subtext">Por pedir o gestionar</span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon-box" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
            <Building2 size={22} />
          </div>
          <div className="metric-details">
            <span className="metric-title">En Agencia / Pedidas</span>
            <div className="metric-value" style={{ color: '#60a5fa' }}>{stats.inAgency}</div>
            <span className="metric-subtext">En proceso de surtido</span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon-box" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
            <CheckCircle2 size={22} />
          </div>
          <div className="metric-details">
            <span className="metric-title">Entregadas / Listas</span>
            <div className="metric-value" style={{ color: '#34d399' }}>{stats.delivered}</div>
            <span className="metric-subtext">Disponibles en taller</span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon-box" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>
            <DollarSign size={22} />
          </div>
          <div className="metric-details">
            <span className="metric-title">Inversión en Piezas</span>
            <div className="metric-value" style={{ fontSize: '1.25rem', color: '#f472b6' }}>
              {formatCurrency(stats.totalCost)}
            </div>
            <span className="metric-subtext">Costo total acumulado</span>
          </div>
        </div>
      </div>

      {/* ====== FILTER BAR ====== */}
      <div className="glass-panel filter-bar" style={{ padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
          {/* Search box */}
          <div className="search-box" style={{ flex: '1 1 250px', minWidth: '200px' }}>
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por Siniestro, Placa, Refacción, Proveedor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Vehicle Dropdown Filter */}
          <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
            <select
              className="select-field"
              value={selectedVehicleFilter}
              onChange={e => setSelectedVehicleFilter(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="">🚗 Todos los Vehículos ({vehicles.length})</option>
              {vehicles.map(v => (
                <option key={v.folio} value={v.folio}>
                  {v.orderNumber ? `[${v.orderNumber}] ` : ''}{v.plate || v.folio} - {v.brand || ''} {v.model || ''}
                </option>
              ))}
            </select>
          </div>

          {/* Status Dropdown Filter */}
          <div style={{ flex: '0 1 180px', minWidth: '150px' }}>
            <select
              className="select-field"
              value={selectedStatusFilter}
              onChange={e => setSelectedStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="">📌 Todos los Estatus</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_agencia">En Agencia / Pedido</option>
              <option value="entregado">Entregado / Listo</option>
            </select>
          </div>

          {/* Supplier Dropdown Filter */}
          {suppliersList.length > 0 && (
            <div style={{ flex: '0 1 180px', minWidth: '150px' }}>
              <select
                className="select-field"
                value={selectedSupplierFilter}
                onChange={e => setSelectedSupplierFilter(e.target.value)}
                style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
              >
                <option value="">🏬 Todos los Proveedores</option>
                {suppliersList.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {/* Clear filters */}
          {(search || selectedVehicleFilter || selectedStatusFilter || selectedSupplierFilter) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearch('');
                setSelectedVehicleFilter('');
                setSelectedStatusFilter('');
                setSelectedSupplierFilter('');
              }}
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
            >
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* ====== TABLE SECTION ====== */}
      {loading ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Layers className="animate-spin" size={32} style={{ color: 'var(--primary)', marginBottom: '0.75rem' }} />
          <p>Cargando catálogo de refacciones...</p>
        </div>
      ) : filteredParts.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
          <Layers size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.4 }} />
          <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', marginBottom: '0.4rem' }}>No se encontraron refacciones</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '450px', margin: '0 auto 1.5rem' }}>
            {search || selectedVehicleFilter || selectedStatusFilter
              ? 'No hay piezas que coincidan con los filtros aplicados. Intenta ajustarlos.'
              : 'Aún no se han registrado refacciones en el sistema. Agrega la primera para comenzar a llevar el control.'}
          </p>
          {isEditable && (
            <button className="btn btn-primary" onClick={() => handleOpenCreate()}>
              <Plus size={16} />
              <span>Registrar Primera Refacción</span>
            </button>
          )}
        </div>
      ) : (
        <div className="glass-panel" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="table-responsive" style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
            <table className="parts-master-table">
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>SINIESTRO</th>
                  <th style={{ width: '90px' }}>MARCA</th>
                  <th style={{ width: '110px' }}>MODELO</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>AÑO</th>
                  <th style={{ width: '90px' }}>COLOR</th>
                  <th style={{ width: '90px' }}>PLACA</th>
                  <th style={{ width: '130px' }}>SERIE</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>UBICACIÓN</th>
                  <th style={{ width: '45px', textAlign: 'center' }}>NO</th>
                  <th style={{ minWidth: '180px' }}>REFACCIÓN</th>
                  <th style={{ width: '110px', textAlign: 'center' }}>PEDIDO</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>ORDEN DE COMPRA</th>
                  <th style={{ width: '110px', textAlign: 'center' }}>F. ENTREGA</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>COSTO</th>
                  {isEditable && <th style={{ width: '90px', textAlign: 'center' }}>ACCIONES</th>}
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((part, index) => {
                  const statusStr = (part.purchaseOrder || part.status || '').toUpperCase();
                  const isDelivered = statusStr.includes('ENTREGADO') || statusStr.includes('LISTO') || statusStr.includes('RECIBIDO');
                  const isInAgency = statusStr.includes('AGENCIA') || statusStr.includes('PEDIDO') || statusStr.includes('CAMINO');
                  const isPending = statusStr.includes('PENDIENTE') || statusStr.includes('COTIZADO');

                  // Format Delivery Date
                  let formattedDate = '—';
                  if (part.deliveryDate) {
                    try {
                      formattedDate = new Date(part.deliveryDate + (part.deliveryDate.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('es-MX', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      });
                    } catch {
                      formattedDate = part.deliveryDate;
                    }
                  }

                  return (
                    <tr key={part.id || index} className="parts-table-row">
                      {/* SINIESTRO */}
                      <td className="cell-siniestro">
                        {part.vehicleFolio?.startsWith('SIN-') || part.vehiclePlate === 'PENDIENTE' ? (
                          <span style={{
                            background: 'rgba(245, 158, 11, 0.14)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: '5px',
                            padding: '0.2rem 0.5rem',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }} title="Siniestro pendiente de dar de alta en Vehículos">
                            ⏳ {part.vehicleOrderNumber || part.vehicleFolio?.replace('SIN-', '')}
                          </span>
                        ) : (
                          <span className="badge-siniestro" title={part.vehicleOrderNumber || part.vehicleFolio}>
                            {part.vehicleOrderNumber || part.vehicleFolio || '—'}
                          </span>
                        )}
                      </td>

                      {/* MARCA */}
                      <td className="cell-text" style={{ fontWeight: 600, color: '#e2e8f0' }}>
                        {part.vehicleBrand || '—'}
                      </td>

                      {/* MODELO */}
                      <td className="cell-text" style={{ color: '#cbd5e1' }}>
                        {part.vehicleModel || (part.vehicleFolio?.startsWith('SIN-') ? <em style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Pendiente de alta</em> : '—')}
                      </td>

                      {/* AÑO */}
                      <td className="cell-center" style={{ color: '#94a3b8' }}>
                        {part.vehicleYear || '—'}
                      </td>

                      {/* COLOR */}
                      <td className="cell-text" style={{ color: '#94a3b8' }}>
                        {part.vehicleColor || '—'}
                      </td>

                      {/* PLACA */}
                      <td className="cell-plate">
                        {part.vehiclePlate === 'PENDIENTE' ? (
                          <span style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            color: '#fbbf24',
                            border: '1px dashed rgba(245, 158, 11, 0.3)',
                            borderRadius: '4px',
                            padding: '0.15rem 0.4rem',
                            fontSize: '0.68rem',
                            fontWeight: 600
                          }}>
                            Sin alta
                          </span>
                        ) : (
                          <span className="plate-badge">{part.vehiclePlate || '—'}</span>
                        )}
                      </td>

                      {/* SERIE (VIN) */}
                      <td className="cell-serie" title={part.vehicleSerial || ''}>
                        {part.vehicleSerial || '—'}
                      </td>

                      {/* UBICACIÓN */}
                      <td className="cell-center">
                        <span className="location-badge">
                          {part.vehicleLocation || 'PISO'}
                        </span>
                      </td>

                      {/* NO */}
                      <td className="cell-center" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {part.itemNo || (index + 1)}
                      </td>

                      {/* REFACCIÓN */}
                      <td className="cell-refaccion">
                        <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.85rem' }}>
                          {part.name}
                        </div>
                        {part.notes && (
                          <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: '2px', fontStyle: 'italic' }}>
                            {part.notes}
                          </div>
                        )}
                      </td>

                      {/* PEDIDO / PROVEEDOR */}
                      <td className="cell-center">
                        <span className={`pedido-badge ${part.supplier?.toLowerCase() === 'agencia' ? 'agencia' : part.supplier?.toLowerCase() === 'tapicero' ? 'tapicero' : 'general'}`}>
                          {part.supplier || '—'}
                        </span>
                      </td>

                      {/* ORDEN DE COMPRA / ESTATUS */}
                      <td className="cell-center">
                        {isEditable ? (
                          <select
                            className={`parts-inline-select ${isDelivered ? 'status-delivered' : isInAgency ? 'status-agency' : 'status-pending'}`}
                            value={part.purchaseOrder || part.status || 'PENDIENTE'}
                            onChange={(e) => handleQuickStatusChange(part, e.target.value)}
                          >
                            <option value="PENDIENTE">PENDIENTE</option>
                            <option value="EN AGENCIA">EN AGENCIA</option>
                            <option value="PEDIDO">PEDIDO</option>
                            <option value="EN CAMINO">EN CAMINO</option>
                            <option value="ENTREGADO">ENTREGADO</option>
                            <option value="LISTO">LISTO</option>
                            <option value="COTIZADO">COTIZADO</option>
                          </select>
                        ) : (
                          <span className={`status-badge-static ${isDelivered ? 'status-delivered' : isInAgency ? 'status-agency' : 'status-pending'}`}>
                            {part.purchaseOrder || part.status || 'PENDIENTE'}
                          </span>
                        )}
                      </td>

                      {/* FECHA ENTREGA */}
                      <td className="cell-center" style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                        {formattedDate}
                      </td>

                      {/* COSTO */}
                      <td className="cell-cost">
                        {part.cost > 0 ? (
                          <span style={{ fontWeight: 700, color: '#34d399' }}>
                            {formatCurrency(part.cost)}
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>$ 0.00</span>
                        )}
                      </td>

                      {/* ACCIONES */}
                      {isEditable && (
                        <td className="cell-actions">
                          <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                            <button
                              className="action-btn action-edit"
                              onClick={() => handleOpenEdit(part)}
                              title="Editar refacción"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              className="action-btn action-delete"
                              onClick={() => handleDeletePart(part)}
                              title="Eliminar refacción"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="parts-table-footer">
                  <td colSpan={8} style={{ textAlign: 'left', paddingLeft: '1rem', fontWeight: 600 }}>
                    TOTALES: {filteredParts.length} Refacciones listadas
                  </td>
                  <td className="cell-center" style={{ fontWeight: 700 }}>
                    {filteredParts.length}
                  </td>
                  <td colSpan={4}></td>
                  <td className="cell-cost" style={{ fontSize: '0.95rem', fontWeight: 800, color: '#34d399' }}>
                    {formatCurrency(filteredParts.reduce((acc, p) => acc + (parseFloat(p.cost) || 0), 0))}
                  </td>
                  {isEditable && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ====== ADD / EDIT MODAL ====== */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={20} style={{ color: 'var(--primary)' }} />
                {isEditMode ? 'Editar Refacción' : 'Registrar Nueva Refacción'}
              </h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {formError && (
              <div className="badge badge-danger" style={{ width: '100%', marginBottom: '1rem', padding: '0.6rem', boxSizing: 'border-box' }}>
                <AlertCircle size={15} /> {formError}
              </div>
            )}

            <form onSubmit={handleSavePart}>
              {/* ── Vehicle Searchable Combobox ── */}
              <div className="form-group" style={{ position: 'relative' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Car size={14} style={{ color: 'var(--primary)' }} />
                  Vehículo Asignado *
                </label>

                {isEditMode ? (
                  /* In edit mode just show a read-only chip */
                  <div style={{
                    padding: '0.65rem 1rem',
                    background: 'rgba(15,23,42,0.6)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '10px',
                    color: '#94a3b8',
                    fontSize: '0.88rem'
                  }}>
                    {vehicleSearch || formVehicleFolio}
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    {/* Search text input */}
                    <div className="search-box" style={{ width: '100%' }}>
                      <Search size={15} className="search-icon" />
                      <input
                        type="text"
                        className="search-input"
                        placeholder="Buscar por Siniestro, Placa, Marca, Modelo..."
                        value={vehicleSearch}
                        onChange={e => {
                          setVehicleSearch(e.target.value);
                          setFormVehicleFolio('');
                          setShowVehicleDropdown(true);
                        }}
                        onFocus={() => setShowVehicleDropdown(true)}
                        onBlur={() => setTimeout(() => setShowVehicleDropdown(false), 180)}
                        autoComplete="off"
                      />
                      {vehicleSearch && (
                        <button
                          type="button"
                          onClick={() => { setVehicleSearch(''); setFormVehicleFolio(''); setShowVehicleDropdown(false); }}
                          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, display: 'flex' }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Dropdown results */}
                    {showVehicleDropdown && (() => {
                      const q = vehicleSearch.toLowerCase().trim();
                      const filtered = vehicles.filter(v =>
                        !q ||
                        (v.orderNumber || '').toLowerCase().includes(q) ||
                        (v.plate || '').toLowerCase().includes(q) ||
                        (v.brand || '').toLowerCase().includes(q) ||
                        (v.model || '').toLowerCase().includes(q) ||
                        (v.folio || '').toLowerCase().includes(q) ||
                        (v.serial || '').toLowerCase().includes(q)
                      ).slice(0, 12);

                      return (
                        <div style={{
                          position: 'absolute',
                          top: 'calc(100% + 4px)',
                          left: 0,
                          right: 0,
                          background: 'rgba(10, 14, 26, 0.98)',
                          backdropFilter: 'blur(16px)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          zIndex: 999,
                          maxHeight: '260px',
                          overflowY: 'auto',
                          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                          scrollbarWidth: 'thin'
                        }}>
                          {/* Option to use custom/unregistered Siniestro */}
                          {vehicleSearch.trim() && (
                            <button
                              type="button"
                              onMouseDown={() => handleSelectProvisionalSiniestro(vehicleSearch.trim())}
                              style={{
                                width: '100%',
                                background: 'rgba(245, 158, 11, 0.08)',
                                border: 'none',
                                borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
                                padding: '0.75rem 1rem',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                color: '#fbbf24',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.15)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.08)'}
                            >
                              <Plus size={15} style={{ flexShrink: 0 }} />
                              <span>
                                Usar Siniestro no dado de alta: <strong style={{ color: '#fff', textDecoration: 'underline' }}>{vehicleSearch.trim().toUpperCase()}</strong>
                                <span style={{ display: 'block', fontSize: '0.7rem', color: '#fcd34d', opacity: 0.85, fontWeight: 400, marginTop: '2px' }}>
                                  Podrás vincularlo automáticamente cuando registres el vehículo.
                                </span>
                              </span>
                            </button>
                          )}

                          {filtered.map(v => (
                            <button
                              key={v.folio}
                              type="button"
                              onMouseDown={() => {
                                setFormVehicleFolio(v.folio);
                                setVehicleSearch(v.isPendingRegistration ? `${v.orderNumber || v.folio} (Sin Alta)` : `${v.orderNumber || v.folio} — ${v.plate}`);
                                setShowVehicleDropdown(false);
                                if (!isEditMode) {
                                  const vParts = parts.filter(p => p.vehicleFolio === v.folio);
                                  setFormItemNo(vParts.length + 1);
                                }
                              }}
                              style={{
                                width: '100%',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                padding: '0.65rem 1rem',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                                transition: 'background 0.12s'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,210,255,0.06)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {v.orderNumber && (
                                  <span style={{
                                    background: v.isPendingRegistration ? 'rgba(245,158,11,0.18)' : 'rgba(99,102,241,0.14)',
                                    color: v.isPendingRegistration ? '#fbbf24' : '#a5b4fc',
                                    border: `1px solid ${v.isPendingRegistration ? 'rgba(245,158,11,0.3)' : 'rgba(99,102,241,0.25)'}`,
                                    borderRadius: '4px',
                                    padding: '0.1rem 0.35rem',
                                    fontSize: '0.7rem',
                                    fontFamily: 'monospace',
                                    fontWeight: 700
                                  }}>
                                    {v.orderNumber}
                                  </span>
                                )}
                                <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem' }}>
                                  {v.isPendingRegistration ? '⏳ Pendiente de Alta' : v.plate}
                                </span>
                                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                                  {v.isPendingRegistration ? '(Siniestro sin vehículo)' : [v.brand, v.model, v.year].filter(Boolean).join(' ')}
                                </span>
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#475569', paddingLeft: '0.1rem' }}>
                                {v.folio}{v.location ? ` · ${v.location}` : ''}{v.color ? ` · ${v.color}` : ''}
                              </span>
                            </button>
                          ))}

                          {filtered.length === 0 && !vehicleSearch.trim() && (
                            <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.82rem', color: '#475569' }}>
                              Escribe un número de siniestro o placa para buscar
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Selected vehicle quick-preview card */}
                {currentSelectedVehicleInForm && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.65rem 0.9rem',
                    borderRadius: '10px',
                    background: 'rgba(0,210,255,0.05)',
                    border: '1px solid rgba(0,210,255,0.15)',
                    fontSize: '0.78rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '0.35rem 0.75rem',
                    color: '#94a3b8'
                  }}>
                    <div><span style={{ color: '#64748b' }}>Siniestro: </span><strong style={{ color: '#f8fafc' }}>{currentSelectedVehicleInForm.orderNumber || currentSelectedVehicleInForm.folio}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Marca/Modelo: </span><strong style={{ color: '#f8fafc' }}>{[currentSelectedVehicleInForm.brand, currentSelectedVehicleInForm.model, currentSelectedVehicleInForm.year].filter(Boolean).join(' ')}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Placa: </span><strong style={{ color: '#fbbf24' }}>{currentSelectedVehicleInForm.plate}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Ubicación: </span><strong style={{ color: '#f8fafc' }}>{currentSelectedVehicleInForm.location || 'PISO'}</strong></div>
                  </div>
                )}
              </div>

              {/* Row: Refacción Name & Item No */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>No. (#)</label>
                  <input
                    type="number"
                    min="1"
                    className="input-field"
                    value={formItemNo}
                    onChange={e => setFormItemNo(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Nombre de la Refacción / Trabajo *</label>
                  <input
                    type="text"
                    className="input-field"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Row: Pedido (Proveedor) & Orden de Compra (Estatus) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Pedido / Proveedor</label>
                  <input
                    type="text"
                    className="input-field"
                    value={formSupplier}
                    onChange={e => setFormSupplier(e.target.value)}
                    list="supplier-suggestions"
                  />
                  <datalist id="supplier-suggestions">
                    {PEDIDO_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                  </datalist>
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                    {['AGENCIA', 'TAPICERO', 'MOSTRADOR'].map(tag => (
                      <button key={tag} type="button" className="badge-tag-btn" onClick={() => setFormSupplier(tag)}>{tag}</button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Orden de Compra / Estatus</label>
                  <input
                    type="text"
                    className="input-field"
                    value={formPurchaseOrder}
                    onChange={e => setFormPurchaseOrder(e.target.value)}
                    list="oc-suggestions"
                  />
                  <datalist id="oc-suggestions">
                    {OC_STATUS_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                  </datalist>
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                    {['PENDIENTE', 'EN AGENCIA', 'ENTREGADO', 'LISTO'].map(tag => (
                      <button key={tag} type="button" className="badge-tag-btn" onClick={() => setFormPurchaseOrder(tag)}>{tag}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row: Fecha Entrega & Costo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Calendar size={13} /> Fecha de Entrega
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={formDeliveryDate}
                    onChange={e => setFormDeliveryDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <DollarSign size={13} /> Costo ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input-field"
                    value={formCost}
                    onChange={e => setFormCost(e.target.value)}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label>Notas Adicionales</label>
                <textarea
                  className="input-field"
                  rows="2"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || !formVehicleFolio}
                >
                  <Save size={16} />
                  <span>{saving ? 'Guardando...' : isEditMode ? 'Actualizar Refacción' : 'Guardar Refacción'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Parts;
