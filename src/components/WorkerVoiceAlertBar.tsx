import { Volume2, VolumeX } from 'lucide-react';
import type {
  HeatThresholdVoiceEvaluation,
  SpokenAlertRecord,
} from '../hooks/useWorkerVoiceAlerts';
import { SG_SURFACES } from '../shared/designTokens';
import { isRtlLanguage, LANGUAGE_LABELS, type SupportedLanguage } from '../shared/types';
import { VoiceWaveform } from './VoiceCopilotBar';

interface WorkerVoiceAlertBarProps {
  enabled: boolean;
  onToggleEnabled: (next: boolean) => void;
  speaking: boolean;
  language: SupportedLanguage;
  evaluation: HeatThresholdVoiceEvaluation;
  lastSpokenAlert: SpokenAlertRecord | null;
  onSpeakNow: () => void;
  onStopSpeaking: () => void;
}

export function WorkerVoiceAlertBar({
  enabled,
  onToggleEnabled,
  speaking,
  language,
  evaluation,
  lastSpokenAlert,
  onSpeakNow,
  onStopSpeaking,
}: WorkerVoiceAlertBarProps) {
  const langMeta = LANGUAGE_LABELS[language];
  const isRtl = isRtlLanguage(language);

  const containerRing =
    !enabled
      ? 'border-white/10'
      : evaluation.severity === 'red'
        ? 'border-[#fa114f]/60 shadow-[0_0_24px_rgba(250,17,79,0.16)]'
        : evaluation.severity === 'amber'
          ? 'border-[#f59e0b]/50 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
          : 'border-white/10';

  return (
    <div
      data-testid="worker-voice-alert-controls"
      className={`${SG_SURFACES.panel} border p-4 sm:p-5 space-y-3 transition-colors ${containerRing}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
              speaking
                ? 'bg-[#787aff]/25 border-[#787aff]/60 text-[#a5a7ff]'
                : evaluation.exceeded && enabled
                  ? evaluation.severity === 'red'
                    ? 'bg-[#fa114f]/20 border-[#fa114f]/60 text-[#ff8aa8]'
                    : 'bg-[#f59e0b]/20 border-[#f59e0b]/50 text-amber-300'
                  : 'bg-[#0c111d] border-white/10 text-slate-300'
            }`}
          >
            {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </span>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <span>Audible Safety Voice Alerts</span>
              <VoiceWaveform active={speaking} />
            </div>
            <div
              data-testid="worker-voice-locale"
              className="text-[11px] font-mono text-slate-400"
            >
              TTS Voice: {evaluation.localeTag} · {langMeta.native}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="worker-voice-alert-toggle"
            aria-pressed={enabled}
            onClick={() => onToggleEnabled(!enabled)}
            className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              enabled
                ? 'bg-[#10b981]/15 border-[#10b981]/45 text-emerald-200 hover:bg-[#10b981]/25'
                : 'bg-[#0c111d] border-white/15 text-slate-400 hover:text-white'
            }`}
          >
            {enabled ? 'Auto Voice: ON' : 'Auto Voice: MUTED'}
          </button>

          <button
            type="button"
            data-testid="worker-voice-speak-btn"
            onClick={() => (speaking ? onStopSpeaking() : onSpeakNow())}
            className={`${SG_SURFACES.buttonSecondary} min-h-[36px] px-3 py-1.5 text-xs flex items-center gap-1.5`}
          >
            {speaking ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-[#fa114f]" />
                <span>Stop Audio</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-[#787aff]" />
                <span>Speak Alert</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* NOTE: Intentionally uses aria-live without role="status" so check-in status locators remain unique */}
      <div
        data-testid="worker-voice-alert-status"
        data-spoken-text={lastSpokenAlert?.text ?? evaluation.spokenText}
        aria-live="polite"
        className={`rounded-xl border px-3.5 py-2.5 text-xs ${
          !enabled
            ? 'bg-[#0c111d] border-white/10 text-slate-400'
            : evaluation.exceeded
              ? evaluation.severity === 'red'
                ? 'bg-[#fa114f]/12 border-[#fa114f]/45 text-rose-100'
                : 'bg-[#f59e0b]/12 border-[#f59e0b]/40 text-amber-100'
              : 'bg-[#0c111d] border-white/10 text-slate-300'
        }`}
      >
        {!enabled ? (
          <span>
            Audible synthesis muted. Turn Auto Voice ON to speak heat safety alerts in{' '}
            {langMeta.name} ({evaluation.localeTag}) when limits are exceeded.
          </span>
        ) : evaluation.exceeded ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
              <span className="font-semibold uppercase tracking-wide">
                {speaking ? 'SPEAKING ALERT' : 'AUDIBLE ALERT TRIGGERED'} · {evaluation.localeTag}
              </span>
              <span className="opacity-85">{evaluation.reason}</span>
            </div>
            <p dir={isRtl ? 'rtl' : 'ltr'} className="text-xs leading-relaxed opacity-90">
              {evaluation.actionText}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong className="font-mono text-emerald-300">ARMED · STANDBY</strong> — Speaks
              automatically in {langMeta.native} ({evaluation.localeTag}) if heat thresholds are
              exceeded.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
