'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');

test('Invoice GST breakdown and total match the values charged by order pricing', function () {
  const items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 },
    { id: 2, name: 'Tea', hsn: '0902', price: 140, qty: 1 }
  ];
  const charged = pricing.computeTotals(items, 'SAVE10');
  const invoiceFigures = invoice.computeInvoiceFigures({ items: items, coupon: 'SAVE10' });

  assert.equal(invoiceFigures.subtotal, charged.subtotal);
  assert.equal(invoiceFigures.discount, charged.discount);
  assert.equal(invoiceFigures.tax, charged.tax);
  assert.equal(invoiceFigures.cgst, charged.cgst);
  assert.equal(invoiceFigures.sgst, charged.sgst);
  assert.equal(invoiceFigures.total, charged.total);
  assert.deepEqual(invoiceFigures.rows.map(function (row) { return row.lineTax; }), [28.8, 22.68]);
});

test('CURRENT BEHAVIOUR: pricing applies HSN rates and discounts before GST', function () {
  const items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 },
    { id: 2, name: 'Tea', hsn: '0902', price: 140, qty: 1 }
  ];

  assert.deepEqual(pricing.computeTotals(items, 'SAVE10'), {
    subtotal: 780,
    discount: 78,
    taxable: 702,
    tax: 51.48,
    cgst: 25.74,
    sgst: 25.74,
    total: 753.48,
    lines: [
      { id: 1, name: 'Rice', hsn: '1006', gstPercent: 5, gross: 640, discount: 64, taxable: 576, tax: 28.8, net: 604.8 },
      { id: 2, name: 'Tea', hsn: '0902', gstPercent: 18, gross: 140, discount: 14, taxable: 126, tax: 22.68, net: 148.68 }
    ]
  });
});

test('invoice uses the same HSN GST rates and coupon discount as order pricing', function () {
  const order = {
    id: 1,
    coupon: 'SAVE10',
    items: [
      { id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 },
      { id: 2, name: 'Tea', hsn: '0902', price: 140, qty: 1 }
    ]
  };

  assert.deepEqual(invoice.computeInvoiceFigures(order), {
    subtotal: 780,
    discount: 78,
    tax: 51.48,
    cgst: 25.74,
    sgst: 25.74,
    total: 753.48,
    rows: [
      { name: 'Rice', sku: '-', hsn: '1006', qty: 1, price: 640, gstPercent: 5, line: 640, lineTax: 28.8 },
      { name: 'Tea', sku: '-', hsn: '0902', qty: 1, price: 140, gstPercent: 18, line: 140, lineTax: 22.68 }
    ]
  });
});

test('invoice and ledger reconciliation reports matching totals and GST', function () {
  const items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 },
    { id: 2, name: 'Tea', hsn: '0902', price: 140, qty: 1 }
  ];
  const ledger = pricing.computeTotals(items, 'SAVE10');
  const db = {
    orders: [{
      id: 1,
      date: '01/01/2025',
      customer: 'Example customer',
      coupon: 'SAVE10',
      status: 'completed',
      items,
      subtotal: ledger.subtotal,
      discount: ledger.discount,
      tax: ledger.tax,
      total: ledger.total
    }]
  };

  const reconciliation = reports.getGstReconciliation(db);
  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.totalDelta, 0);
  assert.deepEqual(reconciliation.rows[0], {
    orderId: 1,
    date: '01/01/2025',
    customer: 'Example customer',
    coupon: 'SAVE10',
    ledgerSubtotal: 780,
    ledgerDiscount: 78,
    ledgerTax: 51.48,
    ledgerTotal: 753.48,
    invoiceDiscount: 78,
    invoiceTax: 51.48,
    invoiceTotal: 753.48,
    delta: 0,
    matched: true
  });
});
