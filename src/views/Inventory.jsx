import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, FileText, Download, AlertTriangle, Layers, Droplet, Scale, Ruler, Box } from 'lucide-react';
import { getInventoryList, saveInventoryItem, removeInventoryItem } from '../config/dbService';
import { generateInventoryPDF, exportToCSV } from '../utils/reports';

export const UNIT_TYPES = [
  { id: 'unit', label: 'Unitario / Piezas', symbol: 'pza', icon: Box, desc: 'Tornillos, filtros, balatas, alternadores...' },
  { id: 'liters', label: 'Líquidos / Litros', symbol: 'L', icon: Droplet, desc: 'Aceites, pinturas, thinner, solventes (botellas de 750ml, 500ml, garrafas)...' },
  { id: 'kilos', label: 'Peso / Kilos', symbol: 'kg', icon: Scale, desc: 'Masilla, pasta, grasa, estopa (botes de 500g, cubetas, tubos)...' },
  { id: 'centimeters', label: 'Longitud / Metros y cm', symbol: 'cm', icon: Ruler, desc: 'Mangueras, cables, cintas (rollos de 10m, 50m, tramos)...' },
  { id: 'parts', label: 'Partes / Fracciones', symbol: 'partes', icon: Layers, desc: 'Lijas, pliegos, hojas que se dividen en partes pequeñas...' },
];

export const formatStockDisplay = (item) => {
  const qty = parseFloat(item.quantity) || 0;
  const type = item.unitType || 'unit';
  const cName = item.containerName;
  const cCap = parseFloat(item.containerCapacity) || 0;
  const cUnit = item.containerUnit || '';

  if (type === 'liters') {
    const ml = Math.round(qty * 1000);
    if (cName && cCap > 0) {
      const capInL = cUnit === 'ml' ? (cCap / 1000) : cCap;
      const count = (qty / capInL).toFixed(1).replace(/\.0$/, '');
      return `${qty} L (${count} ${cName}${count === '1' ? '' : 's'} de ${cCap}${cUnit} • ${ml} ml)`;
    }
    return `${qty} L (${ml} ml)`;
  }
  if (type === 'kilos') {
    const g = Math.round(qty * 1000);
    if (cName && cCap > 0) {
      const capInKg = cUnit === 'g' ? (cCap / 1000) : cCap;
      const count = (qty / capInKg).toFixed(1).replace(/\.0$/, '');
      return `${qty} kg (${count} ${cName}${count === '1' ? '' : 's'} de ${cCap}${cUnit} • ${g} g)`;
    }
    return `${qty} kg (${g} g)`;
  }
  if (type === 'centimeters') {
    const m = (qty / 100).toFixed(2).replace(/\.00$/, '');
    if (cName && cCap > 0) {
      const capInCm = cUnit === 'm' ? (cCap * 100) : cCap;
      const count = (qty / capInCm).toFixed(1).replace(/\.0$/, '');
      return `${qty} cm (${count} ${cName}${count === '1' ? '' : 's'} de ${cCap}${cUnit} • ${m} m)`;
    }
    return `${qty} cm (${m} m)`;
  }
  if (type === 'parts') {
    const ppu = parseInt(item.partsPerUnit) || 1;
    const masterName = item.masterUnitName || 'pliego';
    const masterEquiv = (qty / ppu).toFixed(ppu > 1 ? 1 : 0).replace(/\.0$/, '');
    return `${qty} partes (${masterEquiv} ${masterName}${masterEquiv === '1' ? '' : 's'})`;
  }
  return `${qty} pza${qty === 1 ? '' : 's'}`;
};

