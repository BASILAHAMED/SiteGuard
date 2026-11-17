# SiteGuard — End-to-End Test Automation Prompt

Run this against the Antigravity-built repo once the app is live, so the tests have real routes/APIs to hit.

```
ROLE
You are a QA automation engineer. Write a complete Playwright (TypeScript) test
suite that validates the SiteGuard prototype end-to-end, plus the supporting
scripts/fixtures and a CI workflow to run them. Do not test implementation
details — test observable behavior a judge or a real user would hit.

SCOPE — write one spec file per area:

1. worker-flow.spec.ts
   - Loading /worker shows a Green tier by default with correct baseline copy.
   - Dragging HR/skin-temp/exertion sliders into Amber/Red ranges updates the
     tier, the alert text, and the icon within the UI's stated refresh window.
   - Alert text renders correctly in at least 2 of the 5 supported languages
     when the language selector is changed (assert on actual rendered text,
     not just that an API call fired).
   - "I'm okay" / "Need help" button clicks produce a logged event visible on
     the supervisor view (cross-page assertion).

2. fault-injection.spec.ts
   - Each fault button (BLE disconnect, low battery, sensor noise, GPS loss)
     produces a visible degraded-mode indicator within N seconds.
   - While a fault is active, the risk tier must fall back to
     environment-only scoring — assert the displayed basis-of-score label
     changes accordingly.
   - Clearing the fault restores normal scoring without a stale/stuck state.

3. access-control.spec.ts  [highest priority — this is the governance claim]
   - As a supervisor-role session, assert that no API response or DOM node
     anywhere on /supervisor ever contains a raw HR/skin-temp/exertion value
     for any worker — only tier labels. Fail loudly if a raw vitals field
     leaks into any network response payload (intercept and inspect all
     /api/* responses during the test, not just the rendered DOM).
   - Attempting to call a worker-vitals API endpoint directly with a
     supervisor-role token must return 403/redacted data, not raw values.

4. compliance-report.spec.ts
   - Generating the report for a day with simulated Amber/Red events produces
     a PDF/export containing the correct break-window compliance calculation
     against the UAE Midday Working Break window (12:30-15:00).
   - A day with zero violations produces a report stating full compliance,
     not an empty/broken report.

5. risk-engine.unit.spec.ts  (plain unit tests, not Playwright, use
   Vitest/Jest — put in a separate file)
   - Feed the PSI function known reference input/output pairs (derive at least
     5 cases spanning Green/Amber/Red) and assert exact tier boundaries.
   - Boundary tests at the exact tier cutoffs (score = 3.0, 4.0, 6.0, 7.0) to
     catch off-by-one errors.
   - Test graceful handling of missing/null physiological input (must not
     crash — must fall back to environment-only, matching fault-injection
     behavior).

6. validation-backtest.spec.ts
   - Run the backtest script against the fixture synthetic cohort and assert
     the computed sensitivity/false-alarm/lead-time numbers are deterministic
     given a fixed random seed, and fall within a sane documented range (not
     100%, not 0% — flag the test if someone "improves" the model into an
     unrealistic perfect score).

7. predictive-forecast.unit.spec.ts  [the "prevent incidents before they
   happen" claim lives or dies on this file — test it harder than anything
   else in the suite]
   - Forecast-engine math: feed a fixed 10-15 minute HR/skin-temp/exertion
     trend fixture and assert the predicted PSI at t+15 and t+30 matches a
     hand-computed reference value for the chosen extrapolation method
     (linear/quadratic), for at least 5 fixtures spanning a flat trend, a
     rising trend, a falling trend, a noisy/oscillating trend, and a trend
     that crosses a tier boundary partway through the window.
   - Cold-start / insufficient-data fallback: feeding fewer than the required
     minutes of trend data (e.g., right after a simulated BLE reconnect or a
     cleared fault) must return an explicit "insufficient trend data" result,
     never a fabricated prediction — assert on the actual returned value/flag,
     not just that no error was thrown.
   - LLM boundary enforcement: assert, by inspecting the actual function call
     arguments/mocked LLM request, that the forecast NUMBER passed to the
     contextual-reasoning (Gemini/Groq) layer always originates from the
     deterministic forecast engine's output, never from a value the LLM
     itself generated. If the codebase ever lets the LLM call return a PSI
     number that gets rendered without going through the forecast engine,
     this test must fail — this is a safety-architecture invariant, not a
     style preference.
   - LLM-unavailable fallback: if the Gemini/Groq call fails or times out,
     the UI must still show the deterministic forecast (tier + confidence
     interval) with a generic non-LLM-generated action label, rather than a
     blank panel or a stale cached recommendation.

8. forecast-validation.spec.ts
   - Run the prospective backtest (predict at t, compare to actual at t+15
     and t+30 once simulated time advances) against the fixture cohort and
     assert the reported MAE/RMSE and predicted-tier-vs-actual-tier accuracy
     are deterministic given a fixed seed and fall within a documented sane
     range — flag the test if a change makes the forecast implausibly
     accurate (a near-zero error on a 15-30 minute physiological forecast is
     a red flag for a leaked future value, not a win).
   - The numbers rendered on /forecast-validation must match the independently
     recomputed values exactly (catches a stale/cached page, same pattern as
     the decision-layer check elsewhere in this suite).

9. e2e-demo-smoke.spec.ts
   - A single end-to-end script that replays the actual 3-minute demo script
     from the README (worker heats up -> predicted-crossing banner fires ->
     simulated clock advances -> actual crossing happens as predicted ->
     supervisor acknowledges -> fault injected -> degrades -> clears ->
     compliance report generated) as one continuous test, with a screenshot
     taken at each step saved to test-results/ for a sanity-check gallery
     before any live presentation.

FIXTURES & DATA
- Generate a fixtures/ folder with: a fixed synthetic physiological cohort
  (small, checked into the repo, NOT regenerated per test run), a fixed
  historical WBGT day, and a set of known PSI input/output pairs with the
  source/derivation documented in a comment.

CI
- Add a GitHub Actions workflow that runs unit tests on every push and the
  full Playwright suite on PRs to main, uploading the screenshot gallery and a
  test-results summary as a build artifact.

OUTPUT
- All spec files, fixtures, the CI YAML, and a TESTING.md summarizing what's
  covered, what's deliberately out of scope (e.g., real hardware integration,
  load testing beyond N simulated workers), and how to run everything locally
  with one command.
```
