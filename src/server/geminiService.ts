import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  BacktestReport,
  BreakRecord,
  EnvironmentalObservation,
  ForecastOutput,
  IncidentLogEntry,
  RiskAssessment,
  SupportedLanguage,
  SyntheticWorkerDay,
  WorkerAlertCopy,
  WorkerContext,
} from '../shared/types.ts';

/**
 * Server-Side Gemini API Service for SiteGuard (GenOS Team).
 *
 * Explicitly separates the 5 Gemini Use Cases:
 *  1. explainWorkerRisk         — Use Case 1: Plain-language, non-alarming explanation + action (gemini-4-hydrogen)
 *  2. translateWorkerAlert      — Use Case 2: Multilingual rendering into en/hi/ur/bn/tl, cached (gemini-4-hydrogen)
 *  3. generateSyntheticCohort   — Use Case 3: Synthetic physiological cohort generation for validation (gemini-4-hydrogen)
 *  4. generateComplianceNarrative — Use Case 4: Plain-language UAE Midday Break report summary (gemini-4-hydrogen)
 *  5. contextualizeForecast     — Use Case 5: Qualitative contextualization of deterministic forecast numbers (gemini-4-hydrogen)
 *
 * SAFETY INVARIANT: Gemini NEVER computes numeric PSI scores or numeric forecasts.
 * All numeric risk & forecast outputs come strictly from deterministic engines.
 */

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

// Server-side translation & explanation cache so repeated renders / small ticks never re-call Gemini
const alertCache = new Map<string, Record<SupportedLanguage, WorkerAlertCopy>>();
const fallbackCooldown = new Map<string, { data: Record<SupportedLanguage, WorkerAlertCopy>; expiresAt: number }>();
const inFlightAlerts = new Map<string, Promise<Record<SupportedLanguage, WorkerAlertCopy>>>();
let dailyQuotaCooldownUntil = 0;
let transientCooldownUntil = 0;
let lastGeminiDiagnostic: string = 'ok';

export function clearAlertTranslationCache(): void {
  alertCache.clear();
  fallbackCooldown.clear();
}

export function resetGeminiCircuitBreaker(): void {
  dailyQuotaCooldownUntil = 0;
  transientCooldownUntil = 0;
}

export function getLastGeminiDiagnostic(): string {
  return lastGeminiDiagnostic;
}

function isDailyQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('PerDay') || msg.includes('free_tier_requests') || msg.includes('GenerateRequestsPerDay');
}

function withTimeout<T>(p: Promise<T>, ms = 25000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isDailyQuotaError(err)) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('fetch failed');
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 900 * attempt));
    }
  }
  throw lastErr;
}

function makeAlertCopySchema() {
  return {
    type: Type.OBJECT,
    properties: {
      headline: { type: Type.STRING },
      explanation: { type: Type.STRING },
      action: { type: Type.STRING },
      proactiveForecastNote: { type: Type.STRING },
    },
    required: ['headline', 'explanation', 'action', 'proactiveForecastNote'],
  };
}

function buildCacheKey(assessment: RiskAssessment, forecast: ForecastOutput, context: WorkerContext): string {
  const scoreBand = Math.floor(assessment.compositeScore * 2) / 2;
  const amberBucket =
    forecast.status === 'ready' && forecast.projectedAmberCrossingMin !== null
      ? Math.round(forecast.projectedAmberCrossingMin / 3) * 3
      : 'none';
  const redBucket =
    forecast.status === 'ready' && forecast.projectedRedCrossingMin !== null
      ? Math.round(forecast.projectedRedCrossingMin / 3) * 3
      : 'none';
  const slopeDir =
    forecast.status !== 'ready' || forecast.slopePerMin === null
      ? 'na'
      : forecast.slopePerMin > 0.015
        ? 'up'
        : forecast.slopePerMin < -0.015
          ? 'down'
          : 'flat';
  return [
    'v2-etaguard',
    assessment.tier,
    assessment.scoringMode,
    assessment.gpsDegraded ? 'nogps' : 'gps',
    scoreBand,
    context.ppeLevel,
    forecast.status,
    forecast.predictedTier15 ?? 'none',
    amberBucket,
    redBucket,
    slopeDir,
  ].join('|');
}

const NO_CROSSING_PROJECTED_COPY: Record<SupportedLanguage, string> = {
  en: 'No Amber or Red threshold crossing is currently projected on the current trajectory.',
  hi: 'वर्तमान रुझान के अनुसार अभी अंबर या गंभीर स्तर पार होने का कोई अनुमान नहीं है।',
  ur: 'موجودہ رجحان کے مطابق فی الحال احتیاطی یا شدید حد عبور ہونے کا کوئی امکان متوقع نہیں ہے۔',
  bn: 'বর্তমান প্রবণতা অনুযায়ী এখনই সতর্ক বা গুরুতর সীমা অতিক্রমের কোনো পূর্বাভাস নেই।',
  tl: 'Sa kasalukuyang takbo, walang inaasahang paglampas sa Amber o Red na antas.',
};

