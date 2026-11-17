import { expect, test } from '@playwright/test';

const FORBIDDEN_VITAL_KEYS = new Set([
  'hrbpm',
  'skintempc',
  'exertionindex',
  'hr0',
  'tc0',
  'hrmaxestimated',
  'tcproxyc',
  'psi',
  'latestframe',
]);

function findForbiddenKeys(value: unknown, currentPath = '$'): string[] {
  const leaks: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, idx) => {
      leaks.push(...findForbiddenKeys(item, `${currentPath}[${idx}]`));
    });
  } else if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = `${currentPath}.${key}`;
      if (FORBIDDEN_VITAL_KEYS.has(key.toLowerCase())) {
        leaks.push(nextPath);
      }
      leaks.push(...findForbiddenKeys(nested, nextPath));
    }
  }
  return leaks;
}

test.describe('Supervisor Role Access Control & API Privacy Enforcement', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post('/api/system/reset', { data: { scenario: 'default' } });
    expect(res.ok()).toBeTruthy();
  });

  test('intercepts ALL /api/* responses and DOM on /supervisor to fail loudly if any raw vitals field leaks', async ({
    page,
  }) => {
    const inspectedPayloads: Array<{ url: string; leaks: string[] }> = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/api/')) return;
      const contentType = response.headers()['content-type'] ?? '';
      if (!contentType.includes('application/json')) return;
      const body = await response.json();
      const leaks = findForbiddenKeys(body);
      inspectedPayloads.push({ url, leaks });
    });

    await page.goto('/supervisor');
    await expect(page.getByRole('heading', { name: /Supervisor Crew Grid/i })).toBeVisible();
    await expect(page.getByText(/Active Crew Status \(6 Monitored Units\)/)).toBeVisible();

    // Exercise supervisor controls to verify post-action API payloads also strip raw vitals
    const breakResp = page.waitForResponse(
      (r) => r.url().includes('/api/supervisor/action') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Order 15m Break' }).first().click();
    await breakResp;

    const refreshResp = page.waitForResponse((r) => r.url().includes('/api/supervisor/crew'));
    await page.getByRole('button', { name: 'Refresh Crew' }).click();
    await refreshResp;

    expect(inspectedPayloads.length).toBeGreaterThanOrEqual(3);
    for (const entry of inspectedPayloads) {
      expect(entry.leaks, `Privacy leak detected in API payload ${entry.url}`).toEqual([]);
    }

    // Verify rendered DOM on /supervisor never renders raw HR, skin temp, exertion, or raw PSI scores
    const mainText = await page.locator('main').innerText();
    expect(mainText).not.toMatch(/\b\d+\s*bpm\b/i);
    expect(mainText).not.toMatch(/\bHR0\b|\bHRmax\b|\bTc proxy\b|\bBorg\b/i);
    expect(mainText).not.toMatch(/\bPSI\s*\d/i);
    expect(mainText).toContain('RED');
    expect(mainText).toContain('AMBER');
    expect(mainText).toContain('GREEN');
  });

  test('direct call to worker-vitals API endpoint with supervisor-role token returns 403 and redacted payload', async ({
    request,
  }) => {
    // Control check: worker session receives physiological state
    const workerRes = await request.get('/api/worker/W-101/state');
    expect(workerRes.status()).toBe(200);
    const workerBody = await workerRes.json();
    expect(workerBody.state.latestFrame.hrBpm).toBeGreaterThan(0);

    // Governance enforcement check 1: X-SiteGuard-Role: supervisor header
    const supHeaderRes = await request.get('/api/worker/W-101/state', {
      headers: { 'X-SiteGuard-Role': 'supervisor' },
    });
    expect(supHeaderRes.status()).toBe(403);
    const supHeaderJson = await supHeaderRes.json();
    expect(supHeaderJson.redacted).toBe(true);
    expect(findForbiddenKeys(supHeaderJson)).toEqual([]);

    // Governance enforcement check 2: Authorization: Bearer supervisor-... token
    const supBearerRes = await request.get('/api/worker/W-101/state', {
      headers: { Authorization: 'Bearer supervisor-role-session-token' },
    });
    expect(supBearerRes.status()).toBe(403);
    const supBearerJson = await supBearerRes.json();
    expect(supBearerJson.redacted).toBe(true);
    expect(findForbiddenKeys(supBearerJson)).toEqual([]);
  });
});
