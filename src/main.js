import { createIcons, CalendarDays, ChevronLeft, ChevronRight, Check, X, Settings2, ChartNoAxesColumn, Download, Upload, ArrowUpRight, Plus, RotateCcw, CircleCheck, RefreshCw } from 'lucide';
import { registerSW } from 'virtual:pwa-register';
import { STORAGE_KEY, emptyLedger, localDateKey, parseRate, validateLedger, saveDay, monthSummary } from './ledger.js';
import './style.css';

const icons = { CalendarDays, ChevronLeft, ChevronRight, Check, X, Settings2, ChartNoAxesColumn, Download, Upload, ArrowUpRight, Plus, RotateCcw, CircleCheck, RefreshCw };
const app = document.querySelector('#app');
const today = localDateKey();
let month = today.slice(0, 7);
let view = 'calendar';
let ledger = emptyLedger();
let storageError = '';
let rawBackup = '';
let toastTimer;
let pendingUpdate;

try {
  rawBackup = localStorage.getItem(STORAGE_KEY) || '';
  if (rawBackup) ledger = validateLedger(JSON.parse(rawBackup));
} catch {
  storageError = '本机数据无法读取，原始数据已保留。请先导出原始数据，再恢复备份或重置。';
}

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const icon = (name, className = '') => `<i data-lucide="${name}" class="${className}" aria-hidden="true"></i>`;
const money = (cents) => (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthLabel = () => `${Number(month.slice(0, 4))} 年 ${Number(month.slice(5))} 月`;
const monthRecords = () => Object.entries(ledger.records).filter(([date]) => date.startsWith(`${month}-`)).sort(([first], [second]) => second.localeCompare(first));

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), 3000);
}

function persist(next, recovery = false) {
  if (storageError && !recovery) throw new Error('请先处理数据读取异常，原始数据尚未覆盖');
  const clean = validateLedger(next);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)); }
  catch { throw new Error('保存失败，设备存储不可用或空间不足，请先导出备份'); }
  ledger = clean;
  storageError = '';
}

function monthControl() {
  return `<div class="month-control"><button class="icon-button" data-action="previous" aria-label="上个月" title="上个月">${icon('chevron-left')}</button><label class="month-label"><span>${monthLabel()}</span><input aria-label="选择月份" type="month" id="month-picker" value="${month}" min="1900-01" max="9999-12"></label><button class="icon-button" data-action="next" aria-label="下个月" title="下个月">${icon('chevron-right')}</button></div>`;
}

function summary() {
  const totals = monthSummary(ledger, month);
  return `<section class="summary" aria-label="本月统计"><div class="amount"><span class="eyebrow">${monthLabel()} · 应付托费</span><div class="amount-value"><span>¥</span>${money(totals.total)}</div><span class="subtle">按已记录的出勤日计费</span></div><div class="counts"><div><span class="count-dot present-dot"></span><span>已上托班</span><strong>${totals.present}<small> 天</small></strong></div><div><span class="count-dot absent-dot"></span><span>未上托班</span><strong>${totals.absent}<small> 天</small></strong></div></div></section><div class="rate-strip"><span>新记录单价 <strong>¥${money(ledger.dailyRate)}</strong> / 天</span><button class="text-button" data-action="show-settings" aria-label="修改每日托费">${icon('settings-2')} 修改</button></div>`;
}

function calendar() {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1, 12).getDay();
  const offset = (firstDay + 6) % 7;
  const days = new Date(year, monthNumber, 0).getDate();
  let cells = '<div class="day-spacer" aria-hidden="true"></div>'.repeat(offset);
  for (let day = 1; day <= days; day += 1) {
    const key = `${month}-${String(day).padStart(2, '0')}`;
    const record = ledger.records[key];
    const status = record?.status || 'unknown';
    const label = status === 'present' ? '已上' : status === 'absent' ? '未上' : '未记录';
    const future = key > today;
    cells += `<button class="day ${status} ${key === today ? 'today' : ''} ${future ? 'future' : ''}" data-date="${key}" aria-label="${key} ${label}" ${future ? 'disabled' : ''}><span class="day-number">${day}</span><span class="day-status">${status === 'present' ? icon('check') : status === 'absent' ? icon('x') : key === today ? '<span class="today-label">今天</span>' : '<span class="unknown-dot"></span>'}</span></button>`;
  }
  return `<section class="calendar-section"><div class="section-heading"><h2>出勤日历</h2>${monthControl()}</div><div class="weekdays">${['一', '二', '三', '四', '五', '六', '日'].map((day) => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${cells}</div><div class="calendar-footer"><div class="legend"><span><b class="present-dot"></b>已上</span><span><b class="absent-dot"></b>未上</span><span><b class="unknown-dot"></b>未记录</span></div><button class="text-button" data-action="this-month">回到本月 ${icon('rotate-ccw')}</button></div></section>`;
}

