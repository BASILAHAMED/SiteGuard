# SiteGuard — 3-Minute Live Demo Script

**Team:** GenOS Team  
**Total Runtime:** ~3 minutes

---

### Minute 0:00 – 0:45 | Worker Wearable & Prospective Early Warning
1. Start on `/worker` with unit **W-101 (Steel Fixer, unacclimatized 3 days)** selected.
2. Point out the top **Data Provenance Strip**: real Abu Dhabi Mussafah WBGT (`35.0°C`) paired with clearly labeled simulated physiological telemetry.
3. Show the dark wearable face: W-101 is currently **GREEN · NOMINAL**, yet the **30-Min Trajectory Sparkline** and **Gemini Proactive Forecast** warn that Amber strain will be crossed soon.
4. Click **Hindi (`हिन्दी`)** or **Urdu (`اردو`)** in the Language bar — show instant cached multilingual rendering of both the status and proactive forecast advice.
5. Click **`+3 min Step`** twice in the Simulated Clock controls: watch the sparkline advance and see the predicted crossing **actually occur** as W-101 transitions into **AMBER · REST IN SHADE**.

### Minute 0:45 – 1:30 | Privacy-Enforced Supervisor Dispatch
6. Click **Supervisor** in the top navigation (`/supervisor`).
7. Highlight the **API-Layer Privacy Lock** banner: raw HR and skin temperature are architecturally absent from `/api/supervisor/crew` — only derived tiers, projected crossing times, and break queues are visible.
8. Point to **"Who Needs a Break Now"** sorted queue and **Shift Rotation Suggestions**.
9. Click **`Order 15m Break`** on **W-101** (or **`Escalate`** on **W-104**) — notice the directive logs immediately and updates break minutes.

### Minute 1:30 – 2:15 | Fault Injection & Graceful Degradation
10. Return to **Worker** (`/worker`) and click **`Disconnect BLE`** (or **`Sensor noise`**).
11. Point out the immediate yellow degradation banner on the wearable: **`DEGRADED · ENVIRONMENT-ONLY MODE`**. Physiological PSI is quarantined (`PSI N/A`), scoring falls back safely to ACGIH WBGT + PPE limits, and the event is logged.
12. Click **`Clear All Faults`** — verify the forecast panel explicitly reports **`Insufficient Trend Data`** instead of fabricating a number until 4 clean samples arrive.

### Minute 2:15 – 3:00 | UAE Compliance Report & Empirical Validation
13. Open **Compliance** (`/compliance`): show today's breaks vs. the **UAE Midday Working Break Law (`12:30–15:00 GST`)**, the audit log capturing the Red escalation and BLE degradation event, and click **`Generate Summary with Gemini`** followed by **`Export PDF`**.
14. Finish on **Backtest** (`/validation`) and **Forecast** (`/forecast-validation`): show computed **Alert Lead Time, Sensitivity, False-Alarm Rate**, and prospective **MAE / RMSE / Tier Accuracy** comparing the interpretable Damped Trend Baseline against the Lagged Ridge Regressor ablation.
