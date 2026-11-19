# SiteGuard — Futuristic UI Overhaul Prompt (watch face is the design anchor)

Paste into Google Antigravity against the existing repo
(github.com/nagarajanr1399-debug/SiteGuard — local reference build already
has `WatchShell.tsx` + `AppCarousel.tsx` committed on top of the existing
`WatchFaceGauge.tsx`). This is a visual/interaction upgrade pass across the
**whole application shell** (TopNav, WorkerPage chrome outside the watch,
SupervisorPage, CompliancePage, ValidationPage, ForecastValidationPage) to
match the sci-fi/mission-control language already established by the watch
components — not a redesign of the watch itself.

```
ROLE
You are restyling the existing SiteGuard app to look futuristic and
information-dense, the way the watch face already does. Do not touch the
visual design of WatchShell.tsx, AppCarousel.tsx, or WatchFaceGauge.tsx —
those three are the FINISHED design reference everything else must now
match, not components to redesign. Every other page/component currently
uses a bright white/light-slate theme (bg-white, border-slate-200,
text-slate-900 — see TopNav.tsx, SupervisorPage.tsx, CompliancePage.tsx,
ValidationPage.tsx, ForecastValidationPage.tsx) with dark panels appearing
only in isolated islands (the #0B1120 guidance card and BLE simulator JSON
preview inside WorkerPage.tsx). That inconsistency is exactly what this
pass fixes: make the dark, glowing, data-dense language the app's default,
not an island.

Do not regress any existing API contract, data-testid, access-control
behavior, or test. This is a CSS/layout/animation/token pass — component
props, data fetching, and business logic must not change. Run `npm run
lint` (tsc --noEmit) and the existing Playwright/Vitest suites after your
changes and confirm they still pass before finishing.

=====================================================================
PART 0 — DESIGN TOKENS (extract from the watch components, reuse
everywhere — do not invent a different palette)
=====================================================================
Source of truth, already live in the codebase:
- Base/panel background: #0B1120 (used today in WorkerPage's guidance
  card) and #0c0d10 / #212121 (used in AppCarousel's card backgrounds) —
  pick #0B1120 as the app's page background and #141821 or #17191d as the
  "card on dark" surface (between the two existing dark tones already in
  use, so new panels don't clash with the ones already shipped).
- Accent/brand purple: #787aff (AppCarousel focus color)
- Negative/alert red: #fa114f (AppCarousel Stop-Work color) — reserve this
  specifically for Red-tier/critical states; do not use it decoratively.
- Tier colors (already in WatchFaceGauge.tsx bandColors): green #10b981,
  amber #f59e0b, red #ef4444 — reuse these exact hexes for every status
  pill, badge, chart line, and alert surface app-wide, not new ad hoc
  greens/reds per page.
- Type: `font-mono` (JetBrains Mono, already loaded) for every numeric
  value, metric, timestamp, and ID — this is already the convention in
  WatchFaceGauge and the guidance card's biometric strip; extend it to
  every number on every page. Plus Jakarta Sans for all other UI text.
- Card radius: 21–28px (the carousel cards use 21.7px, the guidance card
  uses rounded-2xl/28px) — keep this family of radii, don't introduce a
  sharper or more rounded family elsewhere.

Add these as a small shared token file (e.g. `src/shared/designTokens.ts`
exporting named color/radius constants, or a Tailwind theme.extend block in
`tailwind.config`/`vite.config.ts` if the project's Tailwind v4 setup uses
CSS-based `@theme`) so every page imports the same values instead of each
page hand-picking similar-but-different hex codes.

=====================================================================
PART 1 — GLOBAL SHELL
=====================================================================
- `TopNav.tsx`: replace the white header (`bg-white border-slate-200`,
  `text-slate-900`) with a dark glass bar: translucent dark background
  (e.g. `bg-[#0B1120]/90 backdrop-blur-md`), a subtle 1px bottom border in
  a low-opacity accent color, active nav links underlined/glowing in
  #787aff instead of slate-900, and the "SiteGuard" wordmark using the
  same accent purple as the watch's wordmark.
- Set the app's `<body>`/root background to #0B1120 (or a very subtle
  animated dark gradient / faint grid texture, performance-permitting)
  instead of the current light page background, so every page sits on the
  dark canvas by default rather than white cards floating on white.
- Keep all existing content/copy — this is not a rewrite of what the app
  says, only how it looks.

