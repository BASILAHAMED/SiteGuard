# SiteGuard — Technical & Submission Documentation

**Team:** GenOS Team  
**Challenge:** Future Health Digital Innovation Challenge (hack2skill / Abu Dhabi) — Challenge Statement 07: *Climate-Resilient Worker Health*

---

## 1. Key Modeling Assumptions

1. **Physiological Baseline & Proxy Calibration:** Shift-start baselines (`HR0`, `Tc0`) are recorded before outdoor solar exposure. Non-invasive skin temperature is linearly mapped to core-temp proxy (`Tc_proxy = 36.8 + (skinTempC - 33.5) * 0.68`) as a documented field approximation.
2. **Environmental WBGT Transfer:** Outdoor WBGT is calculated from dry-bulb air temperature, relative humidity (Stull 2011 wet-bulb formula), solar irradiance, and wind speed (ISO 7243 weighting), then shifted by ACGIH Clothing Adjustment Factors (`+0°C` Standard Coverall, `+2.0°C` FR/Arc-Flash, `+4.0°C` Chemical/Tyvek).
3. **Deterministic Numerics, LLM Semantics:** Large Language Models (Gemini) are **never** used to compute numeric PSI scores, threshold crossings, or `t+15`/`t+30` forecasts. Deterministic mathematical models own all numeric safety outputs; Gemini owns plain-language explanation, multilingual translation, and narrative summarization.

---

## 2. Limitations & Safety Boundaries

- **Advisory Early Warning, Not a Medical Device:** SiteGuard provides occupational heat-stress decision support aligned with ACGIH TLVs and UAE Ministerial Resolution No. 44 of 2022; it does not diagnose heat stroke or replace on-site HSE medical triage.
- **Fault Degradation Safety Floor:** When BLE drops, battery falls below 10%, or signal quality degrades below `0.50`, physiological inputs are quarantined immediately to prevent corrupted alerts, and scoring degrades gracefully to conservative environment-only WBGT bands.
- **No Fabricated Forecasts:** On cold start or immediately after clearing a fault, the forecast engine suppresses extrapolation and returns `"Insufficient trend data"` until 4 clean samples establish a trend window.

---

## 3. Responsible AI & Privacy-by-Architecture Design

- **Zero Raw Vitals in Supervisor/Admin APIs:** `/api/supervisor/crew` and `/api/compliance/report` use a strict server-side projection (`WorkerStatusPublic`) that omits `hrBpm`, `skinTempC`, `exertionIndex`, `hr0`, `tc0`, and `hrMaxEstimated`. Supervisors only see derived risk tiers (`Green`/`Amber`/`Red`), recommended actions, break counts, and projected crossing windows.
- **Zero Real PII:** All worker units are identified strictly by anonymized operational IDs and trade roles (`W-101 · Steel Fixer`), eliminating personal health data exposure.
- **Multilingual Equity:** Safety alerts and proactive break recommendations are rendered via Gemini into the five primary UAE construction workforce languages (**English, Hindi, Urdu, Bengali, Tagalog**) with RTL support for Urdu and server-side caching to ensure low-latency, consistent wording.
- **Explicit Synthetic Provenance:** Every UI screen displays a persistent data provenance banner distinguishing real/historical UAE meteorological data from simulated/synthetic physiological telemetry.

---

## 4. Commercial Path (Who Pays, For What)

- **Primary Payers:** Tier-1 & Tier-2 Construction Contractors, Oil & Gas EPCs, Logistics/Port Operators, and Industrial Facilities across the GCC (UAE, KSA, Qatar, Oman).
- **Secondary Payers / Channel Partners:** Occupational Health Insurers (offering premium rebates for verified heat-strain mitigation) and Municipal/Labor Compliance Ecosystems.
- **Value Proposition & Pricing Model:**
  - **SaaS + Gateway License (`$6–$12 / worker / month`):** Device-agnostic cloud & edge safety engine, multilingual wearable alert orchestration, and supervisor heat-rotation dispatch.
  - **Automated Regulatory Audit Module:** Eliminates manual paperwork for **UAE Midday Working Break Law (12:30–15:00 GST, Jun–Sep)** inspections and insurer claims defense through tamper-evident PDF/JSON compliance logs.
  - **ROI Driver:** Preventing a single heat-stroke lost-time incident, site shutdown, or MOHRE non-compliance fine (`AED 5,000–50,000` per violation) covers annual deployment for an entire 200-worker crew.
