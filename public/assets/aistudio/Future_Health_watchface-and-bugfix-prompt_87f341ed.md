# SiteGuard — Watch Face UI + Forecast-Hallucination Bugfix Prompt

Paste into Google Antigravity against the existing live repo (siteguard.ai.studio).
This covers one confirmed production bug and one UI upgrade. Fix the bug first —
it's a safety-architecture violation, not a cosmetic issue.

```
ROLE
You are updating the existing SiteGuard repo (deployed at siteguard.ai.studio).
Do not rebuild from scratch — these are targeted changes to the current
worker-state API, the Gemini explanation-generation code path, and the
/worker React view. Preserve all existing routes, API contracts, and the
/supervisor, /compliance, /validation pages exactly as they are — they were
independently verified against their own data and must not regress.

=====================================================================
PART 1 — CRITICAL BUGFIX (do this first, before any UI work)
=====================================================================
CONFIRMED BUG: GET /api/worker/W-101/state currently returns
forecast.projectedAmberCrossingMin: null and projectedRedCrossingMin: null
(with forecast.slopePerMin negative, i.e. risk falling), while the Gemini-
generated alertTranslations.en.proactiveForecastNote on the SAME payload
says "Heat risk is projected to reach Amber in 1 minute and Red in 36
minutes" — a fabricated, specific ETA that contradicts the engine's own
null/falling-trend output. This propagates identically into all translated
languages, confirming the fabrication happens in the English generation
step before translation.

ROOT CAUSE TO FIX: whatever function/prompt generates proactiveForecastNote
is not being passed projectedAmberCrossingMin / projectedRedCrossingMin (or
is being instructed to always produce a specific-sounding ETA regardless of
whether one exists). Fix the prompt/function so that:
- It receives the actual projectedAmberCrossingMin and projectedRedCrossingMin
  values (both nullable) as structured input, not just prose context.
- If both are null, the generated note must say something equivalent to
  "no Amber/Red crossing currently projected within the 30-minute window" —
  never a specific minute figure that wasn't in the input.
- If one or both are non-null, the note may reference that exact number (or
  round it, e.g. "~18 minutes"), but must never diverge from the engine's
  value by generating its own.
- Add a server-side guard, not just a prompt instruction: after the LLM
  response comes back, regex/parse out any "in N minute(s)" claims in the
  note and assert N is within a small tolerance of the actual
  projectedAmberCrossingMin/projectedRedCrossingMin (or that no such claim
  exists when both are null). If the guard fails, discard the LLM's note and
  fall back to a template-generated sentence built directly from the
  structured fields. This guard is the actual fix — the prompt wording alone
  is not sufenough to trust in a safety-relevant surface.
- Apply the same fix to whatever generates the headline/explanation/action
  fields if they ever reference time-to-threshold language.
- Regenerate alertTranslations for all 5 languages after the fix and confirm
  by re-querying GET /api/worker/W-101/state that the English note is now
  either silent on ETA or consistent with the structured fields.

=====================================================================
PART 2 — WATCH FACE UI (worker-facing simulated wearable display)
=====================================================================
Replace the current /worker slider-panel-first layout with a circular gauge
"watch face" as the PRIMARY element, keeping the existing physiological
sliders and fault-injection buttons as a collapsible "Developer / BLE
Simulator" drawer below it (same functionality, just demoted visually — the
gauge is the product, the sliders are the test harness that drives it).

DESIGN SPEC (reference implementation already prototyped in
watchface-preview.html — port this logic into the real React app and wire it
to live data instead of the mock states):

- Circular dial, three colored arc bands mapping composite score 0-10 across
  a 240° sweep (-120° to +120°): Green 0-4, Amber 4-7, Red 7-10 — these
  boundaries must read from the same tier-threshold constants the backend
  risk engine uses, not be hardcoded separately in the frontend (a threshold
  changed on the backend must move the arc bands automatically).
- Main needle position = current compositeScore from GET /api/worker/:id/state.
- Ghost needle (dashed, ~45% opacity) = the t+15 forecast position, driven
  by forecast.psi15.point (or the composite-equivalent if the UI needs the
  same unit as the main needle — convert consistently, document the
  conversion in a code comment). If forecast.status is
  "insufficient_trend_data", the ghost needle must not render at all — show
  a small "collecting trend data" label instead of a stale or fabricated
  ghost position.
- Outer tick ring: render the last 5 entries from the worker's `history`
  array as colored tick marks (green/amber/red per that entry's own
  compositeScore) — this ring doubles as a miniature trend chart, not pure
  decoration.
- Center: large JetBrains Mono numeral (current compositeScore), tier-word
  pill below it colored to match the tier, small sub-line showing the t+15
  forecast value and direction arrow — or "insufficient trend data" per above.
- Top micro-overlays: simulated clock time (small, secondary — this is a
  safety instrument, not a lifestyle watch, so time is not the dominant
  element), battery percentage from latestFrame.batteryPct.
- Bottom micro-label: deviceId + "HR+SKIN" + signalQuality%, OR when
  scoringMode is environment_only_degraded, replace it with the
  degradedReason text (e.g. "BLE LOST · ENV-ONLY WBGT FALLBACK") — this
  label must come directly from the API response fields, never be a
  frontend-only guess at fault state.
- Red-tier state gets a subtle pulsing glow confined to the red arc segment
  only (CSS animation, ≤15fps equivalent, small region) — never a full-
  screen flash or anything that could read as seizure-risk strobing.
- Always-On Display (AOD) variant: a separate, genuinely reduced-pixel
  rendering (not just a dimmed CSS filter over the active face) — grayscale
  only, no ghost needle, no colored tick ring, tier shown as a single letter
  (G/A/R) rather than the full word, thin 1-2px strokes. Toggle it via a
  simple "Simulate AOD" button for the demo, since this is illustrating
  wearable-hardware power-budget behavior that a web page can't literally
  measure.
- When a fault is active (any of bleDisconnected/lowBattery/sensorNoise/
  gpsLoss), the needle and arc bands render in a desaturated grey rather
  than their normal tier color, and the bottom micro-label switches to the
  degradedReason text — this must be visible at a glance, not just in a
  tooltip, since "can I tell at a glance the device is degraded" is
  literally part of what a judge or a real supervisor needs to assess in
  under 2 seconds.

DO NOT regress the existing language switching, check-in button, or
simulated-clock advance controls — port them into the new layout, don't drop
them.

TESTING
Add to the existing Playwright suite: a spec asserting that for a fixture
where forecast.status is "insufficient_trend_data", the rendered DOM
contains no ghost-needle element and no fabricated ETA text anywhere on the
page (reuse the LLM-boundary-enforcement pattern from the existing
predictive-forecast.unit.spec.ts, but assert on the actual rendered gauge
now, not just the API payload). Also add a visual regression-style assertion
(screenshot diff is fine) confirming the AOD variant genuinely differs from
the active variant (fewer DOM nodes / fewer distinct colors), not just a CSS
opacity change, to catch someone "faking" the AOD mode with a filter.

DELIVERABLES
- Updated /worker page with the gauge as primary, sliders/fault buttons in a
  collapsed drawer.
- The server-side ETA guard from Part 1, with a short note in the README
  under "Known Limitations" or a new "Responsible AI Safeguards" section
  explaining what the guard does and why it exists — this is a strong,
  concrete thing to point to when a judge asks about responsible AI practice.
- Confirm via a fresh GET /api/worker/W-101/state call (or the equivalent for
  whichever worker is in Amber/Red at demo time) that the forecast note and
  the structured ETA fields are now consistent before considering this done.
```