const INSUFFICIENT_TREND_COPY: Record<SupportedLanguage, string> = {
  en: 'Insufficient trend data for forecast window — follow standard scheduled breaks.',
  hi: 'पूर्वानुमान के लिए पर्याप्त डेटा नहीं है — निर्धारित समय पर नियमित आराम करें।',
  ur: 'پیش گوئی کے لیے ناکافی ڈیٹا — مقررہ اوقات کے مطابق باقاعدہ وقفہ لیں۔',
  bn: 'পূর্বাভাসের জন্য পর্যাপ্ত ট্রেন্ড ডেটা নেই — নির্ধারিত বিরতি মেনে চলুন।',
  tl: 'Kulang pa ang trend data para sa forecast — sundin ang nakatakdang pahinga.',
};

function buildLocalizedProactiveNote(
  lang: SupportedLanguage,
  context: WorkerContext,
  assessment: RiskAssessment,
  forecast: ForecastOutput
): string | null {
  if (forecast.status === 'insufficient_trend_data') {
    return INSUFFICIENT_TREND_COPY[lang];
  }

  const amberEta = forecast.projectedAmberCrossingMin;
  const redEta = forecast.projectedRedCrossingMin;

  if (assessment.tier === 'Green' && amberEta !== null && amberEta > 0) {
    switch (lang) {
      case 'en':
        return `At current pace, Amber heat strain threshold likely in ~${amberEta} min — start your shade & hydration break early rather than waiting for ${context.plannedBreakTime}.`;
      case 'hi':
        return `वर्तमान गति पर ~${amberEta} मिनट में अंबर स्तर संभावित — ${context.plannedBreakTime} का इंतजार किए बिना अभी पानी का ब्रेक शुरू करें।`;
      case 'ur':
        return `موجودہ رفتار پر ~${amberEta} منٹ میں احتیاطی حد متوقع ہے — ${context.plannedBreakTime} سے پہلے ابھی سائے میں وقفہ لیں۔`;
      case 'bn':
        return `বর্তমান গতিতে ~${amberEta} মিনিটে সতর্ক সীমা আসতে পারে — ${context.plannedBreakTime}-এর আগে এখনই ছায়ায় বিরতি নিন।`;
      case 'tl':
        return `Sa kasalukuyang bilis, maaaring umabot sa Amber sa ~${amberEta} min — mag-break na nang maaga bago mag-${context.plannedBreakTime}.`;
    }
  }

  if (assessment.tier === 'Amber' && redEta !== null && redEta > 0) {
    switch (lang) {
      case 'en':
        return `Heat strain rising; Red stop-work threshold projected in ~${redEta} min unless you rest in shade now.`;
      case 'hi':
        return `गर्मी का दबाव बढ़ रहा है; यदि अभी छाया में आराम नहीं किया तो ~${redEta} मिनट में गंभीर स्तर संभावित है।`;
      case 'ur':
        return `گرمی کا دباؤ بڑھ رہا ہے؛ ابھی سائے میں آرام نہ کرنے پر ~${redEta} منٹ میں شدید حد متوقع ہے۔`;
      case 'bn':
        return `তাপচাপ বাড়ছে; এখনই ছায়ায় বিশ্রাম না নিলে ~${redEta} মিনিটে গুরুতর সীমা পৌঁছাতে পারে।`;
      case 'tl':
        return `Tumataas ang heat strain; inaasahan ang Red stop-work threshold sa ~${redEta} min maliban kung magpahinga sa lilim ngayon.`;
    }
  }

  if (amberEta === null && redEta === null) {
    return assessment.tier === 'Red' ? null : NO_CROSSING_PROJECTED_COPY[lang];
  }

  return null;
}

