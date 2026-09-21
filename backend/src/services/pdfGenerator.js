/**
 * AcuStock Enterprise PDF Document Generation Engine
 * ─────────────────────────────────────────────────────────────────
 * Pure Node.js streaming PDF generator using PDFKit.
 *
 * Guaranteed Properties:
 *   1. Pure presentation: receives pre-authorized data; performs NO database queries.
 *   2. Tenant-branded: dynamic company headers, currency, tax rules, and contact info.
 *   3. Professional typography: crisp vector layouts, clean tables, serial number breakouts.
 *   4. Streaming: pipes directly into Express HTTP response streams (`doc.pipe(res)`).
 */

const PDFDocument = require('pdfkit');

// ── Color Palette ─────────────────────────────────────────────
const COLORS = {
  primary:       '#0b1424',
  secondary:     '#1e293b',
  accent:        '#2563eb',
  accentLight:   '#eff6ff',
  textDark:      '#0f172a',
  textMuted:     '#64748b',
  textLight:     '#94a3b8',
  border:        '#e2e8f0',
  borderDark:    '#cbd5e1',
  tableHeaderBg: '#f8fafc',
  rowAltBg:      '#fbfcfd',
  success:       '#16a34a',
  warning:       '#d97706',
  danger:        '#dc2626'
};

// ── Helpers: Currency & Date Formatting ────────────────────────
const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'CA$',
  AUD: 'AU$',
  AED: 'AED '
};

function formatCurrency(amount, currency = 'INR') {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateVal) {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Core: Document Initialization ─────────────────────────────
function createDocument() {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: {
      Title: 'AcuStock Document',
      Author: 'AcuStock Enterprise SaaS',
      Creator: 'AcuStock PDF Engine'
    }
  });
  return doc;
}

// ── Sub-component: Organization Header ─────────────────────────
function drawHeader(doc, tenant, title, docNumber) {
  const brand = tenant?.branding || {};
  const tenantName = tenant?.name || 'AcuStock Organization';
  const addr = brand.address || {};
  const addressLine = [addr.street, addr.city, addr.state, addr.zipCode, addr.country]
    .filter(Boolean)
    .join(', ');

  // Left Column: Organization Branding
  doc.fontSize(16).fillColor(COLORS.primary).font('Helvetica-Bold').text(tenantName, 40, 40);
  
  doc.fontSize(8.5).fillColor(COLORS.textMuted).font('Helvetica');
  let currentY = 60;
  
  if (addressLine) {
    doc.text(addressLine, 40, currentY, { width: 280 });
    currentY += 12;
  }
  if (brand.taxId) {
    doc.text(`GSTIN / Tax ID: ${brand.taxId}`, 40, currentY);
    currentY += 12;
  }
  const contact = [brand.supportEmail, brand.phone].filter(Boolean).join('  |  ');
  if (contact) {
    doc.text(contact, 40, currentY);
    currentY += 12;
  }

  // Right Column: Document Type Title & Number Badge
  doc.fontSize(18).fillColor(COLORS.accent).font('Helvetica-Bold').text(title.toUpperCase(), 340, 40, { align: 'right', width: 215 });
  doc.fontSize(10).fillColor(COLORS.textDark).font('Helvetica-Bold').text(docNumber || '', 340, 62, { align: 'right', width: 215 });

  // Divider line
  const dividerY = Math.max(currentY + 10, 100);
  doc.moveTo(40, dividerY).lineTo(555, dividerY).strokeColor(COLORS.border).lineWidth(1).stroke();

  return dividerY + 15;
}

// ── Sub-component: Document Metadata Grid ──────────────────────
function drawMetaGrid(doc, startY, metadataItems) {
  const boxWidth = (515 - (metadataItems.length - 1) * 10) / metadataItems.length;
  
  doc.roundedRect(40, startY, 515, 45, 4).fillColor(COLORS.tableHeaderBg).fill();
  doc.roundedRect(40, startY, 515, 45, 4).strokeColor(COLORS.border).lineWidth(1).stroke();

  metadataItems.forEach((item, idx) => {
    const x = 40 + idx * (boxWidth + 10) + 8;
    doc.fontSize(7.5).fillColor(COLORS.textMuted).font('Helvetica').text(item.label.toUpperCase(), x, startY + 8, { width: boxWidth - 16 });
    doc.fontSize(9).fillColor(COLORS.textDark).font('Helvetica-Bold').text(item.value || '—', x, startY + 22, { width: boxWidth - 16 });
  });

  return startY + 55;
}

