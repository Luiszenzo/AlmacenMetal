import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  FileText,
  Download,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  Car,
  Trash2,
  Edit3,
  X,
  Upload,
  AlertCircle,
  FileSpreadsheet,
  Eye,
  ExternalLink,
  ChevronDown,
  Percent,
  TrendingUp,
  CreditCard
} from 'lucide-react';
import { getInvoicesList, saveInvoice, deleteInvoice, getVehiclesList, saveProvisionalVehicleForSiniestro, subscribeToCollection } from '../config/dbService';
import { generateInvoicesPDF, exportToCSV } from '../utils/reports';

// Currency formatter
const formatCurrency = (val) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2
  }).format(val || 0);
};

// Date formatter
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  // Avoid timezone shift for YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return new Date(dateStr).toLocaleDateString('es-MX');
};

const Invoices = ({ currentUser }) => {
  const [invoices, setInvoices] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search and Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'paid', 'pending'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal Add / Edit
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [invoiceFolio, setInvoiceFolio] = useState('');
  const [vehicleFolio, setVehicleFolio] = useState('');
  const [reportNumber, setReportNumber] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [discountType, setDiscountType] = useState('percent'); // 'percent' or 'fixed'
  const [discountValue, setDiscountValue] = useState('3'); // default 3%
  const [issueDate, setIssueDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [notes, setNotes] = useState('');
  
  // PDF Attachment State
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [pdfSize, setPdfSize] = useState('');

  // Searchable Vehicle Dropdown State
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);
  const vehicleDropdownRef = useRef(null);

  // PDF Preview Modal
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [previewPdfTitle, setPreviewPdfTitle] = useState('');

  // Feedback states
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const isAuthorized = currentUser?.role === 'admin' || currentUser?.role === 'encargado';

  // Load data
  const loadData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const [invList, vehList] = await Promise.all([
        getInvoicesList(),
        getVehiclesList()
      ]);
      setInvoices(invList);
      setVehicles(vehList);
    } catch (err) {
      console.error('Error loading invoices/vehicles:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
    const intervalId = setInterval(() => {
      loadData(true);
    }, 6000);

    const handleDataChanged = () => loadData(true);
    window.addEventListener('workshop_data_changed', handleDataChanged);
    window.addEventListener('focus', handleDataChanged);

    const unsubInvoices = subscribeToCollection('invoices', () => loadData(true));
    const unsubVehicles = subscribeToCollection('vehicles', () => loadData(true));

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('workshop_data_changed', handleDataChanged);
      window.removeEventListener('focus', handleDataChanged);
      if (typeof unsubInvoices === 'function') unsubInvoices();
      if (typeof unsubVehicles === 'function') unsubVehicles();
    };
  }, []);

  // Close vehicle dropdown on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (vehicleDropdownRef.current && !vehicleDropdownRef.current.contains(e.target)) {
        setVehicleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Calculations in real time
  const calculatedValues = useMemo(() => {
    const numSubtotal = parseFloat(subtotal) || 0;
    const numIva = +(numSubtotal * 0.16).toFixed(2);
    const numTotal = +(numSubtotal + numIva).toFixed(2);

    let numDiscount = 0;
    const val = parseFloat(discountValue) || 0;
    if (discountType === 'percent') {
      numDiscount = +(numSubtotal * (val / 100)).toFixed(2);
    } else {
      numDiscount = +val.toFixed(2);
    }

    // Ensure discount doesn't exceed subtotal
    if (numDiscount > numSubtotal) numDiscount = numSubtotal;

    const numPaymentSubtotal = +(numSubtotal - numDiscount).toFixed(2);
    const numPaymentIva = +(numPaymentSubtotal * 0.16).toFixed(2);
    const numPaymentTotal = +(numPaymentSubtotal + numPaymentIva).toFixed(2);

    return {
      subtotal: numSubtotal,
      iva: numIva,
      total: numTotal,
      discountAmount: numDiscount,
      paymentSubtotal: numPaymentSubtotal,
      paymentIva: numPaymentIva,
      paymentTotal: numPaymentTotal
    };
  }, [subtotal, discountType, discountValue]);

  // Open Modal for New Invoice
  const handleOpenNew = () => {
    setIsEditing(false);
    setEditingId(null);
    setInvoiceFolio('');
    setVehicleFolio('');
    setReportNumber('');
    setVehicleSearch('');
    setSubtotal('');
    setDiscountType('percent');
    setDiscountValue('3');
    setIssueDate(new Date().toISOString().slice(0, 10));
    setPaymentDate('');
    setNotes('');
    setPdfFile(null);
    setPdfUrl('');
    setPdfName('');
    setPdfSize('');
    setFormError('');
    setShowModal(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (inv) => {
    setIsEditing(true);
    setEditingId(inv.id);
    setInvoiceFolio(inv.invoiceFolio || '');
    setVehicleFolio(inv.vehicleFolio || '');
    setReportNumber(inv.reportNumber || '');

    // Set search text to selected vehicle if found
    const matchVeh = vehicles.find(v => v.folio === inv.vehicleFolio || (v.orderNumber && v.orderNumber === inv.reportNumber));
    if (matchVeh) {
      setVehicleSearch(`${matchVeh.orderNumber || matchVeh.folio} - ${matchVeh.model || ''} (${matchVeh.plate || ''})`);
    } else {
      setVehicleSearch(inv.reportNumber || '');
    }

    setSubtotal(inv.subtotal ? String(inv.subtotal) : '');
    setDiscountType(inv.discountType || 'percent');
    setDiscountValue(inv.discountValue !== undefined ? String(inv.discountValue) : '3');
    setIssueDate(inv.issueDate || '');
    setPaymentDate(inv.paymentDate || '');
    setNotes(inv.notes || '');
    setPdfFile(null);
    setPdfUrl(inv.pdfUrl || '');
    setPdfName(inv.pdfName || '');
    setPdfSize('');
    setFormError('');
    setShowModal(true);
  };

  // Handle PDF file selection
  const handlePdfUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setFormError('Solo se permiten archivos en formato PDF.');
      return;
    }

    // Check size (< 8 MB)
    if (file.size > 8 * 1024 * 1024) {
      setFormError('El archivo PDF supera el tamaño máximo permitido de 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPdfUrl(reader.result);
      setPdfName(file.name);
      setPdfSize((file.size / 1024).toFixed(1) + ' KB');
      setPdfFile(file);
      setFormError('');
    };
    reader.readAsDataURL(file);
  };

  // Save invoice submit handler
  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!invoiceFolio.trim()) {
      setFormError('El Folio de la Factura es obligatorio.');
      return;
    }

    if (!reportNumber.trim()) {
      setFormError('El No. de Reporte / Orden es obligatorio.');
      return;
    }

    const numSubtotal = parseFloat(subtotal);
    if (isNaN(numSubtotal) || numSubtotal <= 0) {
      setFormError('Ingresa un Monto Sin IVA válido mayor a 0.');
      return;
    }

    if (!issueDate) {
      setFormError('La Fecha de Envío es obligatoria.');
      return;
    }

    setSaving(true);
    try {
      let finalVehicleFolio = vehicleFolio || '';
      if (!finalVehicleFolio && reportNumber.trim()) {
        try {
          const prov = await saveProvisionalVehicleForSiniestro(reportNumber.trim());
          finalVehicleFolio = prov.folio;
        } catch (pvErr) {
          console.warn("Could not create provisional vehicle for invoice:", pvErr);
        }
      }

      const payload = {
        id: editingId || undefined,
        invoiceFolio: invoiceFolio.trim(),
        reportNumber: reportNumber.trim(),
        vehicleFolio: finalVehicleFolio,
        subtotal: calculatedValues.subtotal,
        iva: calculatedValues.iva,
        total: calculatedValues.total,
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        discountAmount: calculatedValues.discountAmount,
        paymentSubtotal: calculatedValues.paymentSubtotal,
        paymentIva: calculatedValues.paymentIva,
        paymentTotal: calculatedValues.paymentTotal,
        issueDate,
        paymentDate: paymentDate || null,
        notes: notes.trim(),
        pdfUrl: pdfUrl || '',
        pdfName: pdfName || ''
      };

      await saveInvoice(payload);
      setShowModal(false);
      await loadData();
    } catch (err) {
      console.error('Error saving invoice:', err);
      setFormError('Error al guardar la factura: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete invoice
  const handleDelete = async (id, folio) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la factura Folio ${folio}?`)) {
      return;
    }
    try {
      await deleteInvoice(id);
      await loadData();
    } catch (err) {
      console.error('Error deleting invoice:', err);
      alert('No se pudo eliminar la factura.');
    }
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Search term
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        (inv.invoiceFolio && inv.invoiceFolio.toLowerCase().includes(q)) ||
        (inv.reportNumber && inv.reportNumber.toLowerCase().includes(q)) ||
        (inv.notes && inv.notes.toLowerCase().includes(q));

      // Status
      let matchStatus = true;
      if (statusFilter === 'paid') {
        matchStatus = !!inv.paymentDate;
      } else if (statusFilter === 'pending') {
        matchStatus = !inv.paymentDate;
      }

      // Date range filter
      let matchDate = true;
      if (startDate) {
        matchDate = matchDate && (inv.issueDate >= startDate || (inv.paymentDate && inv.paymentDate >= startDate));
      }
      if (endDate) {
        matchDate = matchDate && (inv.issueDate <= endDate || (inv.paymentDate && inv.paymentDate <= endDate));
      }

      return matchSearch && matchStatus && matchDate;
    });
  }, [invoices, searchTerm, statusFilter, startDate, endDate]);

  // Overall Financial KPIs
  const stats = useMemo(() => {
    const totalInvoiced = invoices.reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);
    const paidList = invoices.filter(i => !!i.paymentDate);
    const pendingList = invoices.filter(i => !i.paymentDate);
    
    const totalCollected = paidList.reduce((acc, i) => acc + (parseFloat(i.paymentTotal) || 0), 0);
    const totalPending = pendingList.reduce((acc, i) => acc + (parseFloat(i.paymentTotal) || 0), 0);
    const collectionRate = totalInvoiced > 0 ? ((totalCollected / totalInvoiced) * 100).toFixed(1) : 0;

    return {
      totalInvoiced,
      totalCollected,
      totalPending,
      totalCount: invoices.length,
      paidCount: paidList.length,
      pendingCount: pendingList.length,
      collectionRate
    };
  }, [invoices]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "NO",
      "FOLIO",
      "REPORTE",
      "MONTO SIN IVA",
      "IVA",
      "MONTO TOTAL",
      "DESCUENTO PAGO",
      "PAGO SIN IVA",
      "IVA",
      "MONTO TOTAL DE PAGO",
      "FECHA ENVIO",
      "FECHA PAGO",
      "ESTADO",
      "OBSERVACIONES"
    ];

    const data = filteredInvoices.map((inv, idx) => [
      idx + 1,
      inv.invoiceFolio || '',
      inv.reportNumber || '',
      inv.subtotal || 0,
      inv.iva || 0,
      inv.total || 0,
      inv.discountAmount || 0,
      inv.paymentSubtotal || 0,
      inv.paymentIva || 0,
      inv.paymentTotal || 0,
      inv.issueDate || '',
      inv.paymentDate || '',
      inv.paymentDate ? 'PAGADA' : 'PENDIENTE',
      inv.notes || ''
    ]);

    exportToCSV(data, `Facturas_Emitidas_${new Date().toISOString().slice(0, 10)}`, headers);
  };

  // Export to PDF
  const handleExportPDF = () => {
    let filterTitle = '';
    if (statusFilter === 'paid') filterTitle = 'Solo Pagadas';
    if (statusFilter === 'pending') filterTitle = 'Solo Pendientes';
    if (startDate || endDate) {
      filterTitle += ` (Periodo: ${startDate || 'Inicio'} al ${endDate || 'Fin'})`;
    }
    generateInvoicesPDF(filteredInvoices, filterTitle);
  };

  // Vehicle matching for autocomplete
  const filteredVehiclesForSelect = useMemo(() => {
    if (!vehicleSearch.trim()) return vehicles.slice(0, 10);
    const q = vehicleSearch.toLowerCase();
    return vehicles.filter(v =>
      (v.orderNumber && v.orderNumber.toLowerCase().includes(q)) ||
      (v.folio && v.folio.toLowerCase().includes(q)) ||
      (v.plate && v.plate.toLowerCase().includes(q)) ||
      (v.model && v.model.toLowerCase().includes(q)) ||
      (v.insurance && v.insurance.toLowerCase().includes(q))
    ).slice(0, 15);
  }, [vehicles, vehicleSearch]);

  const selectVehicleForForm = (v) => {
    setVehicleFolio(v.folio);
    const rep = v.orderNumber || v.folio;
    setReportNumber(rep);
    setVehicleSearch(`${rep} - ${v.model || 'Vehículo'} (${v.plate || 'Sin Placa'}) [${v.insurance || 'Particular'}]`);
    setVehicleDropdownOpen(false);
  };

  return (
    <div className="view-container">
      {/* View Header */}
      <div className="view-header" style={{ marginBottom: '20px' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText className="text-primary" size={28} />
            Facturas Emitidas
          </h1>
          <p className="view-subtitle">
            Control fiscal, cálculos de IVA, descuentos por pronto pago y comprobantes PDF ligados a vehículos
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleExportPDF}
            className="btn btn-secondary"
            title="Descargar Reporte en PDF (Horizontal)"
            disabled={filteredInvoices.length === 0}
          >
            <Download size={18} />
            <span>Descargar PDF</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="btn btn-secondary"
            title="Exportar a archivo Excel / CSV"
            disabled={filteredInvoices.length === 0}
          >
            <FileSpreadsheet size={18} />
            <span>Exportar Excel</span>
          </button>

          {isAuthorized && (
            <button onClick={handleOpenNew} className="btn btn-primary">
              <Plus size={18} />
              <span>+ Nueva Factura</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Total Facturado */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'rgba(59, 130, 246, 0.12)',
            color: '#60a5fa',
            padding: '14px',
            borderRadius: '12px'
          }}>
            <DollarSign size={26} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Facturado (Bruto)
            </span>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.45rem', color: '#f8fafc' }}>
              {formatCurrency(stats.totalInvoiced)}
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {stats.totalCount} facturas registradas
            </span>
          </div>
        </div>

        {/* Total Cobrado */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#34d399',
            padding: '14px',
            borderRadius: '12px'
          }}>
            <CheckCircle2 size={26} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Cobrado (Liquidado)
            </span>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.45rem', color: '#34d399' }}>
              {formatCurrency(stats.totalCollected)}
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {stats.paidCount} facturas pagadas ({stats.collectionRate}%)
            </span>
          </div>
        </div>

        {/* Pendiente de Cobro */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'rgba(245, 158, 11, 0.12)',
            color: '#fbbf24',
            padding: '14px',
            borderRadius: '12px'
          }}>
            <Clock size={26} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pendiente por Cobrar
            </span>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.45rem', color: '#fbbf24' }}>
              {formatCurrency(stats.totalPending)}
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {stats.pendingCount} facturas por liquidar
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Buscar por Folio, No. Reporte, Notas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '38px', width: '100%' }}
            />
          </div>

          {/* Status Segmented Buttons */}
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '3px' }}>
            <button
              onClick={() => setStatusFilter('all')}
              style={{
                background: statusFilter === 'all' ? 'var(--primary)' : 'transparent',
                color: statusFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 500
              }}
            >
              Todas ({invoices.length})
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              style={{
                background: statusFilter === 'paid' ? '#10b981' : 'transparent',
                color: statusFilter === 'paid' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 500
              }}
            >
              Pagadas ({stats.paidCount})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              style={{
                background: statusFilter === 'pending' ? '#f59e0b' : 'transparent',
                color: statusFilter === 'pending' ? '#000' : 'var(--text-secondary)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 500
              }}
            >
              Pendientes ({stats.pendingCount})
            </button>
          </div>

          {/* Date range pickers */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Periodo:</span>
            <input
              type="date"
              className="input-field"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: '135px', padding: '6px 10px', fontSize: '0.82rem' }}
              title="Fecha inicial"
            />
            <span style={{ color: 'var(--text-secondary)' }}>—</span>
            <input
              type="date"
              className="input-field"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: '135px', padding: '6px 10px', fontSize: '0.82rem' }}
              title="Fecha final"
            />
            {(startDate || endDate || searchTerm || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearchTerm(''); setStatusFilter('all'); setStartDate(''); setEndDate(''); }}
                className="btn btn-secondary"
                style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                title="Limpiar filtros"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', minWidth: '1150px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.75)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 10px', textAlign: 'center', width: '45px' }}>NO</th>
                <th style={{ padding: '12px 10px', textAlign: 'center', width: '75px' }}>FOLIO</th>
                <th style={{ padding: '12px 12px', textAlign: 'left', width: '130px' }}>REPORTE</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', width: '105px' }}>MONTO SIN IVA</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', width: '90px' }}>IVA (16%)</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', width: '110px' }}>MONTO TOTAL</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', width: '100px' }}>DESC. PAGO</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', width: '105px' }}>PAGO SIN IVA</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', width: '90px' }}>IVA PAGO</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', width: '115px' }}>TOTAL DE PAGO</th>
                <th style={{ padding: '12px 10px', textAlign: 'center', width: '95px' }}>F. ENVÍO</th>
                <th style={{ padding: '12px 10px', textAlign: 'center', width: '100px' }}>F. PAGO</th>
                <th style={{ padding: '12px 10px', textAlign: 'center', width: '65px' }}>PDF</th>
                <th style={{ padding: '12px 12px', textAlign: 'left', minWidth: '130px' }}>OBSERVACIONES</th>
                {isAuthorized && <th style={{ padding: '12px 10px', textAlign: 'center', width: '85px' }}>ACCIONES</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isAuthorized ? 15 : 14} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    Cargando registros de facturas...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={isAuthorized ? 15 : 14} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
                    <FileText size={40} style={{ opacity: 0.3, marginBottom: '10px' }} />
                    <p style={{ margin: 0, fontSize: '0.95rem' }}>No se encontraron facturas emitidas con los filtros seleccionados.</p>
                    {isAuthorized && (
                      <button onClick={handleOpenNew} className="btn btn-primary" style={{ marginTop: '14px', fontSize: '0.85rem' }}>
                        + Registrar Primera Factura
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv, idx) => {
                  const isPaid = !!inv.paymentDate;
                  const linkedVehicle = vehicles.find(v => v.folio === inv.vehicleFolio || (v.orderNumber && v.orderNumber === inv.reportNumber));

                  return (
                    <tr
                      key={inv.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'background 0.15s ease',
                        background: isPaid ? 'rgba(16, 185, 129, 0.015)' : 'transparent'
                      }}
                      className="table-row-hover"
                    >
                      {/* NO */}
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {idx + 1}
                      </td>

                      {/* FOLIO */}
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--primary)', fontSize: '0.9rem' }}>
                        {inv.invoiceFolio || '—'}
                      </td>

                      {/* REPORTE */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.88rem' }}>
                            {inv.reportNumber || '—'}
                          </span>
                          {linkedVehicle && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              🚗 {linkedVehicle.model || 'Auto'} ({linkedVehicle.plate || 'S/P'})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* MONTO SIN IVA */}
                      <td style={{ textAlign: 'right', fontSize: '0.86rem', color: '#cbd5e1' }}>
                        {formatCurrency(inv.subtotal)}
                      </td>

                      {/* IVA */}
                      <td style={{ textAlign: 'right', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                        {formatCurrency(inv.iva)}
                      </td>

                      {/* MONTO TOTAL */}
                      <td style={{ textAlign: 'right', fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc' }}>
                        {formatCurrency(inv.total)}
                      </td>

                      {/* DESCUENTO PAGO */}
                      <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                        <span style={{ color: '#f87171' }}>
                          -{formatCurrency(inv.discountAmount)}
                        </span>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                          {inv.discountType === 'fixed' ? 'Fijo ($)' : `(${inv.discountValue ?? 3}%)`}
                        </div>
                      </td>

                      {/* PAGO SIN IVA */}
                      <td style={{ textAlign: 'right', fontSize: '0.86rem', color: '#cbd5e1' }}>
                        {formatCurrency(inv.paymentSubtotal)}
                      </td>

                      {/* IVA PAGO */}
                      <td style={{ textAlign: 'right', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                        {formatCurrency(inv.paymentIva)}
                      </td>

                      {/* MONTO TOTAL DE PAGO */}
                      <td style={{
                        textAlign: 'right',
                        fontSize: '0.92rem',
                        fontWeight: 700,
                        color: isPaid ? '#34d399' : '#fbbf24'
                      }}>
                        {formatCurrency(inv.paymentTotal)}
                      </td>

                      {/* FECHA ENVIO */}
                      <td style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {formatDate(inv.issueDate)}
                      </td>

                      {/* FECHA PAGO */}
                      <td style={{ textAlign: 'center' }}>
                        {isPaid ? (
                          <span style={{
                            display: 'inline-block',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}>
                            ✓ {formatDate(inv.paymentDate)}
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            background: 'rgba(245, 158, 11, 0.12)',
                            color: '#fbbf24',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 500
                          }}>
                            ⏳ Pendiente
                          </span>
                        )}
                      </td>

                      {/* PDF FACTURA ADJUNTO */}
                      <td style={{ textAlign: 'center' }}>
                        {inv.pdfUrl ? (
                          <button
                            onClick={() => {
                              setPreviewPdfUrl(inv.pdfUrl);
                              setPreviewPdfTitle(`Factura Folio ${inv.invoiceFolio || ''} - Reporte ${inv.reportNumber || ''}`);
                            }}
                            className="btn-icon"
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#f87171',
                              border: 'none',
                              padding: '6px',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                            title={`Ver Factura PDF: ${inv.pdfName || 'Comprobante'}`}
                          >
                            <FileText size={16} />
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>

                      {/* OBSERVACIONES */}
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {inv.notes || '—'}
                      </td>

                      {/* ACCIONES */}
                      {isAuthorized && (
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              onClick={() => handleOpenEdit(inv)}
                              className="btn-icon"
                              style={{
                                background: 'rgba(59, 130, 246, 0.1)',
                                color: '#60a5fa',
                                border: 'none',
                                padding: '6px',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                              title="Editar Factura"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(inv.id, inv.invoiceFolio)}
                              className="btn-icon"
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#f87171',
                                border: 'none',
                                padding: '6px',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                              title="Eliminar Factura"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit Invoice */}
      {showModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '680px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText className="text-primary" size={22} />
                <span>{isEditing ? 'Editar Factura Emitida' : 'Registrar Nueva Factura'}</span>
              </h2>
              <button onClick={() => setShowModal(false)} className="btn-close">
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={18} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveInvoice}>
              {/* Row 1: Folio & Vehicle/Report */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Folio Factura <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ej. 3607"
                    value={invoiceFolio}
                    onChange={(e) => setInvoiceFolio(e.target.value)}
                    required
                    style={{ fontWeight: 600, letterSpacing: '0.03em' }}
                  />
                </div>

                <div ref={vehicleDropdownRef} style={{ position: 'relative' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Vehículo / No. Reporte <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Buscar por Reporte, Placas o Modelo..."
                      value={vehicleSearch}
                      onChange={(e) => {
                        setVehicleSearch(e.target.value);
                        setReportNumber(e.target.value);
                        setVehicleDropdownOpen(true);
                      }}
                      onFocus={() => setVehicleDropdownOpen(true)}
                      required
                    />
                    <ChevronDown
                      size={16}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                      onClick={() => setVehicleDropdownOpen(!vehicleDropdownOpen)}
                    />
                  </div>

                  {/* Dropdown list */}
                  {vehicleDropdownOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 1200,
                      background: '#1e293b',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      marginTop: '4px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                    }}>
                      {filteredVehiclesForSelect.length === 0 ? (
                        <div style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          No se encontraron vehículos. Se usará "{reportNumber}" como No. de Reporte.
                        </div>
                      ) : (
                        filteredVehiclesForSelect.map(v => (
                          <div
                            key={v.folio}
                            onClick={() => selectVehicleForForm(v)}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              fontSize: '0.82rem',
                              transition: 'background 0.15s ease'
                            }}
                            className="dropdown-hover"
                          >
                            <div style={{ fontWeight: 600, color: 'var(--primary)' }}>
                              📋 {v.orderNumber || v.folio}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                              🚗 {v.model || 'Vehículo'} — Placas: {v.plate || 'S/P'} | Aseguradora: {v.insurance || 'Particular'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Monto Sin IVA & Descuento Configuration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Monto Sin IVA ($) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input-field"
                    placeholder="0.00"
                    value={subtotal}
                    onChange={(e) => setSubtotal(e.target.value)}
                    required
                    style={{ fontSize: '1.05rem', fontWeight: 600 }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                      Descuento Pago
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setDiscountType('percent')}
                        style={{
                          background: discountType === 'percent' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                          color: discountType === 'percent' ? '#fff' : 'var(--text-secondary)',
                          border: 'none',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          cursor: 'pointer'
                        }}
                      >
                        % Porcentaje
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType('fixed')}
                        style={{
                          background: discountType === 'fixed' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                          color: discountType === 'fixed' ? '#fff' : 'var(--text-secondary)',
                          border: 'none',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          cursor: 'pointer'
                        }}
                      >
                        $ Fijo
                      </button>
                    </div>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input-field"
                      placeholder={discountType === 'percent' ? 'Ej. 3' : 'Ej. 350.00'}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                    />
                    <span style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.8rem',
                      fontWeight: 600
                    }}>
                      {discountType === 'percent' ? '%' : 'MXN'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Automatic Calculation Breakdown Box */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                  📊 Desglose de Cálculos Automáticos
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>IVA Factura (16%):</span>
                    <div style={{ fontWeight: 600, color: '#cbd5e1', fontSize: '0.9rem' }}>
                      {formatCurrency(calculatedValues.iva)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Monto Total Bruto:</span>
                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>
                      {formatCurrency(calculatedValues.total)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Importe Descuento:</span>
                    <div style={{ fontWeight: 600, color: '#f87171', fontSize: '0.9rem' }}>
                      -{formatCurrency(calculatedValues.discountAmount)}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Pago Sin IVA:</span>
                    <div style={{ fontWeight: 600, color: '#cbd5e1', fontSize: '0.9rem' }}>
                      {formatCurrency(calculatedValues.paymentSubtotal)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>IVA de Pago (16%):</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {formatCurrency(calculatedValues.paymentIva)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600 }}>Monto Total de Pago:</span>
                    <div style={{ fontWeight: 700, color: '#34d399', fontSize: '1.05rem' }}>
                      {formatCurrency(calculatedValues.paymentTotal)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Fechas (Envío y Pago) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Fecha de Envío <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Fecha de Pago <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>(Opcional si está pendiente)</span>
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 4: Subir Factura PDF */}
              <div style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Adjuntar Comprobante de Factura (PDF)
                </label>

                {pdfUrl ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                      <FileText size={22} color="#f87171" style={{ flexShrink: 0 }} />
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                          {pdfName || 'Factura_Adjunta.pdf'}
                        </span>
                        {pdfSize && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                            ({pdfSize})
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPdfUrl(pdfUrl);
                          setPreviewPdfTitle(pdfName || 'Vista Previa de Factura');
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      >
                        <Eye size={14} /> Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPdfUrl('');
                          setPdfName('');
                          setPdfSize('');
                          setPdfFile(null);
                        }}
                        className="btn-icon"
                        style={{ background: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer' }}
                        title="Quitar PDF"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    border: '2px dashed rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: 'rgba(255, 255, 255, 0.02)',
                    transition: 'all 0.15s ease'
                  }}>
                    <Upload size={24} style={{ color: 'var(--primary)', marginBottom: '6px' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#f8fafc' }}>
                      Seleccionar o arrastrar archivo PDF
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Máximo 8 MB (Formato .pdf)
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handlePdfUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>

              {/* Row 5: Observaciones */}
              <div style={{ marginBottom: '20px' }}>
                <label className="form-label">Observaciones / Notas Adicionales</label>
                <textarea
                  className="input-field"
                  rows="2"
                  placeholder="Detalles sobre pronto pago, notas de crédito, observaciones de la aseguradora..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Form Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Registrar Factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewPdfUrl && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '900px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column', padding: '16px' }}>
            <div className="modal-header" style={{ marginBottom: '12px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.1rem' }}>
                <FileText size={20} color="#f87171" />
                <span>{previewPdfTitle || 'Documento PDF'}</span>
              </h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <a
                  href={previewPdfUrl}
                  download={previewPdfTitle.replace(/[^a-z0-9]/gi, '_') + '.pdf'}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem', textDecoration: 'none' }}
                >
                  <Download size={14} /> Descargar
                </a>
                <button onClick={() => setPreviewPdfUrl(null)} className="btn-close">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, background: '#0f172a', borderRadius: '8px', overflow: 'hidden' }}>
              <iframe
                src={previewPdfUrl}
                title="Visor PDF"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