export const formatUnitCostDisplay = (item) => {
  const cost = parseFloat(item.cost) || 0;
  const type = item.unitType || 'unit';
  const cName = item.containerName;
  const cCap = parseFloat(item.containerCapacity) || 0;
  const cUnit = item.containerUnit || '';

  if (type === 'liters') {
    if (cName && cCap > 0) {
      const capInL = cUnit === 'ml' ? (cCap / 1000) : cCap;
      const cCost = (cost * capInL).toFixed(2);
      return `$${cost.toFixed(2)}/L ($${cCost}/${cName})`;
    }
    return `$${cost.toFixed(2)}/L`;
  }
  if (type === 'kilos') {
    if (cName && cCap > 0) {
      const capInKg = cUnit === 'g' ? (cCap / 1000) : cCap;
      const cCost = (cost * capInKg).toFixed(2);
      return `$${cost.toFixed(2)}/kg ($${cCost}/${cName})`;
    }
    return `$${cost.toFixed(2)}/kg`;
  }
  if (type === 'centimeters') {
    if (cName && cCap > 0) {
      const capInCm = cUnit === 'm' ? (cCap * 100) : cCap;
      const cCost = (cost * capInCm).toFixed(2);
      return `$${cost.toFixed(2)}/cm ($${cCost}/${cName})`;
    }
    return `$${cost.toFixed(2)}/cm ($${(cost * 100).toFixed(2)}/m)`;
  }
  if (type === 'parts') {
    const ppu = parseInt(item.partsPerUnit) || 1;
    const masterName = item.masterUnitName || 'pliego';
    const masterCost = (cost * ppu).toFixed(2);
    return `$${cost.toFixed(2)}/parte ($${masterCost}/${masterName})`;
  }
  return `$${cost.toFixed(2)}/pza`;
};