export function buildDeterministicFallback(
  context: WorkerContext,
  assessment: RiskAssessment,
  forecast: ForecastOutput
): Record<SupportedLanguage, WorkerAlertCopy> {
  const degradedNote =
    assessment.scoringMode === 'environment_only_degraded'
      ? ` Sensor fault (${assessment.degradedReason}); using outdoor heat index only.`
      : '';

  const baseEn: WorkerAlertCopy =
    assessment.tier === 'Red'
      ? {
          headline: 'STOP WORK NOW — COOL DOWN',
          explanation: `High heat strain detected in ${context.zone}.${degradedNote}`,
          action: 'Move to shaded AC rest area, loosen PPE, and drink cool water immediately.',
          proactiveForecastNote: buildLocalizedProactiveNote('en', context, assessment, forecast),
          source: 'template_fallback',
          cached: false,
        }
      : assessment.tier === 'Amber'
        ? {
            headline: 'REST IN SHADE & HYDRATE',
            explanation: `Moderate heat strain building in ${context.zone}.${degradedNote}`,
            action: 'Take a mandatory 15-minute shaded rest break and drink 300 ml water now.',
            proactiveForecastNote: buildLocalizedProactiveNote('en', context, assessment, forecast),
            source: 'template_fallback',
            cached: false,
          }
        : {
            headline: 'SAFE TO WORK — HYDRATE',
            explanation: `Heat strain is within safe limits in ${context.zone}.${degradedNote}`,
            action: 'Keep steady pace and drink water every 20 minutes.',
            proactiveForecastNote: buildLocalizedProactiveNote('en', context, assessment, forecast),
            source: 'template_fallback',
            cached: false,
          };

  const hi: WorkerAlertCopy =
    assessment.tier === 'Red'
      ? {
          headline: 'काम तुरंत रोकें — छाया में जाएं',
          explanation: `${context.zone} में अधिक गर्मी का दबाव है।`,
          action: 'तुरंत ठंडी छाया वाली जगह पर जाएं, भारी पीपीई ढीली करें और पानी पिएं।',
          proactiveForecastNote: buildLocalizedProactiveNote('hi', context, assessment, forecast),
          source: 'template_fallback',
          cached: false,
        }
      : assessment.tier === 'Amber'
        ? {
            headline: 'छाया में आराम करें और पानी पिएं',
            explanation: `${context.zone} में शरीर पर गर्मी का असर बढ़ रहा है।`,
            action: 'अभी 15 मिनट छाया में रुकें और ठंडा पानी पिएं।',
            proactiveForecastNote: buildLocalizedProactiveNote('hi', context, assessment, forecast),
            source: 'template_fallback',
            cached: false,
          }
        : {
            headline: 'स्थिति सामान्य — पानी पीते रहें',
            explanation: `${context.zone} में गर्मी का स्तर सुरक्षित सीमा में है।`,
            action: 'सामान्य गति से काम जारी रखें और हर 20 मिनट में पानी पिएं।',
            proactiveForecastNote: buildLocalizedProactiveNote('hi', context, assessment, forecast),
            source: 'template_fallback',
            cached: false,
          };

  const ur: WorkerAlertCopy =
    assessment.tier === 'Red'
      ? {
          headline: 'کام فوراً روکیں — سائے میں جائیں',
          explanation: `${context.zone} میں شدید گرمی کا دباؤ ہے۔`,
          action: 'فوراً ٹھنڈی جگہ پر آرام کریں، حفاظتی لباس ڈھیلا کریں اور پانی پئیں۔',
          proactiveForecastNote: buildLocalizedProactiveNote('ur', context, assessment, forecast),
          source: 'template_fallback',
          cached: false,
        }
      : assessment.tier === 'Amber'
        ? {
            headline: 'سائے میں آرام کریں اور پانی پئیں',
            explanation: `${context.zone} میں گرمی کا دباؤ بڑھ رہا ہے۔`,
            action: 'ابھی 15 منٹ سائے میں آرام کریں اور ٹھنڈا پانی پئیں۔',
            proactiveForecastNote: buildLocalizedProactiveNote('ur', context, assessment, forecast),
            source: 'template_fallback',
            cached: false,
          }
        : {
            headline: 'حالت محفوظ ہے — پانی پیتے رہیں',
            explanation: `${context.zone} میں گرمی کی سطح محفوظ حد میں ہے۔`,
            action: 'معمول کے مطابق کام جاری رکھیں اور ہر 20 منٹ بعد پانی پئیں۔',
            proactiveForecastNote: buildLocalizedProactiveNote('ur', context, assessment, forecast),
            source: 'template_fallback',
            cached: false,
          };

  const bn: WorkerAlertCopy =
    assessment.tier === 'Red'
      ? {
          headline: 'এখনই কাজ বন্ধ করুন — ছায়ায় যান',
          explanation: `${context.zone}-এ অতিরিক্ত তাপজনিত চাপ দেখা যাচ্ছে।`,
          action: 'এখনই ঠান্ডা বিশ্রামাগারে যান, ভারী পিপিই আলগা করুন এবং পানি পান করুন।',
          proactiveForecastNote: buildLocalizedProactiveNote('bn', context, assessment, forecast),
          source: 'template_fallback',
          cached: false,
        }
      : assessment.tier === 'Amber'
        ? {
            headline: 'ছায়ায় বিশ্রাম নিন ও পানি পান করুন',
            explanation: `${context.zone}-এ তাপজনিত চাপ বাড়ছে।`,
            action: 'এখন ১৫ মিনিট ছায়ায় বিশ্রাম নিন এবং ঠান্ডা পানি পান করুন।',
            proactiveForecastNote: buildLocalizedProactiveNote('bn', context, assessment, forecast),
            source: 'template_fallback',
            cached: false,
          }
        : {
            headline: 'কাজ নিরাপদ — পানি পান চালিয়ে যান',
            explanation: `${context.zone}-এ তাপচাপ নিরাপদ সীমার মধ্যে আছে।`,
            action: 'স্বাভাবিক গতিতে কাজ করুন এবং প্রতি ২০ মিনিটে পানি পান করুন।',
            proactiveForecastNote: buildLocalizedProactiveNote('bn', context, assessment, forecast),
            source: 'template_fallback',
            cached: false,
          };

  const tl: WorkerAlertCopy =
    assessment.tier === 'Red'
      ? {
          headline: 'ITIGIL ANG TRABAHO — MAGPALAMIG',
          explanation: `Mataas ang heat strain sa ${context.zone}.`,
          action: 'Pumunta agad sa malamig at lilim na lugar, luwagan ang PPE, at uminom ng tubig.',
          proactiveForecastNote: buildLocalizedProactiveNote('tl', context, assessment, forecast),
          source: 'template_fallback',
          cached: false,
        }
      : assessment.tier === 'Amber'
        ? {
            headline: 'MAGPAHINGA SA LILIM AT UMINOM',
            explanation: `Tumataas ang heat strain sa ${context.zone}.`,
            action: 'Magpahinga nang 15 minuto sa lilim at uminom ng malamig na tubig ngayon.',
            proactiveForecastNote: buildLocalizedProactiveNote('tl', context, assessment, forecast),
            source: 'template_fallback',
            cached: false,
          }
        : {
            headline: 'LIGTAS ANG LAGAY — UMINOM NG TUBIG',
            explanation: `Nasa ligtas na antas ang heat strain sa ${context.zone}.`,
            action: 'Ipagpatuloy ang maayos na ritmo at uminom ng tubig tuwing 20 minuto.',
            proactiveForecastNote: buildLocalizedProactiveNote('tl', context, assessment, forecast),
            source: 'template_fallback',
            cached: false,
          };

  return { en: baseEn, hi, ur, bn, tl };
}

