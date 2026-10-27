export const STORAGE_KEY = 'daycare-ledger-v1';

export function emptyLedger() {
  return { version: 1, childName: '', dailyRate: 10000, records: {} };
}

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(`${key}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDateKey(date) === key;
}

export function parseRate(value) {
  const text = String(value).trim();
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) throw new Error('请输入 0 到 999999.99 之间的金额，最多两位小数');
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function validateLedger(data) {
  if (!data || data.version !== 1 || typeof data.childName !== 'string' || data.childName.length > 40 ||
    !Number.isSafeInteger(data.dailyRate) || data.dailyRate < 0 || data.dailyRate > 99999999 ||
    !data.records || typeof data.records !== 'object' || Array.isArray(data.records)) {
    throw new Error('备份格式不正确，未导入任何数据');
  }
  const clean = emptyLedger();
  clean.childName = data.childName;
  clean.dailyRate = data.dailyRate;
  for (const [key, record] of Object.entries(data.records)) {
    if (!validDateKey(key) || !record || !['present', 'absent'].includes(record.status) ||
      !Number.isSafeInteger(record.rate) || record.rate < 0 || record.rate > 99999999 ||
      typeof record.note !== 'string' || record.note.length > 200) {
      throw new Error('备份内的考勤记录不正确，未导入任何数据');
    }
    clean.records[key] = { status: record.status, rate: record.rate, note: record.note };
  }
  return clean;
}

export function saveDay(ledger, key, status, rate, note = '') {
  if (!validDateKey(key)) throw new Error('日期不正确');
  const records = { ...ledger.records };
  if (status === 'unknown') delete records[key];
  else records[key] = { status, rate, note: note.trim() };
  return validateLedger({ ...ledger, records });
}

export function monthSummary(ledger, month) {
  return summarizeRecords(Object.entries(ledger.records).filter(([date]) => date.startsWith(`${month}-`)));
}

export function rangeRecords(ledger, start, end) {
  if (!validDateKey(start) || !validDateKey(end)) throw new Error('请选择有效的开始日期和结束日期');
  if (start > end) throw new Error('开始日期不能晚于结束日期');
  return Object.entries(ledger.records)
    .filter(([date]) => date >= start && date <= end)
    .sort(([first], [second]) => second.localeCompare(first));
}

export function rangeSummary(ledger, start, end) {
  return summarizeRecords(rangeRecords(ledger, start, end));
}

function summarizeRecords(records) {
  return records.reduce((summary, [, record]) => {
    if (record.status === 'present') {
      summary.present += 1;
      summary.total += record.rate;
    } else summary.absent += 1;
    return summary;
  }, { present: 0, absent: 0, total: 0 });
}