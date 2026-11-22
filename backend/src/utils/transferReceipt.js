function invalid(message) {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

function prepareReceipt(lines, entries) {
  const submitted = new Map();
  if (entries !== undefined) {
    if (!Array.isArray(entries)) invalid('Expected an array of received items.');
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') invalid('Invalid receipt line.');
      const id = entry.lineId ?? entry._id;
      const matches = lines.filter(line => id != null
        ? String(line._id) === String(id)
        : String(line.product) === String(entry.product));
      if (matches.length !== 1) invalid('Each receipt must identify a unique transfer line.');
      const key = String(matches[0]._id);
      if (submitted.has(key)) invalid('Duplicate receipt line.');
      submitted.set(key, entry);
    }
  }

  return lines.map(line => {
    const entry = submitted.get(String(line._id));
    const raw = entry?.receivedQuantity;
    const quantity = raw === undefined ? line.quantity : Number(raw);
    if ((raw !== undefined && (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim()))) ||
        !Number.isFinite(quantity) || quantity < 0 || quantity > line.quantity) {
      invalid('Received quantity must be between zero and the shipped quantity.');
    }
    const manifest = line.serialNumbers || [];
    let serials = entry?.receivedSerials;
    if (serials === undefined) {
      if (manifest.length && quantity !== line.quantity && quantity !== 0) {
        invalid('Select the serial numbers actually received.');
      }
      serials = quantity === 0 ? [] : manifest;
    }
    if (!Array.isArray(serials) || (manifest.length && serials.length !== quantity) ||
        new Set(serials).size !== serials.length || serials.some(serial => !manifest.includes(serial))) {
      invalid('Received serials must be unique shipped serials matching the received quantity.');
    }
    return { line, quantity, serials, notes: entry?.discrepancyNotes || entry?.shortageReason || null };
  });
}

module.exports = { prepareReceipt };
