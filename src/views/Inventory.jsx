import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, FileText, Download, AlertTriangle } from 'lucide-react';
import { getInventoryList, saveInventoryItem, removeInventoryItem } from '../config/dbService';
import { generateInventoryPDF, exportToCSV } from '../utils/reports';

const Inventory = ({ currentUser }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [itemId, setItemId] = useState(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [minStock, setMinStock] = useState(0);
  const [cost, setCost] = useState(0);
  const [costWithIva, setCostWithIva] = useState(0);
  const [category, setCategory] = useState('');

  const isEditable = currentUser?.role === 'admin' || currentUser?.role === 'encargado';

  const loadInventory = async () => {
    setLoading(true);
    try {
      const data = await getInventoryList();
      setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  // Sync Cost & Cost with IVA
  const handleCostChange = (val) => {
    const numeric = parseFloat(val) || 0;
    setCost(val); // Keep raw input
    setCostWithIva((numeric * 1.16).toFixed(2));
  };

  const handleCostWithIvaChange = (val) => {
    const numeric = parseFloat(val) || 0;
    setCostWithIva(val); // Keep raw input
    setCost((numeric / 1.16).toFixed(2));
  };

  const handleOpenAdd = () => {
    setItemId(null);
    setCode('');
    setName('');
    setDescription('');
    setQuantity(0);
    setMinStock(0);
    setCost(0);
    setCostWithIva(0);
    setCategory('');
    setError('');
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setItemId(item.id);
    setCode(item.code || '');
    setName(item.name || '');
    setDescription(item.description || '');
    setQuantity(item.quantity || 0);
    setMinStock(item.minStock || 0);
    setCost(item.cost || 0);
    setCostWithIva(((item.cost || 0) * 1.16).toFixed(2));
    setCategory(item.category || '');
    setError('');
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta pieza del inventario?')) return;
    try {
      await removeInventoryItem(id);
      loadInventory();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!code.trim() || !name.trim() || !category.trim()) {
      setError('Código, Nombre y Categoría son campos obligatorios.');
      return;
    }

    try {
      await saveInventoryItem({
        id: itemId,
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        quantity: parseInt(quantity) || 0,
        minStock: parseInt(minStock) || 0,
        cost: parseFloat(cost) || 0,
        category: category.trim()
      });
      setShowModal(false);
      loadInventory();
    } catch (err) {
      setError(err.message || 'Error al guardar el artículo.');
    }
  };

  const handleDownloadPDF = () => {
    generateInventoryPDF(filteredItems);
  };

  const handleDownloadCSV = () => {
    const headers = ["Código", "Nombre", "Descripción", "Categoría", "Stock", "Mínimo", "Costo (Sin IVA)", "Costo + IVA (16%)", "Valor Total"];
    const csvData = filteredItems.map(item => [
      item.code,
      item.name,
      item.description,
      item.category || 'Sin Categoría',
      item.quantity,
      item.minStock,
      item.cost,
      (item.cost * 1.16).toFixed(2),
      (item.quantity * item.cost).toFixed(2)
    ]);
    exportToCSV(csvData, `Inventario_${new Date().toISOString().slice(0,10)}`, headers);
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(search.toLowerCase()) || 
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
    
    const matchesCategory = categoryFilter === '' || item.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventario de Almacén</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Gestiona las piezas de repuesto, materiales, costos y niveles de existencia.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={handleDownloadCSV}>
            <Download size={18} />
            <span>CSV</span>
          </button>
          <button className="btn btn-secondary" onClick={handleDownloadPDF}>
            <FileText size={18} />
            <span>PDF</span>
          </button>
          {isEditable && (
            <button className="btn btn-primary" onClick={handleOpenAdd}>
              <Plus size={18} />
              <span>Añadir Material</span>
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
            placeholder="Buscar por código, nombre o descripción..." 
            className="input-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select 
          className="select-field" 
          value={categoryFilter} 
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ maxWidth: '200px' }}
        >
          <option value="">Todas las Categorías</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          Cargando inventario...
        </div>
      ) : (
        <div className="glass-panel table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre / Descripción</th>
                <th>Categoría</th>
                <th style={{ textAlign: 'center' }}>Stock</th>
                <th style={{ textAlign: 'center' }}>Mínimo</th>
                <th style={{ textAlign: 'right' }}>Costo Unit</th>
                <th style={{ textAlign: 'right' }}>Costo + IVA</th>
                <th style={{ textAlign: 'right' }}>Valor Total</th>
                {isEditable && <th style={{ textAlign: 'center' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={isEditable ? 9 : 8} style={{ textAlign: 'center', padding: '2rem' }}>
                    No se encontraron piezas en el inventario.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isLowStock = item.quantity <= item.minStock;
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: '600', color: 'white', fontFamily: 'monospace' }}>{item.code}</td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'white' }}>{item.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.description}</div>
                      </td>
                      <td>{item.category}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${isLowStock ? 'badge-danger' : 'badge-success'}`} style={{ gap: '4px' }}>
                          {isLowStock && <AlertTriangle size={12} />}
                          {item.quantity}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{item.minStock}</td>
                      <td style={{ textAlign: 'right' }}>${(item.cost || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: '500', color: 'white' }}>
                        ${((item.cost || 0) * 1.16).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        ${((item.quantity || 0) * (item.cost || 0)).toFixed(2)}
                      </td>
                      {isEditable && (
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button 
                              onClick={() => handleOpenEdit(item)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.35rem' }}
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete(item.id)}
                              className="btn btn-danger btn-sm"
                              style={{ padding: '0.35rem' }}
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
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
      )}

      {/* CRUD Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h3 className="modal-title">{itemId ? 'Modificar Material' : 'Añadir Nuevo Material'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {error && <div className="badge badge-danger" style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem', boxSizing: 'border-box' }}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Código / SKU / Barcode *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={code} 
                  onChange={(e) => setCode(e.target.value)} 
                  placeholder="ej. BAL-902"
                  required 
                />
              </div>

              <div className="form-group">
                <label>Nombre del Material *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="ej. Balatas Delanteras Aveo"
                  required 
                />
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <textarea 
                  className="input-field" 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="Detalles sobre compatibilidad, marcas o ubicación en estante..."
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>Categoría *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)} 
                  placeholder="ej. Frenos, Motor, Eléctrico, Suspensión..."
                  required 
                  list="existing-categories"
                />
                <datalist id="existing-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Cantidad en Stock</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    value={quantity} 
                    onChange={(e) => setQuantity(e.target.value)} 
                    min={0}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Mínimo de Stock (Alerta)</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    value={minStock} 
                    onChange={(e) => setMinStock(e.target.value)} 
                    min={0}
                    required 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Costo Unitario (Sin IVA)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="input-field" 
                    value={cost} 
                    onChange={(e) => handleCostChange(e.target.value)} 
                    min={0}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Costo + IVA (16%)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="input-field" 
                    value={costWithIva} 
                    onChange={(e) => handleCostWithIvaChange(e.target.value)} 
                    min={0}
                    required 
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