function normalizeUnicodeDigits(input: string): string {
  return input.replace(/[\u0966-\u096F\u0660-\u0669\u06F0-\u06F9\u09E6-\u09EF]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0x0966 && code <= 0x096f) return String(code - 0x0966);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    if (code >= 0x09e6 && code <= 0x09ef) return String(code - 0x09e6);
    return ch;
  });
}

function extractEtaMinutesFromText(raw: string, stripHydrationBreaks: boolean): number[] {
  let text = normalizeUnicodeDigits(raw)
    .replace(/\bt\s*\+\s*(?:15|30)\b/gi, ' ')
    .replace(/\b30[-\s]+min(?:ute)?s?\s+(?:forecast\s+)?window\b/gi, ' ');

  if (stripHydrationBreaks) {
    // Do not confuse routine hydration/rest directives ("every 20 min", "15-min rest break") with crossing ETAs
    text = text
      .replace(/(?:every|per|प्रत्येक|हर|ہر|প্রতি|tuwing)\s+\d+\s*(?:min(?:ute)?s?|m\b|मिनट|منٹ|مِنٹ|মিনিট|minuto)/gi, ' ')
      .replace(/\b\d+[-\s]+(?:min(?:ute)?s?|m\b|मिनट|منٹ|مِنٹ|মিনিট|minuto)\s+(?:rest|shade|break|shaded)/gi, ' ');
  }

  const values: number[] = [];
  const unitRegex = /~?\s*(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?|m\b|मिनट|منٹ|مِنٹ|মিনিট|minuto)/gi;
  let m: RegExpExecArray | null;
  while ((m = unitRegex.exec(text)) !== null) {
    const val = Number(m[1]);
    if (Number.isFinite(val)) values.push(val);
  }

  const crossingPhraseRegex =
    /(?:amber|red|threshold|limit|अंबर|गंभीर|امبر|سرخ|সতর্ক|গুরুতর)\s+(?:in|within|after|sa)\s+~?(\d+(?:\.\d+)?)\b/gi;
  while ((m = crossingPhraseRegex.exec(text)) !== null) {
    const val = Number(m[1]);
    if (Number.isFinite(val)) values.push(val);
  }

  return values;
}

const THRESHOLD_CROSSING_INTENT_REGEX =
  /amber|red|threshold|cross|reach|projected|forecast|escalat|stop-work|अंबर|गंभीर|संभावित|امبر|متوقع|سنگین|সতর্ক|গুরুতর|সম্ভাব্য|inaasahan|umabot/i;

/**
 * SERVER-SIDE RESPONSIBLE AI GUARD:
 * Validates LLM-generated alert text across ALL 5 languages against deterministic ForecastOutput.
 * If Gemini fabricates a crossing minute ETA when ETAs are null/falling, or diverges >±2 min
 * from projectedAmberCrossingMin/projectedRedCrossingMin, the offending field is discarded
 * and replaced with the deterministic template built directly from structured engine fields.
 */
export function enforceDeterministicForecastEtaGuard(
  copyMap: Record<SupportedLanguage, WorkerAlertCopy>,
  forecast: ForecastOutput,
  fallbackMap: Record<SupportedLanguage, WorkerAlertCopy>
): Record<SupportedLanguage, WorkerAlertCopy> {
  const allowedEtas: number[] = [];
  const positiveSlope = forecast.slopePerMin === null || forecast.slopePerMin > 0.015;
  if (forecast.status === 'ready' && positiveSlope) {
    if (forecast.projectedAmberCrossingMin !== null && forecast.projectedAmberCrossingMin > 0) {
      allowedEtas.push(forecast.projectedAmberCrossingMin);
    }
    if (forecast.projectedRedCrossingMin !== null && forecast.projectedRedCrossingMin > 0) {
      allowedEtas.push(forecast.projectedRedCrossingMin);
    }
  }

  const isClaimAllowed = (minutesClaim: number): boolean =>
    allowedEtas.some((eta) => Math.abs(minutesClaim - eta) <= 2);

  const sanitized = { ...copyMap };
  const langs: SupportedLanguage[] = ['en', 'hi', 'ur', 'bn', 'tl'];
  const violations: string[] = [];

  for (const lang of langs) {
    const entry = sanitized[lang];
    const fb = fallbackMap[lang];
    let nextEntry = { ...entry };

    // 1. Strict check on proactiveForecastNote
    if (nextEntry.proactiveForecastNote) {
      const noteClaims = extractEtaMinutesFromText(nextEntry.proactiveForecastNote, false);
      const invalidNote =
        (allowedEtas.length === 0 && noteClaims.length > 0) ||
        noteClaims.some((n) => !isClaimAllowed(n));

      if (invalidNote) {
        violations.push(`${lang}.proactiveForecastNote(${noteClaims.join(',')})`);
        nextEntry = {
          ...nextEntry,
          proactiveForecastNote: fb.proactiveForecastNote,
        };
      }
    }

    // 2. Check headline, explanation, action for fabricated time-to-threshold ETAs
    for (const field of ['headline', 'explanation', 'action'] as const) {
      const val = nextEntry[field];
      const claims = extractEtaMinutesFromText(val, true);
      if (claims.length === 0) continue;

      const hasCrossingContext = THRESHOLD_CROSSING_INTENT_REGEX.test(val);
      const hasInvalidClaim = claims.some((n) => !isClaimAllowed(n));
      if (hasInvalidClaim && (hasCrossingContext || allowedEtas.length === 0)) {
        violations.push(`${lang}.${field}(${claims.join(',')})`);
        nextEntry = {
          ...nextEntry,
          [field]: fb[field],
        };
      }
    }

    sanitized[lang] = nextEntry;
  }

  if (violations.length > 0) {
    console.warn(
      `[GeminiService][ETA-Guard] Replaced fabricated/inconsistent forecast ETAs (${violations.join('; ')}); allowedEtas=[${allowedEtas.join(',')}]`
    );
  }

  return sanitized;
}

