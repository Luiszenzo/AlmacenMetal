import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to format currency
const formatCurrency = (val) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
};

// Helper to format date
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-MX') + ' ' + date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

// --- CSV EXPORTER ---
export const exportToCSV = (data, filename, headers) => {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Include BOM for Excel Spanish characters compatibility
  
  // Headers row
  csvContent += headers.join(",") + "\n";
  
  // Data rows
  data.forEach((row) => {
    const rowStr = row.map(value => {
      // Escape double quotes and wrap in quotes if contains comma
      const stringVal = String(value === null || value === undefined ? '' : value);
      const escaped = stringVal.replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(",");
    csvContent += rowStr + "\n";
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- INVENTORY PDF GENERATOR ---
export const generateInventoryPDF = (items) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42); // Navy Dark
  doc.text("ALMACÉN DE PIEZAS Y MATERIALES", 14, 20);
  
  doc.setFontSize(12);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Reporte de Inventario - ${new Date().toLocaleDateString('es-MX')}`, 14, 27);
  
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 32, 196, 32);
  
  // Stats summary in PDF
  const totalItems = items.length;
  const lowStockItems = items.filter(i => i.quantity <= i.minStock).length;
  const totalValue = items.reduce((acc, curr) => acc + (curr.quantity * curr.cost), 0);
  const totalValueWithIVA = totalValue * 1.16;
  
  doc.setFontSize(10);
  doc.setFont("Helvetica", "bold");
  doc.text(`Total Artículos: ${totalItems}`, 14, 40);
  doc.text(`Artículos Stock Bajo: ${lowStockItems}`, 70, 40);
  doc.text(`Valor Total (Sin IVA): ${formatCurrency(totalValue)}`, 130, 40);
  doc.text(`Valor Total (Con IVA 16%): ${formatCurrency(totalValueWithIVA)}`, 130, 45);
  
  // Table
  const tableHeaders = [["Código", "Nombre", "Categoría", "Stock", "Mínimo", "Costo Unitario", "Costo + IVA", "Valor Stock"]];
  const tableData = items.map(item => [
    item.code,
    item.name,
    item.category || 'N/A',
    item.quantity,
    item.minStock,
    formatCurrency(item.cost),
    formatCurrency(item.cost * 1.16),
    formatCurrency(item.quantity * item.cost)
  ]);
  
  autoTable(doc, {
    startY: 52,
    head: tableHeaders,
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 40 },
      2: { cellWidth: 25 },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' }
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const str = "Página " + doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(str, 196 - doc.getTextWidth(str), 285);
    }
  });
  
  doc.save(`Inventario_${new Date().toISOString().slice(0,10)}.pdf`);
};

// --- INDIVIDUAL VEHICLE PDF REPORT ---
export const generateVehiclePDF = (vehicle, outgoings, totalCost, updates = []) => {
  const doc = new jsPDF();

  const pageFooter = (data) => {
    const str = "Página " + doc.internal.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(str, 196 - doc.getTextWidth(str), 285);
  };
  
  // Title
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("REPORTE DETALLADO DE VEHÍCULO", 14, 20);
  
  doc.setFontSize(10);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString('es-MX')}`, 14, 26);
  
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 30, 196, 30);
  
  // Vehicle Details Box
  doc.setFontSize(11);
  doc.setFont("Helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Datos del Vehículo:", 14, 38);
  
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Folio: ${vehicle.folio}`, 14, 44);
  doc.text(`Placa: ${vehicle.plate}`, 14, 50);
  doc.text(`Tipo: ${vehicle.type}`, 14, 56);
  if (vehicle.color) doc.text(`Color: ${vehicle.color}`, 14, 62);
  doc.text(`Estatus: ${vehicle.active ? 'Activo' : 'Inactivo'}`, 100, 44);
  doc.text(`Fecha de Entrada: ${formatDate(vehicle.entryDate)}`, 100, 50);
  if (vehicle.insurance) doc.text(`Aseguradora: ${vehicle.insurance}`, 100, 56);
  if (vehicle.model) doc.text(`Modelo: ${vehicle.model}`, 100, 62);
  
  let detailsStartY = vehicle.color ? 70 : 64;
  doc.text("Detalles / Falla:", 14, detailsStartY);
  doc.setFont("Helvetica", "oblique");
  const splitDetails = doc.splitTextToSize(vehicle.details || "Sin detalles registrados.", 175);
  doc.text(splitDetails, 14, detailsStartY + 5);
  
  let nextY = detailsStartY + 5 + (splitDetails.length * 5) + 5;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, nextY, 196, nextY);
  
  // Financial Summary
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("Resumen de Gasto:", 14, nextY + 8);
  
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Costo Materiales Gastados (Sin IVA):`, 14, nextY + 14);
  doc.text(formatCurrency(totalCost), 100, nextY + 14);
  
  doc.text(`Costo Materiales Gastados (Con IVA 16%):`, 14, nextY + 20);
  doc.setFont("Helvetica", "bold");
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(totalCost * 1.16), 100, nextY + 20);
  doc.setTextColor(15, 23, 42);
  
  // Table of outgoings for this vehicle
  const tableHeaders = [["Fecha", "Material", "Cant", "Costo Unit (s/IVA)", "IVA (16%)", "Total unit (c/IVA)", "Costo Total (c/IVA)", "Solicitado por"]];
  const tableData = outgoings.map(out => {
    const cost = out.costPerUnit || 0;
    const qty = out.quantity || 0;
    const costIVA = cost * 1.16;
    return [
      formatDate(out.date).split(' ')[0],
      out.materialName,
      qty,
      formatCurrency(cost),
      formatCurrency(cost * 0.16),
      formatCurrency(costIVA),
      formatCurrency(qty * costIVA),
      out.technicianName
    ];
  });
  
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Desglose de Materiales Consumidos:", 14, nextY + 30);
  
  autoTable(doc, {
    startY: nextY + 34,
    head: tableHeaders,
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 35 },
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { cellWidth: 35 }
    },
    didDrawPage: pageFooter
  });

  // ---- BITÁCORA SECTION ----
  if (updates.length > 0) {
    const folders = updates.filter(u => u.type === 'folder')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const entries = updates.filter(u => u.type === 'entry');
    const legacyEntries = updates.filter(u => !u.type);

    let curY = doc.lastAutoTable.finalY + 12;

    // Section header
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);

    // Check if we need a new page for the section header
    if (curY > 260) { doc.addPage(); curY = 20; }

    doc.text("Bitácora de Trabajo", 14, curY);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, curY + 3, 196, curY + 3);
    curY += 10;

    // Render folders
    for (const folder of folders) {
      const folderEntries = entries
        .filter(e => e.folderId === folder.id)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      if (curY > 260) { doc.addPage(); curY = 20; }

      // Folder header bar
      doc.setFillColor(240, 245, 255);
      doc.setDrawColor(200, 215, 240);
      doc.roundedRect(14, curY, 182, 10, 2, 2, 'FD');
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`Carpeta: ${folder.name}`, 18, curY + 7);
      curY += 13;

      // Folder description
      if (folder.description) {
        doc.setFont("Helvetica", "oblique");
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        const splitDesc = doc.splitTextToSize(folder.description, 170);
        if (curY + splitDesc.length * 4 > 270) { doc.addPage(); curY = 20; }
        doc.text(splitDesc, 18, curY);
        curY += splitDesc.length * 4 + 3;
      }

      if (folderEntries.length === 0) {
        doc.setFont("Helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(150, 160, 175);
        doc.text("Sin entradas registradas.", 22, curY);
        curY += 7;
      } else {
        for (const entry of folderEntries) {
          if (curY > 260) { doc.addPage(); curY = 20; }

          const dateStr = new Date(entry.createdAt).toLocaleDateString('es-MX', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
          });
          const timeStr = new Date(entry.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

          // Entry date + author
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(71, 85, 105);
          doc.text(`• ${dateStr} ${timeStr}  —  ${entry.createdBy || ''}`, 20, curY);
          curY += 5;

          // Entry note
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(30, 41, 59);
          const splitNote = doc.splitTextToSize(entry.note || '', 165);
          if (curY + splitNote.length * 4.5 > 270) { doc.addPage(); curY = 20; }
          doc.text(splitNote, 24, curY);
          curY += splitNote.length * 4.5 + 4;
        }
      }
      curY += 3;
    }

    // Legacy entries
    if (legacyEntries.length > 0) {
      if (curY > 255) { doc.addPage(); curY = 20; }

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(220, 225, 235);
      doc.roundedRect(14, curY, 182, 10, 2, 2, 'FD');
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text("Registros Anteriores", 18, curY + 7);
      curY += 13;

      for (const u of legacyEntries) {
        if (curY > 260) { doc.addPage(); curY = 20; }
        const dateStr = new Date(u.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`• ${dateStr}  —  ${u.technicianName || ''}`, 20, curY);
        curY += 5;

        const notes = [
          u.bodyworkNote ? `Hojalatería: ${u.bodyworkNote}` : null,
          u.mechanicsNote ? `Mecánica: ${u.mechanicsNote}` : null,
          u.generalNote ? `General: ${u.generalNote}` : null,
        ].filter(Boolean).join('  |  ');

        if (notes) {
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(30, 41, 59);
          const splitNotes = doc.splitTextToSize(notes, 165);
          if (curY + splitNotes.length * 4.5 > 270) { doc.addPage(); curY = 20; }
          doc.text(splitNotes, 24, curY);
          curY += splitNotes.length * 4.5 + 4;
        }
      }
    }
  }
  
  doc.save(`Reporte_Vehiculo_${vehicle.folio}.pdf`);
};