function recordList(limit = Infinity) {
  const records = monthRecords().slice(0, limit);
  if (!records.length) return `<div class="empty-state">${icon('calendar-days')}<h3>这个月还没有记录</h3><p>${month === today.slice(0, 7) ? '今天的托班时光，从这里记下。' : '暂无出勤和费用。'}</p>${month === today.slice(0, 7) ? `<button class="primary-button" data-date="${today}">${icon('plus')} 记录今天</button>` : ''}</div>`;
  return `<div class="record-list">${records.map(([date, record]) => `<button class="record-row" data-date="${date}"><span class="record-icon ${record.status}">${icon(record.status === 'present' ? 'check' : 'x')}</span><span class="record-description"><strong>${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日 <small>星期${'日一二三四五六'[new Date(`${date}T12:00:00`).getDay()]}</small></strong><span>${escapeHTML(record.note || (record.status === 'present' ? '已上托班' : '未上托班'))}</span></span><span class="record-amount ${record.status === 'absent' ? 'muted' : ''}">${record.status === 'present' ? `¥${money(record.rate)}` : '不计费'}</span>${icon('chevron-right')}</button>`).join('')}</div>`;
}

function reports() {
  return `<section class="report-heading"><div><span class="eyebrow">MONTHLY BILL</span><h1>月度账单</h1></div>${monthControl()}</section>${summary()}<section class="records-section"><div class="section-heading"><h2>每日明细 <span class="badge">${monthRecords().length}</span></h2><button class="text-button" data-action="csv">${icon('download')} 导出账单</button></div>${recordList()}</section>`;
}

function settings() {
  return `<section class="page-heading"><span class="eyebrow">PREFERENCES</span><h1>账本设置</h1></section><section class="settings-section"><h2>孩子与托费</h2><form id="settings-form"><label class="field">孩子的小名<input name="childName" maxlength="40" value="${escapeHTML(ledger.childName)}" placeholder="例如：小满" autocomplete="off"></label><label class="field">每日托费（元）<input name="dailyRate" inputmode="decimal" required value="${(ledger.dailyRate / 100).toFixed(2)}"></label><p class="field-note">新单价仅用于之后新建的记录，历史记录保持原价。</p><button class="primary-button" type="submit">${icon('check')} 保存设置</button></form></section><section class="settings-section"><h2>数据与备份</h2><p class="privacy-note">数据仅保存在当前浏览器或主屏幕 App 中，没有云端副本。更换设备、清理网站数据前，请导出备份。</p><div class="backup-actions"><button class="secondary-button" data-action="backup">${icon('download')} 导出备份</button><button class="secondary-button" data-action="import">${icon('upload')} 恢复备份</button></div><input id="import-file" type="file" accept="application/json,.json" hidden><p class="field-note">最近导出：${escapeHTML(readBackupDate())}</p>${storageError ? `<button class="secondary-button" data-action="raw">导出原始数据</button><button class="danger-button" data-action="reset">重置异常数据</button>` : ''}</section><footer class="settings-footer">托班小记 <span>一日一记，成长有迹。</span></footer>`;
}

function readBackupDate() {
  try { return localStorage.getItem(`${STORAGE_KEY}-backup`) || '尚未导出'; } catch { return '无法读取'; }
}

function render() {
  app.innerHTML = `<div class="app-shell"><header class="topbar"><a class="brand" href="#" aria-label="托班小记首页">${icon('calendar-days')}<span>托班小记<small>DAY BY DAY</small></span></a><span class="local-label"><span></span>本机账本</span></header>${storageError ? `<div class="error-banner" role="alert">${escapeHTML(storageError)}<button data-action="show-settings">处理数据</button></div>` : ''}${pendingUpdate ? `<div class="update-banner">新版本已就绪<button data-action="update">更新 ${icon('refresh-cw')}</button></div>` : ''}<main>${view === 'calendar' ? `<section class="page-heading home-heading"><div><span class="eyebrow">${escapeHTML(ledger.childName ? `${ledger.childName}的成长日常` : '孩子的成长日常')}</span><h1>小小日常，<br class="mobile-break">认真记下<span class="heading-period">。</span></h1></div><button class="primary-button today-button" data-date="${today}">${icon('plus')} 记录今天</button></section>${summary()}${calendar()}<section class="records-section"><div class="section-heading"><h2>最近记录</h2><button class="text-button" data-action="show-reports">月度账单 ${icon('arrow-up-right')}</button></div>${recordList(4)}</section>` : view === 'reports' ? reports() : settings()}</main><nav class="bottom-nav" aria-label="主导航">${[['calendar', 'calendar-days', '日历'], ['reports', 'chart-no-axes-column', '账单'], ['settings', 'settings-2', '设置']].map(([key, symbol, label]) => `<button data-view="${key}" class="${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></button>`).join('')}</nav></div><dialog id="day-dialog" aria-labelledby="day-title"></dialog>`;
  createIcons({ icons });
}

function openDay(key) {
  if (key > today || storageError) { if (storageError) toast('请先在设置中处理数据异常'); return; }
  const record = ledger.records[key];
  const dialog = document.querySelector('#day-dialog');
  dialog.innerHTML = `<form id="day-form" data-key="${key}"><div class="dialog-heading"><div><span class="eyebrow">每日出勤</span><h2 id="day-title">${Number(key.slice(5, 7))} 月 ${Number(key.slice(8))} 日 <small>星期${'日一二三四五六'[new Date(`${key}T12:00:00`).getDay()]}</small></h2></div><button class="icon-button" type="button" data-action="close-dialog" aria-label="关闭" title="关闭">${icon('x')}</button></div><fieldset class="status-options"><legend>出勤状态</legend><label><input type="radio" name="status" value="present" ${record?.status !== 'absent' ? 'checked' : ''}><span>${icon('check')} 已上托班</span></label><label><input type="radio" name="status" value="absent" ${record?.status === 'absent' ? 'checked' : ''}><span>${icon('x')} 未上托班</span></label></fieldset><label class="field" id="rate-field">当天托费（元）<input name="rate" inputmode="decimal" required value="${((record?.rate ?? ledger.dailyRate) / 100).toFixed(2)}"></label><label class="field">备注 <span class="optional">选填</span><textarea name="note" rows="2" maxlength="200" placeholder="例如：请假、身体不舒服">${escapeHTML(record?.note || '')}</textarea></label><p class="form-error" role="alert"></p><div class="dialog-actions">${record ? `<button class="text-button danger" type="button" data-action="clear-day" data-key="${key}">${icon('rotate-ccw')} 清除记录</button>` : '<span></span>'}<button class="primary-button" type="submit">${icon('check')} 保存记录</button></div></form>`;
  createIcons({ icons });
  dialog.showModal();
  syncRateField();
}

function syncRateField() {
  const form = document.querySelector('#day-form');
  if (!form) return;
  const absent = new FormData(form).get('status') === 'absent';
  form.elements.rate.disabled = absent;
  document.querySelector('#rate-field').classList.toggle('disabled', absent);
}

function changeMonth(offset) {
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(year, monthNumber - 1 + offset, 1, 12);
  if (next.getFullYear() < 1900 || next.getFullYear() > 9999) return;
  month = localDateKey(next).slice(0, 7);
  render();
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const text = String(value);
  return `"${(/^[=+\-@\t\r\n]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
}

app.addEventListener('click', async (event) => {
  const target = event.target.closest('button, a.brand');
  if (!target) return;
  if (target.matches('a.brand')) { event.preventDefault(); view = 'calendar'; render(); return; }
  if (target.dataset.view) { view = target.dataset.view; render(); window.scrollTo(0, 0); return; }
  if (target.dataset.date) { openDay(target.dataset.date); return; }
  try {
    switch (target.dataset.action) {
      case 'previous': changeMonth(-1); break;
      case 'next': changeMonth(1); break;
      case 'this-month': month = today.slice(0, 7); render(); break;
      case 'show-reports': view = 'reports'; render(); break;
      case 'show-settings': view = 'settings'; render(); break;
      case 'close-dialog': document.querySelector('#day-dialog').close(); break;
      case 'clear-day': persist(saveDay(ledger, target.dataset.key, 'unknown', 0)); document.querySelector('#day-dialog').close(); render(); toast('已恢复为未记录'); break;
      case 'backup':
        if (storageError) throw new Error('当前数据异常，请使用“导出原始数据”');
        download(JSON.stringify(ledger, null, 2), `托班小记-备份-${today}.json`, 'application/json');
        try { localStorage.setItem(`${STORAGE_KEY}-backup`, new Date().toLocaleString('zh-CN')); } catch {}
        render(); toast('备份已导出'); break;
      case 'raw': download(rawBackup, `托班小记-原始数据-${today}.json`, 'application/json'); break;
      case 'reset': if (confirm('确认清空异常数据？请先导出原始数据，重置后无法撤销。')) { persist(emptyLedger(), true); render(); toast('已重置'); } break;
      case 'import': document.querySelector('#import-file').click(); break;
      case 'csv': {
        const totals = monthSummary(ledger, month);
        const rows = [['日期', '状态', '费用（元）', '备注'], ...monthRecords().reverse().map(([date, record]) => [date, record.status === 'present' ? '已上' : '未上', record.status === 'present' ? (record.rate / 100).toFixed(2) : '0.00', record.note]), ['合计', `${totals.present} 天出勤`, (totals.total / 100).toFixed(2), '']];
        download('\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), `托班账单-${month}.csv`, 'text/csv;charset=utf-8'); break;
      }
      case 'update': pendingUpdate?.(true); break;
    }
  } catch (error) { toast(error.message); }
});

app.addEventListener('change', async (event) => {
  if (event.target.id === 'month-picker') {
    if (/^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(event.target.value)) { month = event.target.value; render(); }
  }
  if (event.target.name === 'status') syncRateField();
  if (event.target.id === 'import-file') {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('备份文件不能超过 5 MB');
      const imported = validateLedger(JSON.parse(await file.text()));
      if (!confirm(`恢复后将替换当前全部记录（备份包含 ${Object.keys(imported.records).length} 条）。是否继续？`)) return;
      persist(imported, true); render(); toast('备份已恢复');
    } catch (error) { toast(error instanceof SyntaxError ? '文件不是有效的 JSON 备份' : error.message); }
    finally { event.target.value = ''; }
  }
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  try {
    if (form.id === 'day-form') {
      const status = data.get('status');
      const rate = status === 'absent' ? (ledger.records[form.dataset.key]?.rate ?? ledger.dailyRate) : parseRate(data.get('rate'));
      persist(saveDay(ledger, form.dataset.key, status, rate, data.get('note')));
      document.querySelector('#day-dialog').close();
      render(); toast('这一天，记好了');
    } else if (form.id === 'settings-form') {
      persist({ ...ledger, childName: data.get('childName').trim(), dailyRate: parseRate(data.get('dailyRate')) });
      render(); toast('设置已保存');
    }
  } catch (error) {
    const inline = form.querySelector('.form-error');
    if (inline) inline.textContent = error.message;
    else toast(error.message);
  }
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  try {
    ledger = event.newValue ? validateLedger(JSON.parse(event.newValue)) : emptyLedger();
    storageError = '';
  } catch { rawBackup = event.newValue || ''; storageError = '其他窗口写入的数据无法读取，请在设置中处理。'; }
  render(); toast('账本已与其他窗口同步');
});

render();
const updateSW = registerSW({
  onNeedRefresh() { pendingUpdate = updateSW; render(); },
  onOfflineReady() { toast('离线账本已就绪'); },
  onRegisterError() { toast('离线缓存暂不可用，请保持联网'); },
});