/**
 * USE CASE 1 + 5 + 2 Combined & Cached Pipeline (Single gemini-4-hydrogen Call):
 * 1) Explains PSI + environmental factors & contextualizes deterministic forecast (Use Case 1 & 5)
 * 2) Renders natural translations in English, Hindi, Urdu, Bengali, and Tagalog (Use Case 2)
 */
async function explainAndTranslateWorkerAlert(
  ai: GoogleGenAI,
  context: WorkerContext,
  assessment: RiskAssessment,
  forecast: ForecastOutput,
  env: EnvironmentalObservation
): Promise<Record<SupportedLanguage, WorkerAlertCopy>> {
  const structuredForecast = {
    status: forecast.status,
    psiNow: forecast.psiNow,
    psi15Point: forecast.psi15?.point ?? null,
    predictedTier15: forecast.predictedTier15,
    psi30Point: forecast.psi30?.point ?? null,
    predictedTier30: forecast.predictedTier30,
    projectedAmberCrossingMin: forecast.status === 'ready' ? forecast.projectedAmberCrossingMin : null,
    projectedRedCrossingMin: forecast.status === 'ready' ? forecast.projectedRedCrossingMin : null,
    slopePerMin: forecast.slopePerMin,
  };

  const forecastSummary =
    forecast.status === 'ready'
      ? `Deterministic forecast: current=${forecast.psiNow}/10, t+15=${forecast.psi15?.point} (90% CI ${forecast.psi15?.low}–${forecast.psi15?.high}, tier ${forecast.predictedTier15}), t+30=${forecast.psi30?.point} (tier ${forecast.predictedTier30}), projected Amber crossing in ${forecast.projectedAmberCrossingMin ?? 'none'} min, Red crossing in ${forecast.projectedRedCrossingMin ?? 'none'} min.`
      : `Forecast status: insufficient trend data (${forecast.reason}). Do not invent a crossing time.`;

  const prompt = `You are SiteGuard's worker safety communicator for UAE outdoor industrial crews.
Generate a calm, clear, non-alarming alert in English (en), plus accurate natural everyday translations in Hindi (hi), Urdu (ur), Bengali (bn), and Tagalog (tl). Keep numbers and units exact.

Worker context: Role=${context.roleLabel}, Zone=${context.zone}, PPE=${context.ppeLevel}, Acclimatization=${context.acclimatizationDays} days, Hydration count=${context.hydrationCount}, Planned break=${context.plannedBreakTime}.
Current environment: Air ${env.airTempC}°C, Outdoor WBGT ${env.wbgtC}°C, UAE Midday Break active=${env.inUaeMiddayBreakWindow}.
Deterministic risk assessment: Tier=${assessment.tier}, Composite=${assessment.compositeScore}/10, Mode=${assessment.scoringMode}${assessment.degradedReason ? ` (Degraded due to: ${assessment.degradedReason})` : ''}.
Factors: ${assessment.contributingFactors.join('; ')}.
${forecastSummary}
Structured forecast JSON: ${JSON.stringify(structuredForecast)}

STRICT SAFETY RULES FOR THRESHOLD ETAs (NEVER VIOLATE):
1. projectedAmberCrossingMin and projectedRedCrossingMin above are the ONLY valid threshold-crossing times.
2. When BOTH projectedAmberCrossingMin and projectedRedCrossingMin are null (or slopePerMin <= 0.015), you MUST NOT mention any crossing minute number or invent an ETA like "in 1 minute" or "in 36 minutes" in ANY field. Instead, state clearly that no Amber/Red crossing is currently projected within the 30-minute window (or return "" if Red tier).
3. When forecast.status is "insufficient_trend_data", never state any minute ETA.
4. headline, explanation, and action must never state a crossing ETA that contradicts projectedAmberCrossingMin / projectedRedCrossingMin.

For each language (en, hi, ur, bn, tl), provide:
- headline: max 6 words, uppercase clarity, calm safety directive
- explanation: 1 short sentence explaining why in plain words (no jargon like "Moran PSI")
- action: 1 concrete immediate action sentence
- proactiveForecastNote: if projectedAmberCrossingMin or projectedRedCrossingMin is a positive integer, write 1 specific proactive sentence citing that exact minute value with upcoming break/hydration context; if both are null (or negative/flat trend), explicitly write "No Amber/Red crossing currently projected" translated naturally (or "" in Red tier).`;

  const res = await withRetry(() =>
    withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              en: makeAlertCopySchema(),
              hi: makeAlertCopySchema(),
              ur: makeAlertCopySchema(),
              bn: makeAlertCopySchema(),
              tl: makeAlertCopySchema(),
            },
            required: ['en', 'hi', 'ur', 'bn', 'tl'],
          },
        },
      }),
      8000
    )
  );

  const parsed = JSON.parse((res.text ?? '{}').trim()) as Record<
    SupportedLanguage,
    {
      headline: string;
      explanation: string;
      action: string;
      proactiveForecastNote?: string;
    }
  >;

  const normalize = (entry: {
    headline?: string;
    explanation?: string;
    action?: string;
    proactiveForecastNote?: string;
  }): WorkerAlertCopy => {
    const note = entry?.proactiveForecastNote?.trim();
    return {
      headline: entry?.headline || 'CHECK HEAT STATUS',
      explanation: entry?.explanation || assessment.contributingFactors[0] || 'Monitor heat load.',
      action: entry?.action || assessment.recommendedAction,
      proactiveForecastNote: note ? note : null,
      source: 'gemini',
      cached: false,
    };
  };

  const rawMap: Record<SupportedLanguage, WorkerAlertCopy> = {
    en: normalize(parsed.en),
    hi: normalize(parsed.hi),
    ur: normalize(parsed.ur),
    bn: normalize(parsed.bn),
    tl: normalize(parsed.tl),
  };

  const fallbackMap = buildDeterministicFallback(context, assessment, forecast);
  return enforceDeterministicForecastEtaGuard(rawMap, forecast, fallbackMap);
}