const Inventory = ({ currentUser }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [itemId, setItemId] = useState(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unitType, setUnitType] = useState('unit');
  
  // Container / Presentation State (for Liters, Kilos, Centimeters, Parts)
  const [hasPresentation, setHasPresentation] = useState(true);
  const [containerName, setContainerName] = useState('');
  const [containerCapacity, setContainerCapacity] = useState('');
  const [containerUnit, setContainerUnit] = useState('ml');
  const [containersCount, setContainersCount] = useState('');
  const [containerCost, setContainerCost] = useState('');
  const [containerCostWithIva, setContainerCostWithIva] = useState('');

  // Parts specific
  const [partsPerUnit, setPartsPerUnit] = useState('');
  const [masterUnitName, setMasterUnitName] = useState('');
  
  // Base Quantities & Costs
  const [quantity, setQuantity] = useState(''); // in base unit: L, kg, cm, partes, pza
  const [minStock, setMinStock] = useState('');
  const [cost, setCost] = useState(''); // cost per base unit
  const [costWithIva, setCostWithIva] = useState('');
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

  // Helper to recalculate base quantity and cost from container parameters
  const recalculateFromContainer = (cCount, cCap, cUnit, cCost, uType) => {
    const count = parseFloat(cCount);
    const cap = parseFloat(cCap);
    const cCostNum = parseFloat(cCost);

    if (!isNaN(count) && !isNaN(cap) && cap > 0) {
      let baseQty = 0;
      if (uType === 'liters') {
        const capInL = cUnit === 'ml' ? cap / 1000 : cap;
        baseQty = Math.round(count * capInL * 1000) / 1000;
      } else if (uType === 'kilos') {
        const capInKg = cUnit === 'g' ? cap / 1000 : cap;
        baseQty = Math.round(count * capInKg * 1000) / 1000;
      } else if (uType === 'centimeters') {
        const capInCm = cUnit === 'm' ? cap * 100 : cap;
        baseQty = Math.round(count * capInCm);
      } else if (uType === 'parts') {
        baseQty = Math.round(count * cap);
      }
      setQuantity(baseQty);
    }

    if (!isNaN(cCostNum) && !isNaN(cap) && cap > 0) {
      let baseCost = 0;
      if (uType === 'liters') {
        const capInL = cUnit === 'ml' ? cap / 1000 : cap;
        baseCost = capInL > 0 ? (cCostNum / capInL) : 0;
      } else if (uType === 'kilos') {
        const capInKg = cUnit === 'g' ? cap / 1000 : cap;
        baseCost = capInKg > 0 ? (cCostNum / capInKg) : 0;
      } else if (uType === 'centimeters') {
        const capInCm = cUnit === 'm' ? cap * 100 : cap;
        baseCost = capInCm > 0 ? (cCostNum / capInCm) : 0;
      } else if (uType === 'parts') {
        baseCost = cap > 0 ? (cCostNum / cap) : 0;
      }
      setCost(baseCost ? baseCost.toFixed(2) : '');
      setCostWithIva(baseCost ? (baseCost * 1.16).toFixed(2) : '');
    }
  };

  const handleContainerCountChange = (val) => {
    setContainersCount(val);
    const cap = unitType === 'parts' ? partsPerUnit : containerCapacity;
    recalculateFromContainer(val, cap, containerUnit, containerCost, unitType);
  };

  const handleContainerCapacityChange = (val) => {
    setContainerCapacity(val);
    recalculateFromContainer(containersCount, val, containerUnit, containerCost, unitType);
  };

  const handleContainerUnitChange = (val) => {
    setContainerUnit(val);
    recalculateFromContainer(containersCount, containerCapacity, val, containerCost, unitType);
  };

  const handleContainerCostChange = (val) => {
    const numeric = parseFloat(val);
    setContainerCost(val);
    setContainerCostWithIva(!isNaN(numeric) ? (numeric * 1.16).toFixed(2) : '');
    const cap = unitType === 'parts' ? partsPerUnit : containerCapacity;
    recalculateFromContainer(containersCount, cap, containerUnit, val, unitType);
  };

  const handleContainerCostWithIvaChange = (val) => {
    const numeric = parseFloat(val);
    setContainerCostWithIva(val);
    const noIva = !isNaN(numeric) ? (numeric / 1.16).toFixed(2) : '';
    setContainerCost(noIva);
    const cap = unitType === 'parts' ? partsPerUnit : containerCapacity;
    recalculateFromContainer(containersCount, cap, containerUnit, noIva, unitType);
  };

  // Base unit cost change (manual)
  const handleCostChange = (val) => {
    const numeric = parseFloat(val);
    setCost(val);
    setCostWithIva(!isNaN(numeric) ? (numeric * 1.16).toFixed(2) : '');
    
    // update container cost if presentation is set
    const capNum = parseFloat(containerCapacity);
    const ppuNum = parseInt(partsPerUnit);
    let capMultiplier = 0;
    if (unitType === 'liters' && !isNaN(capNum)) capMultiplier = containerUnit === 'ml' ? capNum / 1000 : capNum;
    else if (unitType === 'kilos' && !isNaN(capNum)) capMultiplier = containerUnit === 'g' ? capNum / 1000 : capNum;
    else if (unitType === 'centimeters' && !isNaN(capNum)) capMultiplier = containerUnit === 'm' ? capNum * 100 : capNum;
    else if (unitType === 'parts' && !isNaN(ppuNum)) capMultiplier = ppuNum;

    if (!isNaN(numeric) && capMultiplier > 0) {
      const cC = (numeric * capMultiplier).toFixed(2);
      setContainerCost(cC);
      setContainerCostWithIva((cC * 1.16).toFixed(2));
    }
  };

  const handleCostWithIvaChange = (val) => {
    const numeric = parseFloat(val);
    setCostWithIva(val);
    const cNoIva = !isNaN(numeric) ? (numeric / 1.16).toFixed(2) : '';
    setCost(cNoIva);
    handleCostChange(cNoIva);
  };

  const handleUnitTypeSelect = (typeId) => {
    setUnitType(typeId);
    if (typeId === 'liters') {
      setContainerUnit('ml');
    } else if (typeId === 'kilos') {
      setContainerUnit('g');
    } else if (typeId === 'centimeters') {
      setContainerUnit('m');
    } else if (typeId === 'parts') {
      setContainerUnit('partes');
    }
  };

  const handleOpenAdd = () => {
    setItemId(null);
    setCode('');
    setName('');
    setDescription('');
    setUnitType('unit');
    setHasPresentation(true);
    setContainerName('');
    setContainerCapacity('');
    setContainerUnit('ml');
    setContainersCount('');
    setPartsPerUnit('');
    setMasterUnitName('');
    setQuantity('');
    setMinStock('');
    setCost('');
    setCostWithIva('');
    setContainerCost('');
    setContainerCostWithIva('');
    setCategory('');
    setError('');
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setItemId(item.id);
    setCode(item.code || '');
    setName(item.name || '');
    setDescription(item.description || '');
    const uType = item.unitType || 'unit';
    setUnitType(uType);
    
    setContainerName(item.containerName || '');
    setContainerCapacity(item.containerCapacity !== undefined ? item.containerCapacity : '');
    setContainerUnit(item.containerUnit || (uType === 'liters' ? 'ml' : uType === 'kilos' ? 'g' : uType === 'centimeters' ? 'm' : 'partes'));
    setHasPresentation(item.containerName ? true : false);

    const ppu = item.partsPerUnit !== undefined ? item.partsPerUnit : '';
    setPartsPerUnit(ppu);
    setMasterUnitName(item.masterUnitName || '');
    
    const qty = item.quantity !== undefined ? item.quantity : '';
    setQuantity(qty);
    
    // Compute container count from qty
    let capInBase = 0;
    if (uType === 'liters') capInBase = item.containerCapacity ? (item.containerUnit === 'ml' ? item.containerCapacity / 1000 : item.containerCapacity) : 0;
    else if (uType === 'kilos') capInBase = item.containerCapacity ? (item.containerUnit === 'g' ? item.containerCapacity / 1000 : item.containerCapacity) : 0;
    else if (uType === 'centimeters') capInBase = item.containerCapacity ? (item.containerUnit === 'm' ? item.containerCapacity * 100 : item.containerCapacity) : 0;
    else if (uType === 'parts') capInBase = parseInt(ppu) || 0;
    
    setContainersCount(capInBase > 0 && qty !== '' ? (parseFloat(qty) / capInBase).toFixed(2).replace(/\.00$/, '') : '');

    setMinStock(item.minStock !== undefined ? item.minStock : '');
    const itemCost = item.cost !== undefined ? parseFloat(item.cost) : '';
    setCost(itemCost !== '' ? itemCost : '');
    setCostWithIva(itemCost !== '' ? (itemCost * 1.16).toFixed(2) : '');
    
    if (item.containerCost !== undefined) {
      setContainerCost(item.containerCost);
      setContainerCostWithIva((parseFloat(item.containerCost) * 1.16).toFixed(2));
    } else if (itemCost !== '' && capInBase > 0) {
      const cCost = (itemCost * capInBase).toFixed(2);
      setContainerCost(cCost);
      setContainerCostWithIva((parseFloat(cCost) * 1.16).toFixed(2));
    } else {
      setContainerCost('');
      setContainerCostWithIva('');
    }
    
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

    const payload = {
      id: itemId,
      code: code.trim(),
      name: name.trim(),
      description: description.trim(),
      unitType: unitType || 'unit',
      quantity: parseFloat(quantity) || 0,
      minStock: parseFloat(minStock) || 0,
      cost: parseFloat(cost) || 0,
      category: category.trim()
    };

    if (unitType === 'liters' || unitType === 'kilos' || unitType === 'centimeters') {
      if (hasPresentation) {
        payload.containerName = containerName.trim() || (unitType === 'liters' ? 'Botella' : unitType === 'kilos' ? 'Bote' : 'Rollo');
        payload.containerCapacity = parseFloat(containerCapacity) || 1;
        payload.containerUnit = containerUnit;
        payload.containerCost = parseFloat(containerCost) || 0;
      }
    } else if (unitType === 'parts') {
      payload.partsPerUnit = parseInt(partsPerUnit) || 1;
      payload.masterUnitName = masterUnitName.trim() || 'Pliego';
      payload.containerName = payload.masterUnitName;
      payload.containerCapacity = payload.partsPerUnit;
      payload.containerUnit = 'partes';
      payload.containerCost = parseFloat(containerCost) || (payload.cost * payload.partsPerUnit);
    }

    try {
      await saveInventoryItem(payload);
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
    const headers = ["Código", "Nombre", "Descripción", "Categoría", "Tipo Unidad", "Stock Formateado", "Stock Numérico", "Mínimo", "Costo Unit (s/IVA)", "Costo + IVA (16%)", "Valor Total"];
    const csvData = filteredItems.map(item => [
      item.code,
      item.name,
      item.description,
      item.category || 'Sin Categoría',
      UNIT_TYPES.find(u => u.id === (item.unitType || 'unit'))?.label || 'Unitario',
      formatStockDisplay(item),
      item.quantity,
      item.minStock,
      item.cost,
      (item.cost * 1.16).toFixed(2),
      ((parseFloat(item.quantity) || 0) * (parseFloat(item.cost) || 0)).toFixed(2)
    ]);
    exportToCSV(csvData, `Inventario_${new Date().toISOString().slice(0,10)}`, headers);
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(search.toLowerCase()) || 
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
    
    const matchesCategory = categoryFilter === '' || item.category === categoryFilter;
    const matchesUnit = unitFilter === '' || (item.unitType || 'unit') === unitFilter;
    
    return matchesSearch && matchesCategory && matchesUnit;
  });

  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventario de Almacén</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Gestiona piezas, líquidos fraccionables (750ml, 500ml), graneles en peso/longitud y lijas por partes.
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
      <div className="search-filter-bar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div className="search-input-wrapper" style={{ flex: 1, minWidth: '240px' }}>
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
          style={{ maxWidth: '180px' }}
        >
          <option value="">Todas las Categorías</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select 
          className="select-field" 
          value={unitFilter} 
          onChange={(e) => setUnitFilter(e.target.value)}
          style={{ maxWidth: '180px' }}
        >
          <option value="">Todas las Unidades</option>
          {UNIT_TYPES.map(u => (
            <option key={u.id} value={u.id}>{u.label}</option>
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
                <th>Tipo / Unidad</th>
                <th>Categoría</th>
                <th style={{ textAlign: 'center' }}>Stock Total</th>
                <th style={{ textAlign: 'center' }}>Mínimo</th>
                <th style={{ textAlign: 'right' }}>Costo Unit (s/IVA)</th>
                <th style={{ textAlign: 'right' }}>Costo + IVA</th>
                <th style={{ textAlign: 'right' }}>Valor Total</th>
                {isEditable && <th style={{ textAlign: 'center' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={isEditable ? 10 : 9} style={{ textAlign: 'center', padding: '2rem' }}>
                    No se encontraron materiales en el inventario.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isLowStock = parseFloat(item.quantity) <= parseFloat(item.minStock);
                  const uInfo = UNIT_TYPES.find(u => u.id === (item.unitType || 'unit')) || UNIT_TYPES[0];
                  const Icon = uInfo.icon;
                  const itemCost = parseFloat(item.cost) || 0;
                  const itemQty = parseFloat(item.quantity) || 0;

                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: '600', color: 'white', fontFamily: 'monospace' }}>{item.code}</td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'white' }}>{item.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.description}</div>
                      </td>
                      <td>
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '4px', 
                          padding: '3px 8px', 
                          borderRadius: '12px', 
                          fontSize: '0.78rem',
                          background: 'rgba(255,255,255,0.06)',
                          color: '#cbd5e1',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                          <Icon size={12} style={{ color: '#a5b4fc' }} />
                          {uInfo.symbol}
                        </span>
                      </td>
                      <td>{item.category}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${isLowStock ? 'badge-danger' : 'badge-success'}`} style={{ gap: '4px' }}>
                          {isLowStock && <AlertTriangle size={12} />}
                          {formatStockDisplay(item)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {item.minStock} {uInfo.symbol}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {formatUnitCostDisplay(item)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '500', color: 'white' }}>
                        ${(itemCost * 1.16).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '600', color: '#34d399' }}>
                        ${(itemQty * itemCost).toFixed(2)}
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
          <div className="glass-panel modal-content" style={{ maxWidth: '680px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title">{itemId ? 'Modificar Material' : 'Añadir Nuevo Material'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {error && <div className="badge badge-danger" style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem', boxSizing: 'border-box' }}>{error}</div>}

            <form onSubmit={handleSubmit}>
              {/* Unit Type Selector */}
              <div className="form-group">
                <label style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block' }}>
                  Naturaleza y Tipo de Medida *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
                  {UNIT_TYPES.map((u) => {
                    const Icon = u.icon;
                    const isSelected = unitType === u.id;
                    return (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => handleUnitTypeSelect(u.id)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          padding: '0.65rem 0.4rem',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #6366f1' : '1px solid var(--panel-border)',
                          background: isSelected ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255,255,255,0.03)',
                          color: isSelected ? '#a5b4fc' : 'var(--text-primary)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          fontSize: '0.8rem',
                          fontWeight: isSelected ? '600' : 'normal',
                          textAlign: 'center'
                        }}
                      >
                        <Icon size={20} style={{ marginBottom: '4px', color: isSelected ? '#a5b4fc' : 'var(--text-secondary)' }} />
                        <span>{u.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px', fontStyle: 'italic' }}>
                  💡 {UNIT_TYPES.find(u => u.id === unitType)?.desc}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Código / SKU *</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={code} 
                    onChange={(e) => setCode(e.target.value)} 
                    placeholder={unitType === 'liters' ? 'ej. PIN-750ML' : unitType === 'parts' ? 'ej. LIJ-1200' : 'ej. BAL-902'}
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
                    placeholder={unitType === 'liters' ? 'ej. Pintura Negro Brillante' : unitType === 'kilos' ? 'ej. Masilla Poliéster Automotriz' : 'ej. Balatas Delanteras'}
                    required 
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <textarea 
                  className="input-field" 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="Detalles sobre marca, código de color, estante o uso..."
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
                  placeholder="ej. Pintura, Hojalatería, Mecánica, Frenos, Consumibles..."
                  required 
                  list="existing-categories"
                />
                <datalist id="existing-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              {/* ── SECCIÓN CONFIGURACIÓN DE PRESENTACIÓN / FRACCIONES (LITROS, KILOS, CM, PARTES) ── */}
              {(unitType === 'liters' || unitType === 'kilos' || unitType === 'centimeters') && (
                <div style={{ 
                  background: 'rgba(99, 102, 241, 0.08)', 
                  border: '1px solid rgba(99, 102, 241, 0.25)', 
                  borderRadius: '8px', 
                  padding: '1rem', 
                  marginBottom: '1rem' 
                }}>
                  <div style={{ fontWeight: '600', color: '#a5b4fc', fontSize: '0.9rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {unitType === 'liters' ? <Droplet size={16} /> : unitType === 'kilos' ? <Scale size={16} /> : <Ruler size={16} />}
                    Configuración de Envase / Presentación Fraccionable
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem' }}>Tipo de Envase / Presentación</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        value={containerName} 
                        onChange={(e) => setContainerName(e.target.value)} 
                        placeholder={unitType === 'liters' ? 'ej. Botella, Garrafa, Bote' : unitType === 'kilos' ? 'ej. Bote, Cubeta, Tubo' : 'ej. Rollo, Carrete, Tira'}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem' }}>Contenido por Envase *</label>
                      <input 
                        type="number" 
                        step="any"
                        className="input-field" 
                        value={containerCapacity} 
                        onChange={(e) => handleContainerCapacityChange(e.target.value)} 
                        min={0.001}
                        placeholder="ej. 750"
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem' }}>Unidad de Medida</label>
                      <select 
                        className="select-field" 
                        value={containerUnit} 
                        onChange={(e) => handleContainerUnitChange(e.target.value)}
                      >
                        {unitType === 'liters' && (
                          <>
                            <option value="ml">Mililitros (ml)</option>
                            <option value="L">Litros (L)</option>
                          </>
                        )}
                        {unitType === 'kilos' && (
                          <>
                            <option value="g">Gramos (g)</option>
                            <option value="kg">Kilos (kg)</option>
                          </>
                        )}
                        {unitType === 'centimeters' && (
                          <>
                            <option value="m">Metros (m)</option>
                            <option value="cm">Centímetros (cm)</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem' }}>Cantidad de {containerName || 'Envases'} en Stock *</label>
                      <input 
                        type="number" 
                        step="any"
                        className="input-field" 
                        value={containersCount} 
                        onChange={(e) => handleContainerCountChange(e.target.value)} 
                        min={0}
                        placeholder="ej. 4"
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#34d399' }}>
                        Stock Total Calculado ({unitType === 'liters' ? 'Litros' : unitType === 'kilos' ? 'Kilos' : 'Centímetros'})
                      </label>
                      <input 
                        type="number" 
                        step="any"
                        className="input-field" 
                        value={quantity} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuantity(val);
                          // back-calculate containers count
                          let capInBase = unitType === 'liters' ? (containerUnit === 'ml' ? containerCapacity / 1000 : containerCapacity) : unitType === 'kilos' ? (containerUnit === 'g' ? containerCapacity / 1000 : containerCapacity) : (containerUnit === 'm' ? containerCapacity * 100 : containerCapacity);
                          if (capInBase > 0) setContainersCount(((parseFloat(val) || 0) / capInBase).toFixed(2).replace(/\.00$/, ''));
                        }} 
                        min={0}
                        placeholder="ej. 3.0"
                        required
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                    💡 El sistema calcula automáticamente el total de stock y el costo unitario base según los datos ingresados.
                  </div>
                </div>
              )}

              {/* Special settings for PARTS / FRACCIONABLE */}
              {unitType === 'parts' && (
                <div style={{ 
                  background: 'rgba(99, 102, 241, 0.08)', 
                  border: '1px solid rgba(99, 102, 241, 0.25)', 
                  borderRadius: '8px', 
                  padding: '1rem', 
                  marginBottom: '1rem' 
                }}>
                  <div style={{ fontWeight: '600', color: '#a5b4fc', fontSize: '0.9rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={16} /> Configuración de Partes Fraccionables (Lijas / Pliegos)
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.82rem' }}>Nombre de la Unidad Maestra</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        value={masterUnitName} 
                        onChange={(e) => {
                          setMasterUnitName(e.target.value);
                          setContainerName(e.target.value);
                        }} 
                        placeholder="ej. Pliego, Hoja, Tira, Rollo..."
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.82rem' }}>¿Cuántas partes rinde 1 {masterUnitName || 'unidad'}? *</label>
                      <input 
                        type="number" 
                        className="input-field" 
                        value={partsPerUnit} 
                        onChange={(e) => {
                          const ppu = parseInt(e.target.value) || 1;
                          setPartsPerUnit(ppu);
                          recalculateFromContainer(containersCount, ppu, 'partes', containerCost, 'parts');
                        }} 
                        min={1}
                        placeholder="ej. 4"
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.82rem' }}>{masterUnitName || 'Unidad'}s completas en stock</label>
                      <input 
                        type="number" 
                        step="any"
                        className="input-field" 
                        value={containersCount} 
                        onChange={(e) => handleContainerCountChange(e.target.value)} 
                        min={0}
                        placeholder="ej. 10"
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#34d399' }}>Total de Partes Disponibles *</label>
                      <input 
                        type="number" 
                        className="input-field" 
                        value={quantity} 
                        onChange={(e) => {
                          setQuantity(e.target.value);
                          const ppu = parseInt(partsPerUnit) || 1;
                          setContainersCount(((parseFloat(e.target.value) || 0) / ppu).toFixed(2).replace(/\.00$/, ''));
                        }} 
                        min={0}
                        placeholder="ej. 40"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Quantity & Stock settings for regular items */}
              {unitType === 'unit' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Cantidad en Stock (Piezas) *</label>
                    <input 
                      type="number" 
                      step="any"
                      className="input-field" 
                      value={quantity} 
                      onChange={(e) => setQuantity(e.target.value)} 
                      min={0}
                      placeholder="ej. 10"
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label>Mínimo de Stock para Alerta (Piezas) *</label>
                    <input 
                      type="number" 
                      step="any"
                      className="input-field" 
                      value={minStock} 
                      onChange={(e) => setMinStock(e.target.value)} 
                      min={0}
                      placeholder="ej. 2"
                      required 
                    />
                  </div>
                </div>
              )}

              {unitType !== 'unit' && (
                <div className="form-group">
                  <label>
                    Mínimo de Stock para Alerta ({unitType === 'liters' ? 'Litros' : unitType === 'kilos' ? 'kg' : unitType === 'centimeters' ? 'cm' : 'Partes'}) *
                  </label>
                  <input 
                    type="number" 
                    step="any"
                    className="input-field" 
                    value={minStock} 
                    onChange={(e) => setMinStock(e.target.value)} 
                    min={0}
                    placeholder="ej. 2"
                    required 
                  />
                </div>
              )}

              {/* Cost Inputs */}
              {unitType !== 'unit' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                  <div className="form-group">
                    <label>Costo por {containerName || 'Envase'} ({containerCapacity || 'Presentación'} {containerUnit}) Sin IVA</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="input-field" 
                      value={containerCost} 
                      onChange={(e) => handleContainerCostChange(e.target.value)} 
                      min={0}
                      placeholder="ej. 150.00"
                      required 
                    />
                    <span style={{ fontSize: '0.78rem', color: '#a5b4fc', marginTop: '3px', display: 'block' }}>
                      ↳ Costo unitario base: ${(parseFloat(cost) || 0).toFixed(2)} / {unitType === 'liters' ? 'Litro' : unitType === 'kilos' ? 'kg' : unitType === 'centimeters' ? 'cm' : 'parte'}
                    </span>
                  </div>
                  <div className="form-group">
                    <label>Costo por {containerName || 'Envase'} (Con IVA 16%)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="input-field" 
                      value={containerCostWithIva} 
                      onChange={(e) => handleContainerCostWithIvaChange(e.target.value)} 
                      min={0}
                      placeholder="ej. 174.00"
                      required 
                    />
                    <span style={{ fontSize: '0.78rem', color: '#34d399', marginTop: '3px', display: 'block' }}>
                      ↳ Con IVA: ${(parseFloat(costWithIva) || 0).toFixed(2)} / {unitType === 'liters' ? 'Litro' : unitType === 'kilos' ? 'kg' : unitType === 'centimeters' ? 'cm' : 'parte'}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Costo Unitario (Sin IVA) *</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="input-field" 
                      value={cost} 
                      onChange={(e) => handleCostChange(e.target.value)} 
                      min={0}
                      placeholder="ej. 50.00"
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
                      placeholder="ej. 58.00"
                      required 
                    />
                  </div>
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Material</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;

