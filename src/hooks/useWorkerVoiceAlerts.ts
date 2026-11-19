import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TemperatureUnit } from '../shared/temperature';
import {
  TTS_LOCALE_BY_LANGUAGE,
  type SupportedLanguage,
  type WorkerStateSelf,
} from '../shared/types';
import {
  getWearableAlertSpecCopy,
  type WearableAlertStateId,
} from '../shared/wearableAlertSpecs';

const STORAGE_KEY_ENABLED = 'siteguard_worker_voice_alerts_enabled';

export interface HeatThresholdVoiceEvaluation {
  exceeded: boolean;
  severity: 'nominal' | 'amber' | 'red';
  reason: string;
  headline: string;
  actionText: string;
  spokenText: string;
  localeTag: string;
  language: SupportedLanguage;
  signature: string;
}

export interface SpokenAlertRecord {
  text: string;
  language: SupportedLanguage;
  localeTag: string;
  severity: 'nominal' | 'amber' | 'red';
  autoTriggered: boolean;
  timestampIso: string;
}

export function evaluateHeatThresholdForVoice(params: {
  workerState: WorkerStateSelf | null;
  alertPreviewState: WearableAlertStateId;
  tempUnit: TemperatureUnit;
}): HeatThresholdVoiceEvaluation {
  const { workerState, alertPreviewState, tempUnit } = params;
  if (!workerState) {
    return {
      exceeded: false,
      severity: 'nominal',
      reason: 'Awaiting telemetry',
      headline: '',
      actionText: '',
      spokenText: '',
      localeTag: 'en-US',
      language: 'en',
      signature: 'none',
    };
  }

  const language = workerState.context.preferredLanguage;
  const localeTag = TTS_LOCALE_BY_LANGUAGE[language] ?? 'en-US';

  if (alertPreviewState !== 'live') {
    const specCopy = getWearableAlertSpecCopy(alertPreviewState, language, tempUnit);
    const exceeded = alertPreviewState !== 'hydration_alert';
    const severity: 'nominal' | 'amber' | 'red' =
      alertPreviewState === 'hydration_alert'
        ? 'nominal'
        : alertPreviewState === 'amber_forecast'
          ? 'amber'
          : 'red';
    const reason =
      alertPreviewState === 'amber_forecast'
        ? 'Projected Amber heat threshold crossing (~1 min)'
        : alertPreviewState === 'high_heat'
          ? 'WBGT High Risk heat threshold exceeded'
          : alertPreviewState === 'sos_active'
            ? 'SOS Distress sensor active'
            : 'Hydration reminder active (Nominal)';

    const spokenText = `${specCopy.headline}. ${specCopy.action}`;
    return {
      exceeded,
      severity,
      reason,
      headline: specCopy.headline,
      actionText: specCopy.action,
      spokenText,
      localeTag,
      language,
      signature: `${workerState.context.workerId}|${alertPreviewState}|${severity}|${exceeded}|${language}|${specCopy.headline}`,
    };
  }

  const copy = workerState.alertTranslations[language] ?? workerState.alertTranslations.en;
  const { tier, effectiveWbgtC } = workerState.assessment;
  const exceeded = tier === 'Amber' || tier === 'Red';
  const severity: 'nominal' | 'amber' | 'red' =
    tier === 'Red' ? 'red' : tier === 'Amber' ? 'amber' : 'nominal';

  const reason =
    tier === 'Red'
      ? `Critical Red heat-strain threshold exceeded (Eff. WBGT ${effectiveWbgtC.toFixed(1)}°C)`
      : tier === 'Amber'
        ? `Amber heat-strain threshold exceeded (Eff. WBGT ${effectiveWbgtC.toFixed(1)}°C)`
        : 'Within safe thermal limits';

  const spokenText = `${copy.headline}. ${copy.action}`;

  return {
    exceeded,
    severity,
    reason,
    headline: copy.headline,
    actionText: copy.action,
    spokenText,
    localeTag,
    language,
    signature: `${workerState.context.workerId}|live|${severity}|${exceeded}|${language}|${copy.headline}`,
  };
}

function pickBestSpeechVoice(
  voices: SpeechSynthesisVoice[],
  localeTag: string
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;
  const targetLower = localeTag.toLowerCase();
  const exact = voices.find((v) => v.lang.toLowerCase() === targetLower);
  if (exact) return exact;

  const primary = targetLower.split('-')[0];
  const candidates = primary === 'fil' ? ['fil', 'tl'] : [primary];
  for (const prefix of candidates) {
    const match = voices.find((v) => {
      const vl = v.lang.toLowerCase();
      return vl === prefix || vl.startsWith(`${prefix}-`);
    });
    if (match) return match;
  }
  return null;
}

function readInitialEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_ENABLED);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function useWorkerVoiceAlerts(params: {
  workerState: WorkerStateSelf | null;
  alertPreviewState: WearableAlertStateId;
  tempUnit: TemperatureUnit;
}) {
  const { workerState, alertPreviewState, tempUnit } = params;
  const [enabled, setEnabledState] = useState<boolean>(readInitialEnabled);
  const [speaking, setSpeaking] = useState(false);
  const [lastSpokenAlert, setLastSpokenAlert] = useState<SpokenAlertRecord | null>(null);
  const [voicesVersion, setVoicesVersion] = useState(0);

  const lastTriggeredSignatureRef = useRef<string | null>(null);
  const utteranceSeqRef = useRef(0);

  const speechSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  useEffect(() => {
    if (!speechSupported) return;
    const synth = window.speechSynthesis;
    const handleVoicesChanged = () => setVoicesVersion((v) => v + 1);
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', handleVoicesChanged);
      return () => synth.removeEventListener('voiceschanged', handleVoicesChanged);
    }
    return undefined;
  }, [speechSupported]);

  const evaluation = useMemo(
    () =>
      evaluateHeatThresholdForVoice({
        workerState,
        alertPreviewState,
        tempUnit,
      }),
    [workerState, alertPreviewState, tempUnit]
  );

  const stopSpeaking = useCallback(() => {
    utteranceSeqRef.current += 1;
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // Ignore synthesis cancellation errors in headless environments
    }
    setSpeaking(false);
  }, []);

  const synthesizeAlert = useCallback(
    (
      text: string,
      language: SupportedLanguage,
      severity: 'nominal' | 'amber' | 'red',
      autoTriggered: boolean
    ) => {
      if (!text.trim()) return;
      const localeTag = TTS_LOCALE_BY_LANGUAGE[language] ?? 'en-US';
      const seq = ++utteranceSeqRef.current;

      setLastSpokenAlert({
        text,
        language,
        localeTag,
        severity,
        autoTriggered,
        timestampIso: new Date().toISOString(),
      });

      try {
        if (
          typeof window === 'undefined' ||
          !('speechSynthesis' in window) ||
          typeof window.SpeechSynthesisUtterance === 'undefined'
        ) {
          return;
        }
        const synth = window.speechSynthesis;
        synth.cancel();

        const UtteranceCtor = window.SpeechSynthesisUtterance;
        const utterance = new UtteranceCtor(text);
        utterance.lang = localeTag;
        utterance.rate = severity === 'red' ? 1.06 : 1.0;
        utterance.pitch = severity === 'red' ? 1.08 : 1.0;

        const availableVoices =
          typeof synth.getVoices === 'function' ? synth.getVoices() : [];
        const matchedVoice = pickBestSpeechVoice(availableVoices, localeTag);
        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }

        utterance.onend = () => {
          if (utteranceSeqRef.current === seq) {
            setSpeaking(false);
          }
        };
        utterance.onerror = () => {
          if (utteranceSeqRef.current === seq) {
            setSpeaking(false);
          }
        };

        setSpeaking(true);
        synth.speak(utterance);
      } catch {
        if (utteranceSeqRef.current === seq) {
          setSpeaking(false);
        }
      }
    },
    // voicesVersion ensures latest voices list is considered if available
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voicesVersion]
  );

  // Automatic voice-synthesis trigger whenever heat thresholds are exceeded
  // or worker switches preferred language while threshold remains exceeded
  useEffect(() => {
    if (!enabled) {
      lastTriggeredSignatureRef.current = null;
      return;
    }

    if (!evaluation.exceeded) {
      lastTriggeredSignatureRef.current = null;
      return;
    }

    if (lastTriggeredSignatureRef.current === evaluation.signature) {
      return;
    }

    lastTriggeredSignatureRef.current = evaluation.signature;
    synthesizeAlert(
      evaluation.spokenText,
      evaluation.language,
      evaluation.severity,
      true
    );
  }, [enabled, evaluation, synthesizeAlert]);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY_ENABLED, next ? 'true' : 'false');
      } catch {
        // Ignore storage write errors
      }
      if (!next) {
        lastTriggeredSignatureRef.current = null;
        stopSpeaking();
      }
    },
    [stopSpeaking]
  );

  const speakNow = useCallback(() => {
    if (!evaluation.spokenText) return;
    synthesizeAlert(
      evaluation.spokenText,
      evaluation.language,
      evaluation.severity,
      false
    );
  }, [evaluation, synthesizeAlert]);

  return {
    enabled,
    setEnabled,
    speaking,
    speechSupported,
    evaluation,
    lastSpokenAlert,
    speakNow,
    stopSpeaking,
  };
}
