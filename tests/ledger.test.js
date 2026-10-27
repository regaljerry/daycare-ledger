import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, parseRate, saveDay, monthSummary, rangeRecords, rangeSummary, validateLedger, validDateKey } from '../src/ledger.js';

test('only present days are charged and other months are excluded', () => {
  let ledger = emptyLedger();
  ledger = saveDay(ledger, '2026-10-01', 'present', 12550);
  ledger = saveDay(ledger, '2026-10-02', 'absent', 12550);
  ledger = saveDay(ledger, '2026-11-01', 'present', 12550);
  assert.deepEqual(monthSummary(ledger, '2026-10'), { present: 1, absent: 1, total: 12550 });
});

test('changing the default rate preserves historical charges', () => {
  const ledger = saveDay(emptyLedger(), '2026-10-01', 'present', 10000);
  ledger.dailyRate = 15000;
  assert.equal(monthSummary(ledger, '2026-10').total, 10000);
  const reset = saveDay(ledger, '2026-10-01', 'unknown', 0);
  assert.deepEqual(monthSummary(reset, '2026-10'), { present: 0, absent: 0, total: 0 });
});

test('currency is parsed to integer cents without floating point drift', () => {
  assert.equal(parseRate('99.99'), 9999);
  assert.equal(parseRate('0.01'), 1);
  assert.equal(parseRate('0'), 0);
  for (const value of ['-1', '1.001', '', '1e3', '1000000']) assert.throws(() => parseRate(value));
});

test('backup validation rejects impossible dates and invalid records', () => {
  assert.equal(validDateKey('2026-02-29'), false);
  assert.equal(validDateKey('2028-02-29'), true);
  assert.deepEqual(validateLedger(JSON.parse(JSON.stringify(emptyLedger()))), emptyLedger());
  assert.throws(() => validateLedger({ ...emptyLedger(), records: { '2026-02-30': { status: 'present', rate: 1, note: '' } } }));
  assert.throws(() => saveDay(emptyLedger(), '2026-10-01', 'invalid', 100));
  assert.throws(() => saveDay(emptyLedger(), '2026-10-01', 'present', -1));
});

test('custom periods include both endpoints across months and years with historical prices', () => {
  let ledger = emptyLedger();
  ledger = saveDay(ledger, '2025-12-30', 'present', 9999);
  ledger = saveDay(ledger, '2025-12-31', 'present', 10001);
  ledger = saveDay(ledger, '2026-01-01', 'absent', 10001);
  ledger = saveDay(ledger, '2026-01-02', 'present', 12550);
  ledger = saveDay(ledger, '2026-01-03', 'present', 9999);
  ledger.dailyRate = 20000;
  assert.deepEqual(rangeSummary(ledger, '2025-12-31', '2026-01-02'), { present: 2, absent: 1, total: 22551 });
  assert.deepEqual(rangeRecords(ledger, '2025-12-31', '2026-01-02').map(([date]) => date), ['2026-01-02', '2026-01-01', '2025-12-31']);
  assert.deepEqual(rangeSummary(ledger, '2026-01-02', '2026-01-02'), { present: 1, absent: 0, total: 12550 });
  assert.deepEqual(rangeSummary(ledger, '2026-02-01', '2026-02-28'), { present: 0, absent: 0, total: 0 });
});

test('custom periods reject missing, impossible and reversed dates', () => {
  for (const [start, end] of [['', '2026-01-02'], ['2026-01-01', ''], ['2026-02-30', '2026-03-01'], ['2026-01-02', '2026-01-01']]) {
    assert.throws(() => rangeSummary(emptyLedger(), start, end));
    assert.throws(() => rangeRecords(emptyLedger(), start, end));
  }
});