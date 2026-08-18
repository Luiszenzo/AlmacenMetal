import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, Car, FileText } from 'lucide-react';
import { getVehiclesList, getOutgoingsList } from '../config/dbService';
import { generateGeneralPDF } from '../utils/reports';

const Reports = () => {
  const [vehicles, setVehicles] = useState([]);
  const [outgoings, setOutgoings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicleFolio, setSelectedVehicleFolio] = useState('');

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

  // CALCULATIONS
  const totalCostNoIva = outgoings.reduce((acc, o) => acc + (o.totalCost !== undefined ? parseFloat(o.totalCost) : ((parseFloat(o.costPerUnit) || 0) * (parseFloat(o.quantity) || 0))), 0);
  const totalCostWithIva = totalCostNoIva * 1.16;

  // Cost by Vehicle Type
  const costByType = { Tracto: 0, Coche: 0, Motocicleta: 0 };
  outgoings.forEach(out => {
    const veh = vehicles.find(v => v.folio === out.vehicleFolio);
    const type = veh ? veh.type : 'Otro';
    const cost = (out.totalCost !== undefined ? parseFloat(out.totalCost) : ((parseFloat(out.costPerUnit) || 0) * (parseFloat(out.quantity) || 0))) * 1.16; // Con IVA
    if (costByType[type] !== undefined) {
      costByType[type] += cost;
    }
  });

  // Calculate expenses for each vehicle
  const vehicleStats = vehicles.map(veh => {
    const vehOutgoings = outgoings.filter(o => o.vehicleFolio === veh.folio);
    const costNoIva = vehOutgoings.reduce((acc, o) => acc + (o.totalCost !== undefined ? parseFloat(o.totalCost) : ((parseFloat(o.costPerUnit) || 0) * (parseFloat(o.quantity) || 0))), 0);
    const costWithIva = costNoIva * 1.16;
    return {
      ...veh,
      outgoingsCount: vehOutgoings.length,
      costNoIva,
      costWithIva
    };
  }).sort((a, b) => b.costWithIva - a.costWithIva); // highest expense first

  const avgCostPerVehicle = vehicles.length > 0 ? (totalCostWithIva / vehicles.length) : 0;

  const handleDownloadGeneralReport = () => {
    generateGeneralPDF(vehicles, outgoings);
  };

  const selectedVehicleDetails = vehicles.find(v => v.folio === selectedVehicleFolio);
  const selectedVehicleOutgoings = outgoings.filter(o => o.vehicleFolio === selectedVehicleFolio);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reportes e Indicadores</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Análisis financiero de consumos, gastos por vehículos e historial general del taller.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleDownloadGeneralReport} disabled={vehicles.length === 0}>
          <FileText size={18} />
          <span>Reporte General (PDF)</span>
        </button>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          Cargando reportes...
        </div>
      ) : (
        <div>
          {/* Stats Summary Cards */}
          <div className="stats-grid">
            <div className="glass-panel stat-card">
              <div className="stat-icon primary">
                <DollarSign size={20} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Costo Gastado (c/IVA)</span>
                <span className="stat-value" style={{ color: '#34d399' }}>
                  ${totalCostWithIva.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="glass-panel stat-card">
              <div className="stat-icon secondary">
                <TrendingUp size={20} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Promedio por Vehículo</span>
                <span className="stat-value">
                  ${avgCostPerVehicle.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="glass-panel stat-card">
              <div className="stat-icon success">
                <Car size={20} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Total Vehículos</span>
                <span className="stat-value">{vehicles.length}</span>
              </div>
            </div>

            <div className="glass-panel stat-card">
              <div className="stat-icon warning">
                <BarChart3 size={20} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Salidas Registradas</span>
                <span className="stat-value">{outgoings.length}</span>
              </div>
            </div>
          </div>

          {/* Breakdown by vehicle type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Column 1: Expenses by type */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', fontWeight: '600' }}>
                Gastos por Tipo de Vehículo (Con IVA)
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {Object.keys(costByType).map((type) => {
                  const amt = costByType[type];
                  const percentage = totalCostWithIva > 0 ? (amt / totalCostWithIva) * 100 : 0;
                  return (
                    <div key={type}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                        <span>{type === 'Tracto' ? 'Tractos y Camiones' : type === 'Coche' ? 'Coches y Sedan' : type}</span>
                        <span style={{ fontWeight: '600' }}>
                          ${amt.toFixed(2)} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${percentage}%`, 
                          height: '100%', 
                          background: type === 'Tracto' ? 'var(--primary)' : type === 'Coche' ? 'var(--secondary)' : 'var(--success)',
                          borderRadius: '4px'
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Cost Breakdown by Vehicle Selection */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: '600' }}>
                Consulta de Consumos por Vehículo
              </h3>
              
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Selecciona un Vehículo</label>
                <select 
                  className="select-field" 
                  value={selectedVehicleFolio} 
                  onChange={(e) => setSelectedVehicleFolio(e.target.value)}
                >
                  <option value="">-- Elige un vehículo para detallar --</option>
                  {vehicles.map(v => (
                    <option key={v.folio} value={v.folio}>
                      {v.folio} - {v.plate} ({v.type})
                    </option>
                  ))}
                </select>
              </div>

              {selectedVehicleDetails ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem' }}>
                    <span>Estatus: <strong>{selectedVehicleDetails.active ? 'Activo (Taller)' : 'Inactivo (Entregado)'}</strong></span>
                    <span>Placa: <strong>{selectedVehicleDetails.plate}</strong></span>
                  </div>

                  <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Piezas consumidas:</h4>
                  {selectedVehicleOutgoings.length === 0 ? (
                    <p style={{ fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      No se han registrado consumos en este vehículo.
                    </p>
                  ) : (
                    <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '0px' }}>
                      <table className="custom-table" style={{ fontSize: '0.75rem' }}>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Material</th>
                            <th style={{ textAlign: 'center' }}>Cant</th>
                            <th>Solicitó</th>
                            <th style={{ textAlign: 'right' }}>Total (c/IVA)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedVehicleOutgoings.map(o => {
                            const cost = parseFloat(o.costPerUnit) || 0;
                            const qty = parseFloat(o.quantity) || 0;
                            const tot = o.totalCost !== undefined ? parseFloat(o.totalCost) : (cost * qty);
                            const qtyLabel = o.quantityFormatted || `${qty} ${o.unitSymbol || 'pzas'}`;
                            return (
                              <tr key={o.id}>
                                <td>{new Date(o.date).toLocaleDateString('es-MX')}</td>
                                <td style={{ color: 'white', fontWeight: '500' }}>{o.materialName}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                                    {qtyLabel}
                                  </span>
                                </td>
                                <td>{o.technicianName}</td>
                                <td style={{ textAlign: 'right' }}>
                                  ${(tot * 1.16).toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--panel-border)', fontWeight: 'bold' }}>
                    <span>Total invertido (con IVA):</span>
                    <span style={{ color: '#34d399' }}>
                      ${selectedVehicleOutgoings.reduce((acc, o) => acc + ((o.totalCost !== undefined ? parseFloat(o.totalCost) : ((parseFloat(o.costPerUnit) || 0) * (parseFloat(o.quantity) || 0))) * 1.16), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem', textAlign: 'center', marginTop: '2rem' }}>
                  Selecciona un vehículo arriba para auditar su consumo detallado.
                </p>
              )}
            </div>
          </div>

          {/* Master Table of Costs Per Car */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: '600' }}>
              Costo Acumulado por Coche / Vehículo (Desglose General)
            </h3>
            
            <div className="table-container" style={{ marginBottom: 0 }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Placa</th>
                    <th>Tipo</th>
                    <th>Falla / Detalles</th>
                    <th style={{ textAlign: 'center' }}>Estatus</th>
                    <th style={{ textAlign: 'center' }}>Cantidad Retiros</th>
                    <th style={{ textAlign: 'right' }}>Gasto s/IVA</th>
                    <th style={{ textAlign: 'right' }}>Gasto c/IVA (16%)</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleStats.map((v) => (
                    <tr key={v.folio}>
                      <td style={{ fontWeight: '700', color: 'white' }}>{v.folio}</td>
                      <td style={{ fontFamily: 'monospace' }}>{v.plate}</td>
                      <td>{v.type}</td>
                      <td style={{ fontSize: '0.8rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.details}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${v.active ? 'badge-success' : 'badge-danger'}`}>
                          {v.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{v.outgoingsCount}</td>
                      <td style={{ textAlign: 'right' }}>${(v.costNoIva || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: '#34d399' }}>
                        ${(v.costWithIva || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
