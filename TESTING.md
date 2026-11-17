# SiteGuard Testing & Verification Guide

## Quick Start (One Command)

Run TypeScript verification, Vitest unit suites, and the full headless Chromium Playwright E2E suite in a single command:

```bash
npm test
```

Individual targets:

- `npm run lint` — TypeScript check (`tsc --noEmit`) across application, server, and test suites.
- `npm run test:unit` — Deterministic Vitest unit suites (`tests/unit/*.spec.ts`).
- `npm run test:e2e` — Full Chromium Playwright E2E suite (`tests/e2e/*.spec.ts`) + demo sanity screenshot gallery in `test-results/demo-gallery/`.

> Note: When running Playwright locally while `npm run dev` is already serving on port `3000`, `playwright.config.ts` automatically reuses the live server (`reuseExistingServer: !process.env.CI`). Setting `CI=true` or running without an active dev server starts a clean server instance automatically.

---

## Test Coverage Matrix

| Area | Spec File | Key Assertions |
| --- | --- | --- |
| **Risk Engine & PSI Math** | `tests/unit/risk-engine.unit.spec.ts` | Moran et al. (1998) PSI pairs across Green/Amber/Red; exact cutoff boundaries (`3.0`, `3.99`, `4.0`, `6.0`, `6.99`, `7.0`); null/corrupted input env-only fallback. |
| **Predictive Forecast & LLM Safety Boundary** | `tests/unit/predictive-forecast.unit.spec.ts` | Hand-computed damped trend trajectories across 5 shapes (flat, rising, falling, noisy/wide CI, tier-crossing); cold-start & post-fault `<4` clean-sample `insufficient_trend_data` refusal; `@google/genai` prompt audit enforcing zero LLM-invented forecast numbers; timeout/outage fallback preserving deterministic `ForecastOutput`. |
| **Backtest & Prospective Determinism** | `tests/unit/validation-backtest.spec.ts` | Static fixture cohort replay reproducibility; realistic sensitivity (`<100%`) and false-alarm rate (`>0%`) bounds; seed `202608` prospective MAE/RMSE determinism with future-leakage guards (`MAE > 0.08`, `t+30m MAE > t+15m MAE`). |
| **Worker Flow & Check-Ins** | `tests/e2e/worker-flow.spec.ts` | `/worker` Green baseline; dragging HR/skin-temp/exertion sliders into Amber & Red; rendered localized scripts across हिन्दी, اردو (`dir="rtl"`), and Tagalog; `"I'm Okay"` / `"Need Help"` check-in feedback propagated to `/supervisor`. |
| **Fault Injection & Graceful Degradation** | `tests/e2e/fault-injection.spec.ts` | BLE disconnect, battery `<10%`, sensor noise -> `DEGRADED · ENVIRONMENT-ONLY MODE` + `PSI N/A (Env-Only)`; GPS loss -> `DEGRADED · GPS SIGNAL LOST` + supervisor alert; `Clear All Faults` restores clean PSI scoring and resets post-fault trend buffer without stale state. |
| **Access Control & Privacy Governance** | `tests/e2e/access-control.spec.ts` | Intercepts every `/api/*` JSON payload & inspects `/supervisor` DOM to guarantee zero raw physiological fields (`hrBpm`, `skinTempC`, `exertionIndex`, `hr0`, `tc0`, `hrMaxEstimated`, `tcProxyC`, `psi`); verifies `GET /api/worker/W-101/state` with supervisor headers/Bearer tokens returns HTTP `403` `{ redacted: true }`. |
| **UAE Midday Break Compliance** | `tests/e2e/compliance-report.spec.ts` | Verifies `12:30–15:00 GST` break-window calculations on active Amber/Red shift, validates `Export Regulator JSON` download contents & `Export PDF` (`window.print`), and verifies `zero_violations` shift produces an explicit 100% full-compliance banner and audit row. |
| **Validation & Prospective UI Parity** | `tests/e2e/validation-backtest.spec.ts`, `tests/e2e/forecast-validation.spec.ts` | Independently recomputes `runBacktest` and `runProspectiveForecastValidation` for seed `202608` and asserts exact match on `/validation` and `/forecast-validation` (catching stale caches) plus interactive chart hover inspection. |
| **Live Demo Smoke & Screenshot Gallery** | `tests/e2e/e2e-demo-smoke.spec.ts` | Continuous replay of the 3-minute live demo script from baseline -> crossing -> multilingual SOS -> supervisor break order -> fault degradation -> recovery -> compliance -> forecast validation, saving `01-*.png`..`09-*.png` to `test-results/demo-gallery/`. |

---

## Checked-In Static Fixtures (`/fixtures/`)

All deterministic unit fixtures are version-controlled under `fixtures/` and are **never regenerated dynamically during test runs**:

- `fixtures/historical_wbgt_day.json` — Fixed UAE summer workday WBGT observation schedule (06:00–19:00 GST).
- `fixtures/psi_reference_pairs.json` — Documented Moran et al. (1998) + Tanaka HRmax derivation pairs and exact tier boundary cutoffs.
- `fixtures/forecast_trend_fixtures.json` — Five pre-computed trajectory windows (`flat_baseline`, `rising_trend`, `falling_recovery`, `noisy_oscillating`, `tier_crossing_green_to_amber_to_red`).
- `fixtures/synthetic_cohort_fixture.json` — Fixed 12-worker-day synthetic physiological cohort (seed `202608`).

---

## Out of Scope (Deliberately Excluded)

- **Physical BLE Radio & Hardware Firmware**: BLE frames are tested at the hardware-agnostic `POST /api/ble/telemetry` ingestion contract rather than over live Bluetooth GATT peripherals.
- **High-Concurrency / Distributed Load Testing**: State lives in an in-memory Node/Express store sized for single-site crew simulation (6 active crew, 24 cohort trajectories); horizontal DB clustering and multi-thousand-worker soak tests are out of scope for this prototype.
- **Production SSO / External IdP Integration**: Supervisor role enforcement is verified via `X-SiteGuard-Role` and `Authorization` Bearer session headers at the API gateway boundary rather than an external OIDC provider.