export async function getMultilingualWorkerAlert(
  context: WorkerContext,
  assessment: RiskAssessment,
  forecast: ForecastOutput,
  env: EnvironmentalObservation
): Promise<Record<SupportedLanguage, WorkerAlertCopy>> {
  const fallback = buildDeterministicFallback(context, assessment, forecast);
  const key = buildCacheKey(assessment, forecast, context);
  const existing = alertCache.get(key);
  if (existing) {
    // Defensive re-guard even on cached entries
    const guarded = enforceDeterministicForecastEtaGuard(existing, forecast, fallback);
    const cachedResult = { ...guarded };
    for (const lang of Object.keys(cachedResult) as SupportedLanguage[]) {
      cachedResult[lang] = { ...cachedResult[lang], cached: true };
    }
    return cachedResult;
  }

  const cooldown = fallbackCooldown.get(key);
  if (cooldown && cooldown.expiresAt > Date.now()) {
    return cooldown.data;
  }

  const ai = getClient();
  if (!ai) {
    lastGeminiDiagnostic = 'no_api_key';
    return fallback;
  }

  if (Date.now() < dailyQuotaCooldownUntil || Date.now() < transientCooldownUntil) {
    lastGeminiDiagnostic = Date.now() < dailyQuotaCooldownUntil ? 'quota_exhausted' : 'fallback';
    return fallback;
  }

  const pending = inFlightAlerts.get(key);
  if (pending) {
    return pending;
  }

  const run = (async (): Promise<Record<SupportedLanguage, WorkerAlertCopy>> => {
    try {
      const result = await explainAndTranslateWorkerAlert(ai, context, assessment, forecast, env);
      alertCache.set(key, result);
      fallbackCooldown.delete(key);
      transientCooldownUntil = 0;
      lastGeminiDiagnostic = 'ok';
      return result;
    } catch (err) {
      if (isDailyQuotaError(err)) {
        dailyQuotaCooldownUntil = Date.now() + 5 * 60_000;
        lastGeminiDiagnostic = 'quota_exhausted';
      } else {
        transientCooldownUntil = Date.now() + 30_000;
        lastGeminiDiagnostic = 'fallback';
        console.info(`[GeminiService] Fallback templates applied (${err instanceof Error ? err.message : String(err)})`);
      }
      fallbackCooldown.set(key, { data: fallback, expiresAt: Date.now() + 60_000 });
      return fallback;
    } finally {
      inFlightAlerts.delete(key);
    }
  })();

  inFlightAlerts.set(key, run);
  return run;
}

/**
 * USE CASE 6: Immediate Worker Voice Safety Incident Transcription (gemini-3.5-transcribe).
 * Accepts recorded audio (base64 + mimeType) and transcribes spoken safety incident reports
 * in en/hi/ur/bn/tl cleanly on the server, falling back gracefully if quota-exhausted or offline.
 */