=====================================================================
PART 2 — WORKER PAGE (outside the watch, which stays untouched)
=====================================================================
- The guidance card, sparkline panel, and simulated-clock controls
  (currently `bg-white border-slate-200`) move to the shared dark card
  token so they read as one continuous dark surface with the watch next to
  them, not a dark watch floating next to light cards.
- Status/degraded banners (amber/rose currently on light backgrounds) keep
  their semantic color but move to a dark-translucent background
  (e.g. `bg-amber-500/10 border-amber-400/30 text-amber-200`, already the
  pattern used for the proactive-forecast-note — extend it to every other
  banner on this page for consistency).
- Add a subtle live-pulse animation (CSS keyframe or `motion` — already a
  dependency — is fine) on the tier pill / status dot when assessment.tier
  is Amber or Red, echoing the watch's `sg-red-arc-pulse` treatment.

=====================================================================
PART 3 — SUPERVISOR PAGE ("mission control" crew grid)
=====================================================================
- Convert the crew list/table into a grid of dark glass cards per worker
  (one card per `WorkerStatusPublic`), each with: a tier-colored left
  accent bar or glow ring, the worker's `riskBandLabel`/tier in a
  monospace pill using the shared tier colors, and the sparkline/trend
  indicator already available in the data.
- Needs-break queue and rotation suggestions become a dark side panel with
  accent-colored action buttons (Acknowledge / Order Break / Escalate /
  Apply Rotation) instead of the current light buttons.
- Keep the privacy boundary messaging (`privacyEnforced: true`, no raw
  vitals) visually prominent — e.g. a small lock-icon badge, reusing the
  `Lock` icon already imported from lucide-react — so judges can still see
  the access-control story at a glance, just restyled.

=====================================================================
PART 4 — COMPLIANCE & VALIDATION PAGES
=====================================================================
- `CompliancePage.tsx`: restyle the MOHRE midday-break compliance report
  as a dark "certificate/dashboard" — keep the printable/export path
  working (`no-print` classes already exist — preserve print output as
  readable light-on-white for printing even if the on-screen view is
  dark; use a print media query to flip back to light for `@media print`).
- `ValidationPage.tsx` / `ForecastValidationPage.tsx`: restyle backtest
  metrics (Sensitivity, False-Alarm Rate, Precision, F1, Mean Lead Time)
  and the forecast ablation table as dark stat cards with monospace
  tabular numerals and tier-colored deltas (green for improvement, red for
  regression), keeping every number exactly as computed — this pass must
  not touch `cohortAndValidation.ts` or any computation.

=====================================================================
PART 5 — MICRO-INTERACTIONS (use the existing `motion` dependency)
=====================================================================
- Page-level fade/slide-in on route change.
- Numeric value transitions (e.g. compositeScore changing after a sim
  step) animate rather than snap — short, subtle, no more than ~300ms.
- Button press states use a slight scale-down (already present in some
  buttons via `active:scale-[0.99]` — extend that convention everywhere
  instead of introducing a different interaction feel).
Do not add animations that delay the judge's ability to read a number —
motion is garnish, not a gate on information.

=====================================================================
CONSTRAINTS (non-negotiable)
=====================================================================
- WatchShell.tsx, AppCarousel.tsx, WatchFaceGauge.tsx: NO visual changes.
  They are the reference other pages must now resemble.
- No change to any API call, endpoint, payload shape, or component prop.
- No change to any `data-testid` — every existing Playwright/Vitest
  assertion must keep passing unmodified.
- No regression to the forecast-ETA guard, access-control (403 for
  supervisor role on worker state), or fault-injection degradation —
  these are purely visual changes layered on top of unchanged logic.
- Contrast: dark-on-dark must stay readable (aim for WCAG AA on body text
  against its background) — don't sacrifice legibility for mood.
- Print output for CompliancePage must remain light/readable on paper.

DELIVERABLES
- `src/shared/designTokens.ts` (or Tailwind theme extension) as the single
  source of the palette described in Part 0.
- Restyled TopNav.tsx, WorkerPage.tsx (non-watch chrome), SupervisorPage.tsx,
  CompliancePage.tsx, ValidationPage.tsx, ForecastValidationPage.tsx.
- `npm run lint` clean, existing `test:unit` and `test:e2e` suites passing
  unmodified.
- Before/after note in DEMO_SCRIPT.md describing the visual upgrade in one
  short paragraph, for the judge-facing walkthrough.
```
