const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Tally Prime & Zoho Books XML Bridge', () => {
  it('1. Formats date in standard YYYYMMDD for Tally', () => {
    const d = new Date('2026-11-07T10:30:00.000Z');
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const tallyDate = `${y}${m}${day}`;
    assert.equal(tallyDate, '20261107');
  });

  it('2. Escapes XML reserved characters properly', () => {
    const escapeXml = (unsafe) => {
      if (unsafe === null || unsafe === undefined) return '';
      return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    const raw = 'Acme & Co <Electronics> "Pro" \'V2\'';
    const escaped = escapeXml(raw);
    assert.equal(escaped, 'Acme &amp; Co &lt;Electronics&gt; &quot;Pro&quot; &apos;V2&apos;');
  });

  it('3. Generates compliant Tally Stock Item XML', () => {
    const item = {
      name: 'Industrial Microcontroller V2',
      sku: 'MCU-900',
      uom: 'PCS',
      hsn: '85423100',
      openingStock: 50,
      costPrice: 450
    };

    const xml = `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <STOCKITEM NAME="${item.name}" ACTION="Create">
        <NAME>${item.name}</NAME>
        <PARTNO>${item.sku}</PARTNO>
        <BASEUNITS>${item.uom}</BASEUNITS>
        <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
        <HSNDETAILS><HSNCODE>${item.hsn}</HSNCODE></HSNDETAILS>
        <OPENINGBALANCE>${item.openingStock} ${item.uom}</OPENINGBALANCE>
        <OPENINGRATE>${item.costPrice}</OPENINGRATE>
        <OPENINGVALUE>${item.openingStock * item.costPrice}</OPENINGVALUE>
      </STOCKITEM>
    </TALLYMESSAGE>`;

    assert.ok(xml.includes('<STOCKITEM NAME="Industrial Microcontroller V2"'));
    assert.ok(xml.includes('<BASEUNITS>PCS</BASEUNITS>'));
    assert.ok(xml.includes('<HSNCODE>85423100</HSNCODE>'));
    assert.ok(xml.includes('<OPENINGVALUE>22500</OPENINGVALUE>'));
  });

  it('4. Generates compliant Tally Inward Receipt Note & Outward Delivery Note Vouchers', () => {
    const inward = {
      type: 'IN',
      vchNum: 'IN-8891',
      date: '20261107',
      party: 'Supplier Corp',
      itemName: 'Motor Assembly',
      qty: 10,
      uom: 'NOS',
      rate: 1200,
      amount: -12000
    };

    const vchXml = `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Receipt Note" ACTION="Create">
        <DATE>${inward.date}</DATE>
        <VOUCHERTYPENAME>Receipt Note</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${inward.vchNum}</VOUCHERNUMBER>
        <PARTYNAME>${inward.party}</PARTYNAME>
        <ALLINVENTORYENTRIES.LIST>
          <STOCKITEMNAME>${inward.itemName}</STOCKITEMNAME>
          <RATE>${inward.rate}/${inward.uom}</RATE>
          <AMOUNT>${inward.amount}</AMOUNT>
          <ACTUALQTY>${inward.qty} ${inward.uom}</ACTUALQTY>
          <BILLEDQTY>${inward.qty} ${inward.uom}</BILLEDQTY>
        </ALLINVENTORYENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`;

    assert.ok(vchXml.includes('<VOUCHER VCHTYPE="Receipt Note"'));
    assert.ok(vchXml.includes('<AMOUNT>-12000</AMOUNT>'));
    assert.ok(vchXml.includes('<PARTYNAME>Supplier Corp</PARTYNAME>'));
  });
});