export async function transcribeWorkerVoiceIncident(params: {
  audioBase64?: string;
  mimeType?: string;
  language?: SupportedLanguage;
  fallbackTranscript?: string;
}): Promise<{
  transcript: string;
  source: 'gemini_transcribe' | 'browser_speech' | 'manual_note';
}> {
  const cleanFallback = (params.fallbackTranscript ?? '').trim();
  const base64Data = (params.audioBase64 ?? '').replace(/^data:[^;]+;base64,/, '').trim();
  const mimeType = (params.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';

  const ai = getClient();
  if (base64Data && ai && Date.now() >= dailyQuotaCooldownUntil) {
    try {
      const res = await withRetry(() =>
        withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
                {
                  text: `Transcribe this short industrial worker safety incident voice note accurately (preferred language hint: ${params.language ?? 'en'}). Return only the clean plain-text transcript without timestamps or speaker labels.`,
                },
              ],
            },
          }),
          20000
        )
      );
      const transcribed = (res.text ?? '').trim();
      if (transcribed.length > 0) {
        lastGeminiDiagnostic = 'ok';
        return { transcript: transcribed.slice(0, 500), source: 'gemini_transcribe' };
      }
    } catch (err) {
      if (isDailyQuotaError(err)) {
        dailyQuotaCooldownUntil = Date.now() + 5 * 60_000;
        lastGeminiDiagnostic = 'quota_exhausted';
      } else {
        lastGeminiDiagnostic = 'fallback';
        console.info(
          `[GeminiService] Voice transcription fallback (${err instanceof Error ? err.message : String(err)})`
        );
      }
    }
  }

  if (cleanFallback.length > 0) {
    return {
      transcript: cleanFallback.slice(0, 500),
      source: 'browser_speech',
    };
  }

  return {
    transcript: 'Worker submitted an immediate voice safety incident alert for supervisor review.',
    source: 'manual_note',
  };
}

/**
 * USE CASE 3: Synthetic Physiological Cohort Generation via Gemini (gemini-4-hydrogen).
 * Generates worker-day parameter profiles calibrated to cross ACGIH/NIOSH thresholds,
 * tagged explicitly with `source: 'SYNTHETIC_PHYSIOLOGICAL_COHORT'` and `generator: 'gemini_synthesized'`.
 */
export async function generateSyntheticCohortViaGemini(
  count = 12
): Promise<{ cohort: SyntheticWorkerDay[]; source: 'gemini' | 'deterministic_fallback' }> {
  const ai = getClient();
  if (!ai || Date.now() < dailyQuotaCooldownUntil) {
    if (Date.now() < dailyQuotaCooldownUntil) {
      lastGeminiDiagnostic = 'quota_exhausted';
    }
    return { cohort: [], source: 'deterministic_fallback' };
  }

  try {
    const prompt = `Generate ${count} realistic industrial heat-stress worker-day profiles for a UAE summer construction validation cohort (08:00–12:00 GST).
Roughly 65% should gradually escalate across ACGIH/NIOSH thresholds (Amber at ~90–140 min, Red PSI>=7.0 at ~130–200 min) and 35% should stay safely paced.
Return JSON array of worker profiles with: roleLabel, ppeLevel ("Standard Coverall" | "FR / Arc-Flash" | "Chemical / Tyvek"), acclimatizationDays (1..25), ageYears (22..52), hr0 (62..82), tc0 (36.6..36.9), peakHr (120..182), peakSkinTempC (34.8..37.9), escalationMinute (45..160 or 999 if no escalation).`;

    const res = await withRetry(() =>
      withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              roleLabel: { type: Type.STRING },
              ppeLevel: { type: Type.STRING },
              acclimatizationDays: { type: Type.INTEGER },
              ageYears: { type: Type.INTEGER },
              hr0: { type: Type.INTEGER },
              tc0: { type: Type.NUMBER },
              peakHr: { type: Type.INTEGER },
              peakSkinTempC: { type: Type.NUMBER },
              escalationMinute: { type: Type.INTEGER },
            },
            required: [
              'roleLabel',
              'ppeLevel',
              'acclimatizationDays',
              'ageYears',
              'hr0',
              'tc0',
              'peakHr',
              'peakSkinTempC',
                  'escalationMinute',
                ],
              },
            },
          },
        }),
        25000
      )
    );

    const specs = JSON.parse((res.text ?? '[]').trim()) as Array<{
      roleLabel: string;
      ppeLevel: string;
      acclimatizationDays: number;
      ageYears: number;
      hr0: number;
      tc0: number;
      peakHr: number;
      peakSkinTempC: number;
      escalationMinute: number;
    }>;

    const cohort: SyntheticWorkerDay[] = specs.slice(0, count).map((spec, idx) => {
      const ppe =
        spec.ppeLevel === 'Chemical / Tyvek' || spec.ppeLevel === 'FR / Arc-Flash'
          ? spec.ppeLevel
          : 'Standard Coverall';
      const points = [];
      for (let m = 0; m <= 240; m += 3) {
        const progress =
          spec.escalationMinute < 240
            ? Math.max(0, Math.min(1, (m - Math.max(15, spec.escalationMinute - 60)) / 110))
            : Math.min(0.45, m / 240);
        const hrBpm = Math.round(spec.hr0 + 14 + progress * (spec.peakHr - spec.hr0 - 14));
        const skinTempC = Number((33.5 + progress * (spec.peakSkinTempC - 33.5)).toFixed(2));
        const wbgtC = Number((32.0 + (m / 240) * 3.8).toFixed(2));
        const hrMax = Math.round(208 - 0.7 * spec.ageYears);
        const tcProxy = 36.8 + (skinTempC - 33.5) * 0.68;
        const psi =
          5 * ((hrBpm - spec.hr0) / Math.max(20, hrMax - spec.hr0)) +
          5 * ((tcProxy - spec.tc0) / Math.max(0.5, 39.5 - spec.tc0));

        points.push({
          minute: m,
          hrBpm,
          skinTempC,
          exertionIndex: Number((4.0 + progress * 4.5).toFixed(1)),
          wbgtC,
          trueHeatExhaustionEvent: psi >= 7.0,
        });
      }

      return {
        trajectoryId: `GEM-SYN-${String(idx + 1).padStart(3, '0')}`,
        source: 'SYNTHETIC_PHYSIOLOGICAL_COHORT',
        generator: 'gemini_synthesized',
        roleLabel: spec.roleLabel,
        ppeLevel: ppe,
        acclimatizationDays: Math.max(1, Math.min(30, spec.acclimatizationDays)),
        ageYears: Math.max(20, Math.min(60, spec.ageYears)),
        hr0: Math.max(55, Math.min(90, spec.hr0)),
        tc0: Number(Math.max(36.4, Math.min(37.1, spec.tc0)).toFixed(2)),
        points,
      };
    });

    lastGeminiDiagnostic = 'ok';
    return { cohort, source: 'gemini' };
  } catch (err) {
    if (isDailyQuotaError(err)) {
      dailyQuotaCooldownUntil = Date.now() + 5 * 60_000;
      lastGeminiDiagnostic = 'quota_exhausted';
    } else {
      lastGeminiDiagnostic = 'fallback';
      console.info(`[GeminiService] Synthetic cohort fallback (${err instanceof Error ? err.message : String(err)})`);
    }
    return { cohort: [], source: 'deterministic_fallback' };
  }
}

