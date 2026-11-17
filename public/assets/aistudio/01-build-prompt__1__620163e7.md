# SiteGuard — Build Prompt (Google Antigravity + Gemini)

Paste this into Google Antigravity as the mission brief.

```
ROLE
You are the lead engineer inside Google Antigravity, building a working hackathon
prototype for the Future Health Digital Innovation Challenge (hack2skill / Abu
Dhabi), Challenge Statement 07 "Climate-Resilient Worker Health." Use the
available Gemini model (Gemini 3 Pro for reasoning/explainability tasks,
a lighter Gemini model is fine for translation/formatting) via the Gemini API.
Team name in any generated copy: "GenOS Team" — never use a personal name.

PRODUCT
Name: SiteGuard
One-liner: A device-agnostic AI platform that predicts and prevents heat-strain
injury in outdoor/industrial workers, turns the signal into a plain-language,
multilingual, graded alert, and auto-generates the UAE Midday Working Break
compliance report employers already need to produce.

HARD CONSTRAINTS
- No real PII. No real wearable hardware. The "wearable" is a UI simulator panel,
  not a physical device integration — but it must speak the SAME API contract a
  real BLE device would use, so swapping in real hardware later is a config
  change, not a rewrite.
- Environmental data must be real (use a free weather/historical API or a
  bundled CSV of UAE heat-index/WBGT data) — do not synthesize this half.
- Physiological data is Gemini-synthesized and must be clearly labeled as such
  in the UI (a visible "data provenance" badge: "Environmental: live/historical
  data. Physiological: simulated, calibrated to ACGIH/NIOSH heat-stress
  thresholds."). Never present synthetic data as if it were real.
- Supervisor and Admin roles must be architecturally unable to see a worker's
  raw vitals — only a derived risk tier (Green/Amber/Red) and a recommended
  action. Enforce this at the API layer, not just hidden in the UI.

ARCHITECTURE
Stack: Next.js (App Router) + TypeScript + Tailwind, deployed to Vercel.
State/data: Supabase or a simple in-memory/SQLite store is fine for the hackathon
(no need for a production DB). Gemini API called server-side only (API key never
exposed to client).

Data flow:
  [Environmental feed] + [Worker context: role, PPE, acclimatization days]
  + [Simulated physiological stream: HR, skin temp, exertion, from the UI slider
  panel, pushed over the same API shape a real BLE wearable would use]
    -> Risk Engine (Physiological Strain Index formula, Moran et al.)
    -> Gemini explainability layer (turns the PSI score + contributing factors
       into a plain-language, multilingual alert with a specific recommended
       action — not just "risk: high")
    -> three surfaces below.

RISK ENGINE (implement as a pure, testable function, separate from the UI)
Use the Physiological Strain Index:
  PSI = 5 * (HRt - HR0) / (HRmax - HR0) + 5 * (Tct - Tc0) / (39.5 - Tc0)
where HRt/Tct are current heart rate / core-temp-proxy (use skin temp as proxy,
documented as an approximation), HR0/Tc0 are baseline at shift start, HRmax is
age-estimated max HR. Combine with environmental WBGT banding (ACGIH TLV action
limits) to produce a 0-10 composite score, then map to three tiers:
  Green (0-3): normal, routine hydration reminder.
  Amber (4-6): mandatory rest in shade, log event, notify worker + supervisor.
  Red (7-10): stop work immediately, supervisor escalation, timestamped
    incident log entry.
Cite the formula source in a code comment and in the README.

SCREENS (build all three as real, navigable pages, not mockup images)
1. /worker — simulated wearable face. Big tier icon, one line of plain-language
   alert text in the worker's selected language (support at minimum English,
   Hindi, Urdu, Bengali, Tagalog via Gemini translation, cached not re-called
   every render), a single "I'm okay" / "Need help" button. Includes the
   wearable SIMULATOR control panel: sliders for HR, skin temp, exertion, plus
   FAULT INJECTION buttons: "Disconnect BLE," "Battery <10%," "Sensor noise,"
   "GPS loss." Triggering a fault must visibly degrade the system to
   environment-only scoring and log the degradation event — this is a required
   feature, not optional polish.
2. /supervisor — crew grid, one tile per simulated worker showing tier color
   only (no raw vitals), "who needs a break now" sorted list, shift/rotation
   suggestion, live alert feed, acknowledge/escalate controls.
3. /compliance — auto-generated report: today's breaks taken vs. UAE Midday
   Working Break Law window (12:30-15:00, Jun-Sep), incident/near-miss log,
   exportable as PDF, with a field for "insurer/regulator export."

GEMINI USE CASES (be explicit in code comments which call does what)
1. Risk explanation: given the PSI inputs and tier, generate a short,
   non-alarming, plain-language explanation + action for the worker's view.
2. Multilingual rendering of that explanation into the five target languages.
3. Synthetic physiological cohort generation for the backtest dataset (used in
   validation, not live demo) — generate N worker-days of HR/skin-temp time
   series calibrated to cross ACGIH/NIOSH thresholds at realistic points,
   clearly tagged as synthetic in the data file's metadata.
4. (Stretch) Compliance report narrative summary in plain language for a
   non-technical site manager.

VALIDATION / BACKTEST (build this as a script + a results page, not just a claim)
Replay a simulated historical UAE heat-wave day against the synthetic cohort.
Compute and display: alert lead time before the simulated heat-exhaustion
threshold crossing, sensitivity, false-alarm rate. Show these numbers on a
/validation page with the methodology stated plainly (what's real data, what's
synthetic, what the limitations are).

PREDICTIVE EARLY-WARNING FORECAST (build after the above is working — this is
the single highest-value addition, do not let it slip)
Do NOT use the LLM to compute the forecast number — LLMs are unreliable at
precise numeric extrapolation and a confidently-wrong forecast is a safety
failure mode here. Split it into two layers:
1. Forecast engine (deterministic/trained, not the LLM): using the last 10-15
   minutes of HR/skin-temp/exertion trend plus near-term environmental trend
   and workload context, extrapolate the PSI trajectory to t+15 and t+30
   minutes. Start with simple linear/quadratic trend extrapolation — fast and
   interpretable. Optionally also train a lightweight regressor (e.g.
   LightGBM) on lagged features from the synthetic cohort and show it as an
   ablation against the simple baseline, not a replacement for it. Output a
   predicted tier (Green/Amber/Red) and a confidence interval, never a bare
   point number. If there isn't a clean trend window yet (cold start, or a
   fault was just cleared), the system must say "insufficient trend data" —
   never fabricate a prediction to fill the UI.
2. Contextual reasoning layer (Gemini/Groq): takes the forecast's output and
   genuinely qualitative context the model can reason over well — upcoming
   shift/break schedule, hydration history, acclimatization days, planned
   workload — and produces a specific, proactive recommendation, e.g. "At
   current pace, Amber threshold likely in ~18 minutes — start the hydration
   break now rather than waiting." The LLM explains and contextualizes a
   number it was given; it never generates the number itself.
Add a predicted-trend sparkline with the projected crossing time to /worker
and /supervisor. Validate this prospectively, not just retrospectively: at
each point in a simulated trajectory, generate the t+15/t+30 prediction, let
simulated time advance, then compare prediction to actual outcome. Report
MAE/RMSE on predicted-vs-actual PSI and predicted-tier-vs-actual-tier accuracy
on a /forecast-validation page. The demo moment this enables: run the
simulated clock, show the prediction banner fire, then watch the predicted
crossing actually happen a few simulated minutes later — this is the "prevent
incidents before they happen" claim made falsifiable instead of asserted.

DELIVERABLES
- Working deployed app (Vercel URL).
- README with: architecture diagram (text/ASCII is fine), data provenance
  statement, the PSI formula and citation, known limitations, "path to real
  hardware" section (what changes when a real BLE wearable is plugged in).
- A short technical-documentation file matching what hack2skill requires at
  submission: assumptions, limitations, responsible-AI/privacy design,
  commercial path (who pays, for what).
- A 3-minute demo script (bullet list of what to click, in what order, to tell
  the story end-to-end: worker gets hot -> alert fires -> supervisor acts ->
  fault injected -> graceful degradation -> compliance report generated).

PROCESS
First, produce a milestone plan (screens -> risk engine -> Gemini integration
-> fault injection -> validation page -> compliance report -> polish) and show
it to me before writing code. Build and verify each milestone with the browser
verification agent before moving to the next. Do not fabricate validation
numbers — compute them from the actual backtest script output.
```