// --- GENERAL VEHICLES AND OUTGOINGS PDF REPORT ---
export const generateGeneralPDF = (vehicles, outgoings) => {
  const doc = new jsPDF();
  
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("REPORTE GENERAL DE GASTOS Y VEHÍCULOS", 14, 20);
  
  doc.setFontSize(10);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString('es-MX')}`, 14, 26);
  
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 30, 196, 30);
  
  // Calculate analytics
  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter(v => v.active).length;
  
  // Total cost calculations
  const totalOutgoingCost = outgoings.reduce((acc, o) => acc + ((o.costPerUnit || 0) * (o.quantity || 0)), 0);
  const totalOutgoingCostIVA = totalOutgoingCost * 1.16;
  
  // Expenses per vehicle type
  const costByType = { Tracto: 0, Coche: 0, Motocicleta: 0 };
  outgoings.forEach(out => {
    const veh = vehicles.find(v => v.folio === out.vehicleFolio);
    const type = veh ? veh.type : 'Otro';
    const cost = (out.costPerUnit || 0) * (out.quantity || 0) * 1.16; // Con IVA
    if (costByType[type] !== undefined) {
      costByType[type] += cost;
    } else {
      costByType['Otro'] = (costByType['Otro'] || 0) + cost;
    }
  });
  
  doc.setFontSize(11);
  doc.setFont("Helvetica", "bold");
  doc.text("Estadísticas Generales:", 14, 38);
  
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Vehículos Registrados: ${totalVehicles}`, 14, 44);
  doc.text(`Vehículos Activos (Taller): ${activeVehicles}`, 14, 50);
  doc.text(`Vehículos Inactivos (Entregados): ${totalVehicles - activeVehicles}`, 14, 56);
  
  doc.text(`Gasto Total Acumulado (Sin IVA):`, 100, 44);
  doc.text(formatCurrency(totalOutgoingCost), 160, 44);
  doc.text(`Gasto Total Acumulado (Con IVA):`, 100, 50);
  doc.setFont("Helvetica", "bold");
  doc.text(formatCurrency(totalOutgoingCostIVA), 160, 50);
  doc.setFont("Helvetica", "normal");
  
  doc.text("Gasto por Tipo de Vehículo (Con IVA):", 14, 66);
  doc.text(`Tractos: ${formatCurrency(costByType.Tracto)}`, 14, 72);
  doc.text(`Coches: ${formatCurrency(costByType.Coche)}`, 14, 78);
  doc.text(`Motocicletas: ${formatCurrency(costByType.Motocicleta)}`, 14, 84);
  
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 90, 196, 90);
  
  // Table: Summary of Cost Per Vehicle
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Costo Gastado por Coche (Vehículo):", 14, 98);
  
  const vehicleTableHeaders = [["Folio", "Placa", "Tipo", "Detalles", "Estatus", "Gasto Total (Con IVA)"]];
  const vehicleTableData = vehicles.map(veh => {
    const vehOutgoings = outgoings.filter(o => o.vehicleFolio === veh.folio);
    const cost = vehOutgoings.reduce((acc, o) => acc + ((o.costPerUnit || 0) * (o.quantity || 0)), 0);
    return [
      veh.folio,
      veh.plate,
      veh.type,
      veh.details || '',
      veh.active ? 'Activo' : 'Inactivo',
      formatCurrency(cost * 1.16)
    ];
  });
  
  autoTable(doc, {
    startY: 104,
    head: vehicleTableHeaders,
    body: vehicleTableData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    columnStyles: {
      3: { cellWidth: 60 },
      5: { halign: 'right', fontStyle: 'bold' }
    },
    didDrawPage: (data) => {
      const str = "Página " + doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(str, 196 - doc.getTextWidth(str), 285);
    }
  });
  
  doc.save(`Reporte_General_Vehiculos_${new Date().toISOString().slice(0,10)}.pdf`);
};