// ── Sub-component: Party Section (Bill To / Ship To / Vendor) ─
function drawPartySection(doc, startY, partyA, partyB = null) {
  const width = partyB ? 245 : 515;

  // Box A
  doc.roundedRect(40, startY, width, 75, 4).strokeColor(COLORS.border).lineWidth(1).stroke();
  doc.rect(40, startY, width, 20).fillColor(COLORS.accentLight).fill();
  doc.fontSize(8).fillColor(COLORS.accent).font('Helvetica-Bold').text(partyA.title.toUpperCase(), 48, startY + 6);

  doc.fontSize(8.5).fillColor(COLORS.textDark).font('Helvetica-Bold').text(partyA.name || '—', 48, startY + 26, { width: width - 16 });
  doc.fontSize(8).fillColor(COLORS.textMuted).font('Helvetica');
  let yA = startY + 38;
  if (partyA.contact) { doc.text(partyA.contact, 48, yA, { width: width - 16 }); yA += 11; }
  if (partyA.address) { doc.text(partyA.address, 48, yA, { width: width - 16, height: 22 }); }

  // Box B (Optional)
  if (partyB) {
    const xB = 310;
    doc.roundedRect(xB, startY, width, 75, 4).strokeColor(COLORS.border).lineWidth(1).stroke();
    doc.rect(xB, startY, width, 20).fillColor(COLORS.tableHeaderBg).fill();
    doc.fontSize(8).fillColor(COLORS.textDark).font('Helvetica-Bold').text(partyB.title.toUpperCase(), xB + 8, startY + 6);

    doc.fontSize(8.5).fillColor(COLORS.textDark).font('Helvetica-Bold').text(partyB.name || '—', xB + 8, startY + 26, { width: width - 16 });
    doc.fontSize(8).fillColor(COLORS.textMuted).font('Helvetica');
    let yB = startY + 38;
    if (partyB.contact) { doc.text(partyB.contact, xB + 8, yB, { width: width - 16 }); yB += 11; }
    if (partyB.address) { doc.text(partyB.address, xB + 8, yB, { width: width - 16, height: 22 }); }
  }

  return startY + 85;
}

// ── Sub-component: Line Items Table ────────────────────────────
function drawTable(doc, startY, columns, rows) {
  let currentY = startY;

  // Header row
  doc.rect(40, currentY, 515, 22).fillColor(COLORS.primary).fill();
  
  let colX = 48;
  columns.forEach((col) => {
    doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold').text(
      col.header.toUpperCase(),
      colX,
      currentY + 7,
      { width: col.width, align: col.align || 'left' }
    );
    colX += col.width;
  });

  currentY += 22;

  // Rows
  rows.forEach((row, idx) => {
    // Check if new page needed
    if (currentY > 700) {
      doc.addPage();
      currentY = 40;
    }

    const rowHeight = row.serials && row.serials.length > 0 ? 34 : 22;
    if (idx % 2 === 1) {
      doc.rect(40, currentY, 515, rowHeight).fillColor(COLORS.rowAltBg).fill();
    }
    doc.rect(40, currentY, 515, rowHeight).strokeColor(COLORS.border).lineWidth(0.5).stroke();

    let cellX = 48;
    columns.forEach((col) => {
      const val = row[col.key] !== undefined ? String(row[col.key]) : '—';
      doc.fontSize(8).fillColor(COLORS.textDark).font('Helvetica').text(
        val,
        cellX,
        currentY + 6,
        { width: col.width, align: col.align || 'left' }
      );
      cellX += col.width;
    });

    // Serial breakout sub-row
    if (row.serials && row.serials.length > 0) {
      const serialStr = `S/N: ${row.serials.join(', ')}`;
      doc.fontSize(7).fillColor(COLORS.accent).font('Helvetica-Oblique').text(
        serialStr,
        48,
        currentY + 19,
        { width: 500 }
      );
    }

    currentY += rowHeight;
  });

  return currentY + 10;
}

