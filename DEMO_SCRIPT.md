# SiteGuard — 3-Minute Live Demo Script

**Team:** GenOS Team  
**Total Runtime:** ~3 minutes

> **Before / After Visual Upgrade:** SiteGuard previously paired a dark OLED Apple Watch unit with bright white/slate web dashboards. The interface now unifies the entire platform under a cohesive `#0B1120` / `#141821` dark mission-control canvas anchored to the watch face's `#787aff` focus accent, `#fa114f` stop-work red, `#10b981` / `#f59e0b` / `#ef4444` ACGIH tier tokens, `JetBrains Mono` tabular telemetry numerals, subtle `motion` route/value transitions, and high-contrast light `@media print` preservation for regulatory reports.

---

### Minute 0:00 – 0:50 | Apple Watch Shell, App Carousel & Prospective Early Warning
1. Start on `/worker` with unit **W-101 (Steel Fixer, unacclimatized 3 days)** inside the **Apple Watch Shell** (`WatchShell.tsx`).
2. Point out the top **Environmental Feed Strip**: live Abu Dhabi telemetry (`Live Abu Dhabi Feed` via OpenWeatherMap/Open-Meteo or `Gemma 4 Edge Offline Mode` on network drop) alongside `Heatwave CSV (11:00)` calibration.
3. **Tap the Watch Center Score** (`4.0`) to open **`AppCarousel`** — scroll through stacked `#212121` cards showing nearest-to-center `#787aff` focus (`Composite Strain`, `Next Break`, `Heat Risk Forecast`, `Stop-Work Alert`, `Hydration`). Tap **Heat Risk Forecast** to jump straight to the 30-minute trajectory chart.
4. Click **Hindi (`हिन्दी`)** or **Urdu (`اردو`, full RTL)** in the Guidance panel — show instant multilingual rendering of both status and deterministic ETA-guarded forecast advice.
5. Click **`+6 min Step`** in Simulated Clock controls:
   - Watch W-101 escalate into **AMBER · REST IN SHADE**, triggering the **sliding-down Watch Notification Banner** with inline **`I'm Okay`** / **`Need Help`** response buttons.
   - Switch briefly to **W-104 (`Red` critical tier)** and tap center score to see **`Stop-Work Alert`** **auto-focus** at full opacity in `#fa114f`.

### Minute 0:50 – 1:25 | Watch Hardware Controls, Siri Voice Sheet & Safety-Gated SOS
6. **Digital Crown Tap:** Click the ridged **Digital Crown** on the right bezel to open the 6-bubble **App Grid** (`Heat Gauge`, `Cards`, `Voice Report`, `Alerts`, `Hydrate Log`, `Controls`).
7. **Siri-Style Voice Incident Intake:** Open **`Voice Report`** from the Crown App Grid (or launcher button) to raise the bottom Voice Sheet, pick **High** severity, record/submit a safety note, and dispatch it to `/supervisor`.
8. **Side-Button Click-and-Hold (`600ms`) Emergency SOS Slider:** Press and hold the thin **Side Button** below the Crown for 600ms to reveal the **Slide-to-Confirm SOS** overlay. Drag halfway and release to demonstrate the false-trigger safety guard (snaps back without firing); drag fully to the right edge to trigger **Emergency SOS**.

### Minute 1:25 – 2:10 | Privacy-Enforced Supervisor Dispatch & Custom Thresholds
9. Open **Supervisor** (`/supervisor`):
   - Highlight the **API-Layer Privacy Lock** (`WorkerStatusPublic` strips all raw HR/skin temp/exertion telemetry; direct worker queries with supervisor headers return `HTTP 403`).
   - Show **Who Needs a Break Now**, **Shift Rotation Suggestions**, the **Live Alert & Fault Feed** (including the transcribed Voice Incident), and the **Supervisor Temperature Thresholds & Multilingual Alert Rules** editor.
   - Click **`Order 15m Break`** on **W-101** or **`Escalate`** on **W-104**.

### Minute 2:10 – 3:00 | Control Center Fault Degradation, Compliance & Empirical Validation
10. Return to **Worker** (`/worker`), tap the bottom Watch handle to open the Apple Watch **Control Center** (or expand **`Developer / BLE Simulator`**), and toggle **`BLE Fault` / `Disconnect BLE`**:
    - Observe **`DEGRADED · ENVIRONMENT-ONLY MODE`**, desaturated greyscale watch dial, quarantined `PSI N/A`, and logged audit event.
    - Click **`Clear Faults`** — verify **`Insufficient Trend Data`** displays with zero ghost needle until 4 clean samples arrive.
11. Open **Compliance** (`/compliance`) for the **UAE Midday Working Break Law (`12:30–15:00 GST`)** PDF/JSON export, then finish on **Backtest** (`/validation`) and **Forecast** (`/forecast-validation`) to inspect empirical **Sensitivity, Lead Time, MAE/RMSE, and Lagged Ridge Ablation** metrics.
