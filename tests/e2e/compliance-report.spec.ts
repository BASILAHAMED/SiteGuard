import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test.describe('UAE Midday Break Compliance Report', () => {
  test('Amber/Red shift events produce accurate 12:30-15:00 break compliance export JSON and print trigger', async ({
    page,
    request,
  }) => {
    const resetRes = await request.post('/api/system/reset', { data: { scenario: 'default' } });
    expect(resetRes.ok()).toBeTruthy();

    await page.addInitScript(() => {
      (window as unknown as { __printCalls?: number }).__printCalls = 0;
      window.print = () => {
        (window as unknown as { __printCalls?: number }).__printCalls =
          ((window as unknown as { __printCalls?: number }).__printCalls ?? 0) + 1;
      };
    });

    await page.goto('/compliance');
    await expect(
      page.getByRole('heading', { name: 'UAE Midday Working Break Compliance Report' })
    ).toBeVisible();
    await expect(page.getByText('12:30–15:00 GST').first()).toBeVisible();
    await expect(page.getByRole('status')).toContainText(/pending required break completion/i);

    // Export Regulator JSON and verify structured contents + zero raw vitals
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Regulator JSON' }).click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const exported = JSON.parse(fs.readFileSync(downloadPath!, 'utf-8'));

    expect(exported.regulationReference).toContain('12:30–15:00 GST');
    expect(exported.compliantPct).toBeLessThan(100);
    expect(exported.breaks.length).toBe(6);
    expect(exported.incidents.length).toBeGreaterThan(0);
    expect(JSON.stringify(exported)).not.toContain('hrBpm');
    expect(JSON.stringify(exported)).not.toContain('skinTempC');

    // Export PDF button triggers browser print sheet
    await page.getByRole('button', { name: 'Export PDF' }).click();
    const printCalls = await page.evaluate(
      () => (window as unknown as { __printCalls?: number }).__printCalls ?? 0
    );
    expect(printCalls).toBe(1);
  });

  test('zero-violation shift produces an explicit full-compliance report rather than an empty/broken view', async ({
    page,
    request,
  }) => {
    const resetRes = await request.post('/api/system/reset', {
      data: { scenario: 'zero_violations' },
    });
    expect(resetRes.ok()).toBeTruthy();

    await page.goto('/compliance');
    await expect(page.getByText('100%').first()).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      /Full Compliance Achieved: 100% of 6 monitored crew members met the UAE Midday Working Break requirement with 0 heat-safety violations/i
    );
    await expect(
      page.getByText(
        /Zero heat-stress escalations or sensor violations logged for this shift — full compliance recorded/i
      )
    ).toBeVisible();
  });
});