// ── Sub-component: Totals Box ──────────────────────────────────
function drawTotals(doc, startY, subtotal, taxBreakdown = [], grandTotal, currency = 'INR') {
  let currentY = startY;
  if (currentY > 660) {
    doc.addPage();
    currentY = 40;
  }

  const boxX = 310;
  const boxWidth = 245;

  // Subtotal
  doc.fontSize(8.5).fillColor(COLORS.textMuted).font('Helvetica').text('Subtotal:', boxX, currentY, { width: 120, align: 'left' });
  doc.fontSize(8.5).fillColor(COLORS.textDark).font('Helvetica-Bold').text(formatCurrency(subtotal, currency), boxX + 120, currentY, { width: 120, align: 'right' });
  currentY += 15;

  // Tax breakdown lines
  taxBreakdown.forEach((tax) => {
    doc.fontSize(8).fillColor(COLORS.textMuted).font('Helvetica').text(`${tax.label}:`, boxX, currentY, { width: 120, align: 'left' });
    doc.fontSize(8).fillColor(COLORS.textDark).font('Helvetica').text(formatCurrency(tax.amount, currency), boxX + 120, currentY, { width: 120, align: 'right' });
    currentY += 13;
  });

  // Divider
  doc.moveTo(boxX, currentY).lineTo(boxX + boxWidth, currentY).strokeColor(COLORS.borderDark).lineWidth(1).stroke();
  currentY += 6;

  // Grand Total banner
  doc.roundedRect(boxX, currentY, boxWidth, 24, 3).fillColor(COLORS.accent).fill();
  doc.fontSize(9.5).fillColor('#ffffff').font('Helvetica-Bold').text('GRAND TOTAL:', boxX + 10, currentY + 7, { width: 100, align: 'left' });
  doc.fontSize(10.5).fillColor('#ffffff').font('Helvetica-Bold').text(formatCurrency(grandTotal, currency), boxX + 110, currentY + 6, { width: 125, align: 'right' });

  return currentY + 35;
}

