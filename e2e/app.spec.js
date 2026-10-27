import { test, expect } from '@playwright/test';

const key = 'daycare-ledger-v1';
const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

async function setRate(page, rate) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('textbox', { name: '每日托费（元）' }).fill(rate);
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.getByRole('button', { name: '日历', exact: true }).click();
}

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('record attendance, preserve historical rate, mark absent and clear', async ({ page }) => {
  await setRate(page, '88.50');
  await page.getByRole('button', { name: '记录今天' }).first().click();
  await page.getByRole('textbox', { name: '备注' }).fill('全天托班');
  await page.getByRole('button', { name: '保存记录' }).click();
  await expect(page.locator('.amount-value')).toContainText('88.50');
  await page.reload();
  await expect(page.locator('.amount-value')).toContainText('88.50');
  await setRate(page, '120');
  await expect(page.locator('.amount-value')).toContainText('88.50');
  await page.getByRole('button', { name: `${date} 已上`, exact: true }).click();
  await page.getByRole('radio', { name: '未上托班' }).check();
  await expect(page.getByRole('textbox', { name: '当天托费（元）' })).toBeDisabled();
  await page.getByRole('button', { name: '保存记录' }).click();
  await expect(page.locator('.amount-value')).toContainText('0.00');
  await page.getByRole('button', { name: `${date} 未上`, exact: true }).click();
  await page.getByRole('button', { name: '清除记录' }).click();
  await expect(page.getByRole('button', { name: `${date} 未记录`, exact: true })).toBeVisible();
});

test('month navigation and viewport remain usable', async ({ page }) => {
  const original = await page.locator('#month-picker').inputValue();
  await page.getByRole('button', { name: '上个月' }).click();
  await expect(page.locator('#month-picker')).not.toHaveValue(original);
  await page.getByRole('button', { name: '回到本月' }).click();
  await expect(page.locator('#month-picker')).toHaveValue(original);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const buttons = await page.locator('.day').evaluateAll((elements) => elements.map((element) => { const bounds = element.getBoundingClientRect(); return { width: bounds.width, height: bounds.height }; }));
    expect(buttons.every((bounds) => bounds.width >= 32 && bounds.height >= 44)).toBe(true);
  }
});

test('backup import validates before replacing and exports downloadable files', async ({ page }) => {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const imported = { version: 1, childName: '小满', dailyRate: 9999, records: { [date]: { status: 'present', rate: 7654, note: '=SUM(A1)' } } };
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByRole('textbox', { name: '孩子的小名' })).toHaveValue('小满');
  await page.locator('#import-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1}') });
  await expect(page.getByRole('status')).toContainText('备份格式不正确');
  expect(await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)).childName, key)).toBe('小满');
  const backup = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  expect((await backup).suggestedFilename()).toContain('.json');
  await page.getByRole('button', { name: '账单', exact: true }).click();
  await expect(page.locator('.amount-value')).toContainText('76.54');
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出账单' }).click();
  expect((await csv).suggestedFilename()).toContain('.csv');
});

test('offline reload retains ledger and core interface', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit service workers are not supported');
  await page.getByRole('button', { name: '记录今天' }).first().click();
  await page.getByRole('button', { name: '保存记录' }).click();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.amount-value')).toContainText('100.00');
  await expect(page.getByRole('button', { name: `${date} 已上`, exact: true })).toBeVisible();
});

test('corrupt local data is not silently overwritten', async ({ page }) => {
  await page.evaluate((storageKey) => localStorage.setItem(storageKey, '{broken'), key);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('原始数据已保留');
  await page.getByRole('button', { name: '记录今天' }).first().click();
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe('{broken');
  await expect(page.locator('#day-dialog')).not.toBeVisible();
});

test('custom billing periods filter inclusive dates, export matching totals and preserve monthly bills', async ({ page }) => {
  await page.evaluate(({ storageKey, currentDate }) => localStorage.setItem(storageKey, JSON.stringify({
    version: 1, childName: '', dailyRate: 20000,
    records: {
      '2025-12-30': { status: 'present', rate: 9999, note: 'outside-before' },
      '2025-12-31': { status: 'present', rate: 10001, note: 'start-boundary' },
      '2026-01-01': { status: 'absent', rate: 10001, note: 'absent' },
      '2026-01-02': { status: 'present', rate: 12550, note: 'end-boundary' },
      '2026-01-03': { status: 'present', rate: 9999, note: 'outside-after' },
      [currentDate]: { status: 'present', rate: 6543, note: 'current-month' },
    },
  })), { storageKey: key, currentDate: date });
  await page.reload();
  await page.getByRole('button', { name: '账单', exact: true }).click();
  await expect(page.locator('.amount-value')).toContainText('65.43');
  await page.getByRole('button', { name: '自定义周期', exact: true }).click();
  await page.getByLabel('开始日期').fill('2025-12-31');
  await page.getByLabel('结束日期').fill('2026-01-02');
  await page.getByRole('button', { name: '统计', exact: true }).click();
  await expect(page.locator('.amount-value')).toContainText('225.51');
  await expect(page.locator('.record-row')).toHaveCount(3);
  await expect(page.locator('.counts')).toContainText('2 天');
  await expect(page.locator('.counts')).toContainText('1 天');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出账单' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toContain('2025-12-31_2026-01-02.csv');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('2025-12-31 至 2026-01-02');
  expect(csv).toContain('225.51');
  expect(csv).toContain('start-boundary');
  expect(csv).toContain('end-boundary');
  expect(csv).not.toContain('outside-before');
  expect(csv).not.toContain('outside-after');
  await page.getByLabel('开始日期').fill('2026-01-02');
  await page.getByRole('button', { name: '统计', exact: true }).click();
  await expect(page.locator('.amount-value')).toContainText('125.50');
  await expect(page.locator('.record-row')).toHaveCount(1);
  await page.getByLabel('开始日期').fill('2026-02-01');
  await page.getByLabel('结束日期').fill('2026-02-28');
  await page.getByRole('button', { name: '统计', exact: true }).click();
  await expect(page.locator('.amount-value')).toContainText('0.00');
  await expect(page.getByRole('heading', { name: '这个周期还没有记录' })).toBeVisible();
  await page.getByLabel('开始日期').fill('2026-03-01');
  await page.getByRole('button', { name: '统计', exact: true }).click();
  await expect(page.locator('#range-form [role="alert"]')).toContainText('开始日期不能晚于结束日期');
  await page.getByRole('button', { name: '按月统计', exact: true }).click();
  await expect(page.locator('.amount-value')).toContainText('65.43');
  await expect(page.getByRole('heading', { name: '月度账单' })).toBeVisible();
  await page.getByRole('button', { name: '自定义周期', exact: true }).click();
  await expect(page.getByLabel('开始日期')).toHaveValue('2026-02-01');
  await expect(page.getByLabel('结束日期')).toHaveValue('2026-02-28');
});