/**
 * USE CASE 4: Compliance Report Plain-Language Narrative Summary (gemini-4-hydrogen).
 * Turns structured UAE Midday Working Break compliance logs into a clear briefing
 * for non-technical site managers, insurers, and MOHRE inspectors.
 */
export async function generateComplianceNarrative(params: {
  siteName: string;
  env: EnvironmentalObservation;
  breaks: BreakRecord[];
  incidents: IncidentLogEntry[];
  insurerRef: string;
}): Promise<{ narrative: string; source: 'gemini' | 'template_fallback' }> {
  const compliantCount = params.breaks.filter((b) => b.compliant).length;
  const totalCrew = params.breaks.length;
  const degradedEvents = params.incidents.filter((i) => i.eventType === 'sensor_degradation' || i.eventType === 'gps_loss').length;
  const redEvents = params.incidents.filter((i) => i.severity === 'Red').length;

  const fallbackNarrative = `SiteGuard Compliance Summary for ${params.siteName} (Ref: ${params.insurerRef || 'UAE-MOHRE-2026'}): Under ${params.env.station} conditions (${params.env.airTempC}°C air, ${params.env.wbgtC}°C outdoor WBGT), ${compliantCount} of ${totalCrew} monitored crew members met the mandatory UAE Midday Working Break requirement (12:30–15:00 GST). ${redEvents} critical stop-work escalation(s) and ${degradedEvents} wearable sensor degradation event(s) were logged with automatic environment-only fallback protection.`;

  const ai = getClient();
  if (!ai || Date.now() < dailyQuotaCooldownUntil) {
    if (Date.now() < dailyQuotaCooldownUntil) {
      lastGeminiDiagnostic = 'quota_exhausted';
    }
    return { narrative: fallbackNarrative, source: 'template_fallback' };
  }

  try {
    const prompt = `Write a concise, plain-language executive compliance summary (3–4 sentences, max 95 words) for a non-technical UAE construction site manager and labor compliance auditor.
Do NOT mention any personal names (use crew counts/roles only). Attribute platform to SiteGuard by GenOS Team.
Facts:
- Site: ${params.siteName}, Insurer/Regulator Reference: ${params.insurerRef || 'Pending'}
- Weather: ${params.env.station}, Air Temp ${params.env.airTempC}°C, Outdoor WBGT ${params.env.wbgtC}°C, Midday Break Window (12:30-15:00 GST) active=${params.env.inUaeMiddayBreakWindow}
- Break Compliance: ${compliantCount}/${totalCrew} workers compliant with midday rest requirement
- Logged Events: ${params.incidents.length} total events (${redEvents} Red stop-work alerts, ${degradedEvents} sensor degradation fallbacks).`;

    const res = await withRetry(() =>
      withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        25000
      )
    );

    lastGeminiDiagnostic = 'ok';
    return {
      narrative: (res.text ?? fallbackNarrative).trim(),
      source: 'gemini',
    };
  } catch (err) {
    if (isDailyQuotaError(err)) {
      dailyQuotaCooldownUntil = Date.now() + 5 * 60_000;
      lastGeminiDiagnostic = 'quota_exhausted';
    } else {
      lastGeminiDiagnostic = 'fallback';
      console.info(`[GeminiService] Compliance narrative fallback (${err instanceof Error ? err.message : String(err)})`);
    }
    return { narrative: fallbackNarrative, source: 'template_fallback' };
  }
}

export function getLatestBacktestSummaryNote(report: BacktestReport): string {
  return `Sensitivity ${report.sensitivityPct}%, False-Alarm Rate ${report.falseAlarmRatePct}%, Mean Lead Time ${report.meanLeadTimeMin ?? 0} min across ${report.cohortSize} worker-days.`;
}