// ── Sub-component: Footer & Signatures ─────────────────────────
function drawFooter(doc, startY, termsText, signatoryLabel = 'Authorized Signatory') {
  let currentY = startY;
  if (currentY > 680) {
    doc.addPage();
    currentY = 40;
  }

  // Left: Terms & Conditions
  doc.fontSize(7.5).fillColor(COLORS.textMuted).font('Helvetica-Bold').text('TERMS & CONDITIONS', 40, currentY);
  doc.fontSize(7).fillColor(COLORS.textMuted).font('Helvetica').text(
    termsText || 'Payment is due within 30 days. Goods once sold will not be taken back without valid RMA.',
    40,
    currentY + 12,
    { width: 280 }
  );

  // Right: Signature stamp box
  const sigX = 370;
  doc.roundedRect(sigX, currentY, 185, 60, 4).strokeColor(COLORS.border).lineWidth(1).stroke();
  doc.fontSize(7.5).fillColor(COLORS.textDark).font('Helvetica-Bold').text(signatoryLabel, sigX + 10, currentY + 45, { width: 165, align: 'center' });
  doc.moveTo(sigX + 20, currentY + 40).lineTo(sigX + 165, currentY + 40).strokeColor(COLORS.borderDark).lineWidth(0.75).stroke();

  // Bottom Pagination on all pages
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor(COLORS.textLight).font('Helvetica').text(
      `Generated by AcuStock SaaS  |  Page ${i + 1} of ${totalPages}`,
      40,
      800,
      { align: 'center', width: 515 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC GENERATOR 1: Sales Order / Tax Invoice PDF
// ═══════════════════════════════════════════════════════════════
function generateSalesOrderInvoicePdf(salesOrder, tenant, outStream) {
  const doc = createDocument();
  doc.pipe(outStream);

  const currency = tenant?.settings?.currency || 'USD';
  const brand = tenant?.branding || {};

  // 1. Header
  const afterHeaderY = drawHeader(doc, tenant, 'Tax Invoice', `INV / ${salesOrder.soNumber}`);

  // 2. Metadata Grid
  const metaItems = [
    { label: 'SO Number', value: salesOrder.soNumber },
    { label: 'Invoice Date', value: formatDate(salesOrder.createdAt) },
    { label: 'Expected Delivery', value: formatDate(salesOrder.expectedDeliveryDate) },
    { label: 'Status', value: (salesOrder.status || 'Draft').toUpperCase() }
  ];
  const afterMetaY = drawMetaGrid(doc, afterHeaderY, metaItems);

  // 3. Parties: Bill To & Ship To
  const buyer = salesOrder.buyer || {};
  const partyA = {
    title:   'Billed To',
    name:    buyer.name || 'Valued Customer',
    contact: [buyer.phone, buyer.email].filter(Boolean).join('  •  '),
    address: buyer.address || 'Address on file'
  };
  const partyB = {
    title:   'Shipped From',
    name:    tenant?.name || 'Main Warehouse',
    contact: [brand.supportEmail, brand.phone].filter(Boolean).join('  •  '),
    address: [brand.address?.street, brand.address?.city, brand.address?.state].filter(Boolean).join(', ') || 'Warehouse address'
  };
  const afterPartyY = drawPartySection(doc, afterMetaY, partyA, partyB);

  // 4. Line Items Table
  const columns = [
    { key: 'item',      header: 'Product Description', width: 230, align: 'left'  },
    { key: 'qty',       header: 'Qty',                 width: 50,  align: 'center'},
    { key: 'unitPrice', header: 'Unit Price',          width: 100, align: 'right' },
    { key: 'total',     header: 'Total',               width: 120, align: 'right' }
  ];

  let subtotal = 0;
  const rows = (salesOrder.items || []).map((line) => {
    const itemObj = line.productId || {};
    const name = typeof itemObj === 'object' ? itemObj.name : 'Product';
    const shortName = typeof itemObj === 'object' ? itemObj.shortName : '';
    const desc = shortName ? `${name} (${shortName})` : name;
    const lineTotal = line.lineTotal || (line.quantity * line.unitPrice);
    subtotal += lineTotal;

    return {
      item:      desc,
      qty:       line.quantity,
      unitPrice: formatCurrency(line.unitPrice, currency),
      total:     formatCurrency(lineTotal, currency),
      serials:   line.serialNumbers || []
    };
  });

  const afterTableY = drawTable(doc, afterPartyY, columns, rows);

  // 5. Totals (Subtotal, Standard Tax, Grand Total)
  const taxRate = 0.18; // Default 18% GST/Tax
  const taxAmount = subtotal * taxRate;
  const grandTotal = subtotal + taxAmount;
  const taxBreakdown = [
    { label: 'CGST (9%)', amount: taxAmount / 2 },
    { label: 'SGST (9%)', amount: taxAmount / 2 }
  ];

  const afterTotalsY = drawTotals(doc, afterTableY, subtotal, taxBreakdown, grandTotal, currency);

  // 6. Footer
  drawFooter(doc, afterTotalsY, brand.invoiceTerms, 'Authorized Signatory');

  doc.end();
  return doc;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC GENERATOR 2: Purchase Order PDF
// ═══════════════════════════════════════════════════════════════
function generatePurchaseOrderPdf(purchaseOrder, tenant, outStream) {
  const doc = createDocument();
  doc.pipe(outStream);

  const currency = tenant?.settings?.currency || 'USD';
  const brand = tenant?.branding || {};

  // 1. Header
  const afterHeaderY = drawHeader(doc, tenant, 'Purchase Order', purchaseOrder.poNumber);

  // 2. Metadata Grid
  const metaItems = [
    { label: 'PO Number', value: purchaseOrder.poNumber },
    { label: 'PO Date', value: formatDate(purchaseOrder.createdAt) },
    { label: 'Expected Delivery', value: formatDate(purchaseOrder.expectedDeliveryDate) },
    { label: 'Approval Status', value: (purchaseOrder.status || 'Draft').toUpperCase() }
  ];
  const afterMetaY = drawMetaGrid(doc, afterHeaderY, metaItems);

  // 3. Supplier Details
  const supplier = purchaseOrder.supplier || {};
  const partyA = {
    title:   'Supplier / Vendor',
    name:    supplier.name || 'Vendor Name',
    contact: [supplier.phone, supplier.email].filter(Boolean).join('  •  '),
    address: supplier.address || 'Vendor physical address'
  };
  const partyB = {
    title:   'Deliver To (Our Warehouse)',
    name:    tenant?.name || 'Receiving Department',
    contact: [brand.supportEmail, brand.phone].filter(Boolean).join('  •  '),
    address: [brand.address?.street, brand.address?.city, brand.address?.state].filter(Boolean).join(', ') || 'Warehouse address'
  };
  const afterPartyY = drawPartySection(doc, afterMetaY, partyA, partyB);

  // 4. Items Table
  const columns = [
    { key: 'item',      header: 'Item Description', width: 230, align: 'left'  },
    { key: 'qty',       header: 'Ordered Qty',      width: 60,  align: 'center'},
    { key: 'unitRate',  header: 'Unit Rate',        width: 90,  align: 'right' },
    { key: 'total',     header: 'Amount',           width: 120, align: 'right' }
  ];

  let totalAmount = 0;
  const rows = (purchaseOrder.items || []).map((line) => {
    const itemObj = line.productId || {};
    const name = typeof itemObj === 'object' ? itemObj.name : 'Product';
    const shortName = typeof itemObj === 'object' ? itemObj.shortName : '';
    const desc = shortName ? `${name} (${shortName})` : name;
    const lineTotal = line.lineTotal || (line.quantity * line.unitPrice);
    totalAmount += lineTotal;

    return {
      item:     desc,
      qty:      line.quantity,
      unitRate: formatCurrency(line.unitPrice, currency),
      total:    formatCurrency(lineTotal, currency)
    };
  });

  const afterTableY = drawTable(doc, afterPartyY, columns, rows);

  // 5. Total
  const afterTotalsY = drawTotals(doc, afterTableY, totalAmount, [], totalAmount, currency);

  // 6. Footer
  const poTerms = purchaseOrder.notes || 'Goods subject to inspection on receiving. Defective items will be rejected.';
  drawFooter(doc, afterTotalsY, poTerms, 'Purchasing Manager');

  doc.end();
  return doc;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC GENERATOR 3: Delivery Challan / Shipping Waybill PDF
// ═══════════════════════════════════════════════════════════════
function generateShipmentChallanPdf(shipment, tenant, outStream) {
  const doc = createDocument();
  doc.pipe(outStream);

  const brand = tenant?.branding || {};

  // 1. Header
  const afterHeaderY = drawHeader(doc, tenant, 'Delivery Challan', shipment.reference);

  // 2. Metadata Grid
  const metaItems = [
    { label: 'Challan Ref', value: shipment.reference },
    { label: 'Dispatch Date', value: formatDate(shipment.dispatchDate || shipment.createdAt) },
    { label: 'Courier & AWB', value: shipment.awb ? `${shipment.courier || 'Courier'}: ${shipment.awb}` : 'Direct Delivery' },
    { label: 'Status', value: (shipment.status || 'Pending').toUpperCase() }
  ];
  const afterMetaY = drawMetaGrid(doc, afterHeaderY, metaItems);

  // 3. Recipient Details
  const partyA = {
    title:   'Consignee (Deliver To)',
    name:    shipment.customerName || shipment.companyName || 'Consignee',
    contact: [shipment.phone, shipment.email].filter(Boolean).join('  •  '),
    address: [shipment.address, shipment.city, shipment.state, shipment.pincode].filter(Boolean).join(', ') || 'Delivery address'
  };
  const partyB = {
    title:   'Package Details',
    name:    `Type: ${shipment.type === 'OUT' ? 'Customer Dispatch' : 'Inbound Supply'}`,
    contact: `Boxes: ${shipment.boxes || 1}  •  Weight: ${shipment.weight || 'Standard'}`,
    address: `Dispatch Mode: ${shipment.dispatchType || 'Standard'}  •  Terms: ${shipment.deliveryType || 'Prepaid'}`
  };
  const afterPartyY = drawPartySection(doc, afterMetaY, partyA, partyB);

  // 4. Products Table
  const columns = [
    { key: 'product',   header: 'Product Description', width: 330, align: 'left'  },
    { key: 'condition', header: 'Condition',           width: 90,  align: 'center'},
    { key: 'qty',       header: 'Quantity',            width: 80,  align: 'right' }
  ];

  const rows = [{
    product:   shipment.productName || 'Product',
    condition: shipment.condition || 'New',
    qty:       `${shipment.quantity} Unit(s)`,
    serials:   shipment.serialNumbers || []
  }];

  const afterTableY = drawTable(doc, afterPartyY, columns, rows);

  // 5. Customer Acknowledgement & Footer
  let currentY = afterTableY + 10;
  if (currentY > 660) {
    doc.addPage();
    currentY = 40;
  }

  // Acknowledgement Box
  doc.roundedRect(40, currentY, 515, 65, 4).strokeColor(COLORS.border).lineWidth(1).stroke();
  doc.rect(40, currentY, 515, 18).fillColor(COLORS.tableHeaderBg).fill();
  doc.fontSize(8).fillColor(COLORS.textDark).font('Helvetica-Bold').text('CUSTOMER ACKNOWLEDGEMENT & PROOF OF DELIVERY', 48, currentY + 5);

  doc.fontSize(7.5).fillColor(COLORS.textMuted).font('Helvetica');
  doc.text('Received the above goods in sound condition and complete quantity.', 48, currentY + 25);
  doc.text('Receiver Name: __________________________   Signature: __________________________   Date: ____________', 48, currentY + 45);

  currentY += 80;

  drawFooter(doc, currentY, shipment.remarks || 'Please verify physical serial numbers upon receipt.', 'Dispatch In-Charge');

  doc.end();
  return doc;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC GENERATOR 4: SaaS Subscription Tax Invoice PDF
// ═══════════════════════════════════════════════════════════════
function generateSubscriptionInvoicePdf(tenant, transaction, planInfo, outStream) {
  const doc = createDocument();
  if (outStream) {
    doc.pipe(outStream);
  }

  const currency = (transaction?.currency || 'INR').toUpperCase();
  const totalAmount = (transaction?.amountMinor || 0) / 100;
  const isRefunded = transaction?.status === 'REFUNDED';
  const invoiceNumber = `INV-${(transaction?.transactionId || 'SUB').toUpperCase()}`;

  // 1. AcuStock SaaS Platform Header
  doc.fontSize(16).fillColor(COLORS.primary).font('Helvetica-Bold').text('AcuStock Cloud Technologies', 40, 40);
  doc.fontSize(8.5).fillColor(COLORS.textMuted).font('Helvetica');
  doc.text('AcuStock Cloud Technologies Pvt. Ltd.', 40, 60);
  doc.text('GSTIN / Tax ID: 27AABCA1234F1Z8  |  SAC: 997331', 40, 72);
  doc.text('Plot 42, Tech Park, Baner, Pune, Maharashtra - 411045, India', 40, 84);
  doc.text('Billing Support: billing@acustock.com  |  www.acustock.com', 40, 96);

  // Right Column: Document Type Title & Invoice Number
  doc.fontSize(18).fillColor(COLORS.accent).font('Helvetica-Bold').text('TAX INVOICE', 340, 40, { align: 'right', width: 215 });
  doc.fontSize(10).fillColor(COLORS.textDark).font('Helvetica-Bold').text(invoiceNumber, 340, 62, { align: 'right', width: 215 });

  // Status Stamp / Badge
  const badgeX = 445;
  const badgeY = 82;
  const badgeWidth = 110;
  const badgeHeight = 22;
  const badgeColor = isRefunded ? COLORS.danger : COLORS.success;
  const badgeText = isRefunded ? 'REFUNDED' : 'PAID IN FULL';
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fillColor(`${badgeColor}15`).fill();
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).strokeColor(badgeColor).lineWidth(1).stroke();
  doc.fontSize(8.5).fillColor(badgeColor).font('Helvetica-Bold').text(badgeText, badgeX, badgeY + 6, { align: 'center', width: badgeWidth });

  // Divider
  doc.moveTo(40, 115).lineTo(555, 115).strokeColor(COLORS.border).lineWidth(1).stroke();

  // 2. Metadata Grid
  const afterMetaY = drawMetaGrid(doc, 125, [
    { label: 'Invoice Date', value: formatDate(transaction?.paidAt || transaction?.createdAt) },
    { label: 'Payment Gateway', value: transaction?.gateway || 'DEMO' },
    { label: 'Gateway Ref / ID', value: transaction?.gatewayPaymentId || transaction?.gatewayOrderId || 'COMPLETED' },
    { label: 'Billing Period', value: '30 Days SaaS License' }
  ]);

  // 3. Parties (Seller & Buyer)
  const brand = tenant?.branding || {};
  const addr = brand.address || {};
  const tenantAddress = [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean).join(', ');
  const buyerContact = [brand.supportEmail, transaction?.customerEmail].filter(Boolean)[0] || 'admin@' + (tenant?.slug || 'acustock') + '.com';

  const partyA = {
    title: 'Issued By (Service Provider)',
    name: 'AcuStock Cloud Technologies Pvt. Ltd.',
    contact: 'billing@acustock.com | CIN: U72900PN2026PTC192834',
    address: 'Pune, Maharashtra, India - 411045'
  };

  const partyB = {
    title: 'Billed To (Customer / Tenant Workspace)',
    name: tenant?.name || 'AcuStock Workspace',
    contact: `${buyerContact}${brand.taxId ? ` | GSTIN: ${brand.taxId}` : ''}`,
    address: tenantAddress || `Workspace Domain: ${tenant?.slug || 'default'}.acustock.com`
  };

  const afterPartyY = drawPartySection(doc, afterMetaY, partyA, partyB);

  // 4. Line Items & Tax Calculation
  let baseAmount, taxBreakdown;

  if (currency === 'INR') {
    // 18% GST Breakdown: Inclusive pricing
    baseAmount = Math.round((totalAmount / 1.18) * 100) / 100;
    const totalGst = Math.round((totalAmount - baseAmount) * 100) / 100;
    const cgst = Math.round((totalGst / 2) * 100) / 100;
    const sgst = Math.round((totalGst - cgst) * 100) / 100;

    taxBreakdown = [
      { label: 'CGST (9%)', amount: cgst },
      { label: 'SGST (9%)', amount: sgst }
    ];
  } else {
    baseAmount = totalAmount;
    taxBreakdown = [
      { label: 'Zero-Rated Export / Reverse Charge (0%)', amount: 0 }
    ];
  }

  const columns = [
    { key: 'item', header: 'Subscription Description', width: 225, align: 'left' },
    { key: 'sac', header: 'SAC Code', width: 65, align: 'center' },
    { key: 'qty', header: 'Period', width: 70, align: 'center' },
    { key: 'rate', header: 'Taxable Value', width: 75, align: 'right' },
    { key: 'total', header: 'Total', width: 80, align: 'right' }
  ];

  const planName = planInfo?.name || (transaction?.planId ? transaction.planId.toUpperCase() : 'Starter Plan');
  const rows = [
    {
      item: `AcuStock ${planName} — Cloud ERP Software License`,
      sac: '997331',
      qty: '30 Days',
      rate: formatCurrency(baseAmount, currency),
      total: formatCurrency(totalAmount, currency)
    }
  ];

  const afterTableY = drawTable(doc, afterPartyY, columns, rows);

  // 5. Totals Box
  const afterTotalsY = drawTotals(doc, afterTableY, baseAmount, taxBreakdown, totalAmount, currency);

  // 6. Footer & Legal Footnote
  const termsText = [
    '1. Tax Invoice issued electronically under Rule 46 of the CGST Rules, 2017.',
    '2. Service Accounting Code (SAC): 997331 - Licensing services for computer software and databases.',
    '3. This electronic document is legally valid without a physical signature under the Indian IT Act, 2000.',
    isRefunded ? '4. THIS INVOICE HAS BEEN REFUNDED TO THE ORIGINAL PAYMENT INSTRUMENT.' : '4. Subscription fees settled securely via authorized payment gateway.'
  ].join('\n');

  drawFooter(doc, afterTotalsY, termsText, 'AcuStock Accounts Dept.');

  doc.end();
  return doc;
}

module.exports = {
  formatCurrency,
  formatDate,
  generateSalesOrderInvoicePdf,
  generatePurchaseOrderPdf,
  generateShipmentChallanPdf,
  generateSubscriptionInvoicePdf
};
