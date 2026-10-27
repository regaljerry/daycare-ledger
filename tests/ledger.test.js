import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, parseRate, saveDay, monthSummary, validateLedger, validDateKey } from '../src/ledger.js';

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