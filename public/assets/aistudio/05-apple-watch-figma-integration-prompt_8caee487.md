# SiteGuard — Apple Watch Shell Integration Prompt (attached design file is ground truth)

Paste into Google Antigravity against the existing live repo
(github.com/nagarajanr1399-debug/SiteGuard, deployed at siteguard.ai.studio).
**An exact visual reference (a Figma export / image) is attached alongside
this prompt.** Use that attached file as the literal visual ground truth for
every pixel-level detail — case shape, crown/button position and geometry,
screen bezel, card layout, colors, radii, typography, icon style, spacing.
Do not guess, approximate, or invent any visual detail this prompt doesn't
spell out numerically — look at the attached file for it. Where anything in
this prompt's text and the attached file ever disagree on a visual detail,
the attached file wins.

```
ROLE
You are extending the existing SiteGuard repo. Do not rebuild /worker from
scratch — WatchFaceGauge.tsx, VoiceIncidentRecorder.tsx, and DemoDrawer.tsx
already exist and work; this task restyles and re-houses them inside a new
Apple-Watch-shell component, reusing their existing logic and the existing
API contracts untouched (/api/worker/:id/state, /fault, /language, /checkin,
/voice-report, /api/supervisor/crew, etc.). Do not regress access-control,
fault-injection, or the forecast-ETA guard — these were independently
verified against the live deployment and must keep passing.

=====================================================================
PART 0 — READ THE ATTACHED DESIGN FILE FIRST
=====================================================================
Before writing any component, open and inspect the attached design file.
Extract from it directly (do not estimate):
- Case shape and proportions (rounded-rectangle, not circular), bezel
  thickness, crown shape/size/exact vertical position on the right edge,
  side-button shape/size/position.
- Screen corner radius, and the screen's aspect ratio relative to the case.
- The card-carousel screen's exact layout: card corner radius, card
  background color, the accent color used for the focused/centered card,
  the negative/alert accent color, spacing between stacked cards, and the
  opacity/scale difference between the focused card and the dimmed ones.
- Typography: font family (or its closest system-font equivalent if it's a
  licensed Apple font), weight, size, and letter-spacing for labels vs.
  values vs. the centered card's title.
- Any icon style or badge treatment used for list rows (circular color
  badges, icon weight, etc.).
If the attached file shows additional states (Always-On Display, a fault/
degraded state, a notification banner) use those exact renders too, not an
invented equivalent.

=====================================================================
PART 1 — IF THE ATTACHED FILE DOESN'T COVER SOMETHING
=====================================================================
For anything the attached file doesn't explicitly show (e.g. it may only
show one card-carousel frame, not every fault state), fall back to these
values rather than inventing new ones — but always prefer the attached
file's actual numbers over these when both exist:
- Card background: #212121 · Accent: #787aff · Negative/alert accent: #fa114f
- Card corner radius: ~22px · Screen corner radius (at a ~250px-wide screen
  render): ~48px, scaled proportionally to the project's actual watch size
- Type: system font stack (-apple-system, BlinkMacSystemFont, "SF Pro
  Display", falling back to the app's existing Plus Jakarta Sans /
  JetBrains Mono) — do not substitute an unrelated Google Font as the
  primary face for this screen.

=====================================================================
PART 2 — WATCH SHELL (new component: WatchShell.tsx, wraps the existing
/worker content instead of replacing it)
=====================================================================
- Rounded-rectangle case (not circular) — exact proportions and finish from
  the attached file — with a circular ridged Digital Crown positioned per
  the attached file (roughly ~30% down the right edge if not precisely
  measurable) and a thin side button below it.
- Tap the screen center toggles Active <-> AOD exactly as the existing
  WatchFaceGauge already does — do not change that logic, just re-house the
  gauge inside this shell's screen area.
- Crown tap opens an App Grid overlay (Heat Gauge / Voice Report / Alerts /
  Hydrate Log / Controls) — bubbles, not a list.
- Side-button click-and-hold (600ms) opens an SOS overlay with a
  slide-to-confirm control (not a plain tap button) that calls the existing
  "Need Help" checkin action only once the slider reaches the end — this
  reduces accidental SOS triggers, a real safety improvement over a bare
  button.

=====================================================================
PART 3 — CARD-CAROUSEL "APP OPEN" SCREEN (new component: AppCarousel.tsx)
=====================================================================
Tapping the gauge's center score (while NOT in AOD) opens this screen: a
vertical stack of cards matching the attached file's card-carousel frame —
the CENTER card is full opacity, the others dimmed (per the attached file's
exact opacity/scale, falling back to ~40% opacity / 0.94 scale if not
measurable), all driven by real live data, not placeholders:
1. "Composite Strain" — current compositeScore from /api/worker/:id/state
2. "Next Break" — plannedBreakTime from context
3. (CENTER, focused, icon-badge style, #787aff accent) "Heat Risk Forecast"
   — tapping it could deep-link to the existing forecast page/section
4. "Stop-Work Alert" — "None active" normally; when tier is Red, this card
   switches to full opacity automatically (not manually) and its value text
   uses the #fa114f negative-accent color, reading the live tier from state
5. "Hydration" — hydrationCount from context
Scrolling/snapping between cards should re-center whichever card is nearest
the middle (bring it to full opacity, dim the rest) — this is the actual
interaction pattern from the source file, not just a static list.

=====================================================================
PART 4 — NOTIFICATIONS, CONTROL CENTER, VOICE (if not already covered by
the existing watchface-and-voice.spec.ts / fault-injection.spec.ts behavior)
=====================================================================
- A sliding-down banner on Amber/Red tier change with inline actionable
  buttons (I'm Okay / Need Help) that call the existing checkin endpoint
  directly — no need to open any other screen to respond to an alert.
- Notification Center (swipe/tap from top): grouped card, one row per
  recent alert/check-in/hydration event, each row a colored circular icon
  badge + label, reusing this same card/badge visual language from Part 1.
- Control Center (swipe/tap from bottom): restyle the existing fault-
  injection buttons as icon-badge toggle rows in this Control Center
  instead of a plain dev-only button row — same /api/worker/:id/fault calls,
  new presentation only.
- Voice sheet: re-house the existing VoiceIncidentRecorder's severity
  selector + MediaRecorder flow inside a bottom sheet that rises over the
  watch screen (Siri-style), rather than its current inline placement —
  same component logic, new container.

TESTING
Extend watchface-and-voice.spec.ts to additionally assert: the carousel's
center-card focus follows the nearest-to-center card on scroll, the
Stop-Work card auto-focuses (full opacity) only when tier is actually Red
(read from the real API response, not a hardcoded fixture), and the SOS
slider does not fire the Need Help action until it reaches the end of the
track (a partial drag must not trigger it — test this explicitly, it's a
safety-relevant false-trigger case).

DELIVERABLES
- WatchShell.tsx, AppCarousel.tsx, updated /worker page composing them
  around the existing WatchFaceGauge/VoiceIncidentRecorder/DemoDrawer.
- Updated DEMO_SCRIPT.md walking through: tap to open app carousel, scroll
  to see the Stop-Work card auto-focus on Red, crown-tap app grid, side-
  button-hold SOS slider, notification banner inline response.
```
