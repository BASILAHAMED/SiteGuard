import { useEffect, useState } from 'react';
import { BellRing, Check, Languages, RotateCcw, Thermometer } from 'lucide-react';
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  type TemperatureUnit,
} from '../shared/temperature';
import {
  LANGUAGE_LABELS,
  type CustomAlertMessages,
  type SupportedLanguage,
  type TemperatureThresholdConfig,
} from '../shared/types';

interface TemperatureThresholdEditorProps {
  tempUnit: TemperatureUnit;
  onPolicySaved?: () => void;
}

export function TemperatureThresholdEditor({
  tempUnit,
  onPolicySaved,
}: TemperatureThresholdEditorProps) {
  const [policy, setPolicy] = useState<TemperatureThresholdConfig | null>(null);
  const [activeLang, setActiveLang] = useState<SupportedLanguage>('en');
  const [amberInput, setAmberInput] = useState('26.0');
  const [redInput, setRedInput] = useState('29.0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const syncDisplayedThresholds = (amberC: number, redC: number, unit: TemperatureUnit) => {
    const a = unit === 'F' ? celsiusToFahrenheit(amberC) : amberC;
    const r = unit === 'F' ? celsiusToFahrenheit(redC) : redC;
    setAmberInput(a.toFixed(1));
    setRedInput(r.toFixed(1));
  };

  useEffect(() => {
    let active = true;
    fetch('/api/supervisor/alert-policy', {
      headers: { 'X-SiteGuard-Role': 'supervisor' },
    })
      .then((res) => res.json())
      .then((data: { policy: TemperatureThresholdConfig }) => {
        if (!active || !data.policy) return;
        setPolicy(data.policy);
        syncDisplayedThresholds(
          data.policy.amberWbgtThresholdC,
          data.policy.redWbgtThresholdC,
          tempUnit
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Re-sync input display values whenever the global °C / °F switch changes
  useEffect(() => {
    if (!policy) return;
    syncDisplayedThresholds(policy.amberWbgtThresholdC, policy.redWbgtThresholdC, tempUnit);
  }, [tempUnit, policy?.amberWbgtThresholdC, policy?.redWbgtThresholdC]);

  if (!policy) return null;

  const currentMessages = policy.customMessages[activeLang];
  const isRtl = activeLang === 'ur';

  const handleMessageFieldChange = (
    field: keyof CustomAlertMessages,
    value: string
  ) => {
    setPolicy((prev) =>
      prev
        ? {
            ...prev,
            customMessages: {
              ...prev.customMessages,
              [activeLang]: {
                ...prev.customMessages[activeLang],
                [field]: value,
              },
            },
          }
        : prev
    );
    setStatusMessage(null);
  };

  const handleSave = async (overrideEnabled?: boolean) => {
    if (!policy) return;
    setError(null);
    setStatusMessage(null);

    const parsedAmber = Number(amberInput);
    const parsedRed = Number(redInput);
    if (!Number.isFinite(parsedAmber) || !Number.isFinite(parsedRed)) {
      setError('Enter valid numeric temperature thresholds.');
      return;
    }

    const amberC =
      tempUnit === 'F' ? Number(fahrenheitToCelsius(parsedAmber).toFixed(1)) : parsedAmber;
    const redC =
      tempUnit === 'F' ? Number(fahrenheitToCelsius(parsedRed).toFixed(1)) : parsedRed;

    if (amberC >= redC) {
      setError(`Amber threshold must be lower than Red Stop-Work limit (°${tempUnit}).`);
      return;
    }

    setSaving(true);
    try {
      const nextEnabled =
        typeof overrideEnabled === 'boolean' ? overrideEnabled : policy.enabled;
      const res = await fetch('/api/supervisor/alert-policy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-SiteGuard-Role': 'supervisor',
        },
        body: JSON.stringify({
          enabled: nextEnabled,
          amberWbgtThresholdC: amberC,
          redWbgtThresholdC: redC,
          customMessages: policy.customMessages,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save alert threshold rules');
      }
      setPolicy(json.policy);
      syncDisplayedThresholds(
        json.policy.amberWbgtThresholdC,
        json.policy.redWbgtThresholdC,
        tempUnit
      );
      setStatusMessage(
        json.policy.enabled
          ? `Custom threshold rules active (Amber ${amberInput}°${tempUnit} / Red ${redInput}°${tempUnit}).`
          : 'Custom overrides paused — standard ACGIH WBGT thresholds active.'
      );
      onPolicySaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="threshold-editor-heading"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2
            id="threshold-editor-heading"
            className="text-base font-semibold text-slate-900 flex items-center gap-2"
          >
            <BellRing className="w-4 h-4 text-slate-600" />
            <span>Supervisor Temperature Thresholds &amp; Multilingual Alert Rules</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Define site-wide Effective WBGT trigger limits (°{tempUnit}) and customize Amber/Red wearable instructions per worker language.
          </p>
        </div>

        <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer select-none">
          <input
            id="custom-threshold-enabled"
            type="checkbox"
            checked={policy.enabled}
            onChange={(e) => {
              const checked = e.target.checked;
              setPolicy((prev) => (prev ? { ...prev, enabled: checked } : prev));
              handleSave(checked);
            }}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 cursor-pointer"
          />
          <span>Enforce Custom Thresholds</span>
        </label>
      </div>

      {/* Numeric Temperature Threshold Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
          <label
            htmlFor="amber-threshold-input"
            className="flex items-center justify-between text-xs font-semibold text-amber-900 mb-1.5"
          >
            <span className="flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5" />
              Amber Alert Threshold (Effective WBGT)
            </span>
            <span className="font-mono text-[11px]">°{tempUnit}</span>
          </label>
          <input
            id="amber-threshold-input"
            type="number"
            step="0.5"
            value={amberInput}
            onChange={(e) => {
              setAmberInput(e.target.value);
              setStatusMessage(null);
            }}
            className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-amber-200 rounded-lg text-slate-900"
          />
          <p className="text-[11px] text-amber-800/80 mt-1">
            Workers reaching this WBGT receive mandatory shade rest alerts.
          </p>
        </div>

        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-4">
          <label
            htmlFor="red-threshold-input"
            className="flex items-center justify-between text-xs font-semibold text-rose-900 mb-1.5"
          >
            <span className="flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5" />
              Red Stop-Work Threshold (Effective WBGT)
            </span>
            <span className="font-mono text-[11px]">°{tempUnit}</span>
          </label>
          <input
            id="red-threshold-input"
            type="number"
            step="0.5"
            value={redInput}
            onChange={(e) => {
              setRedInput(e.target.value);
              setStatusMessage(null);
            }}
            className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-rose-200 rounded-lg text-slate-900"
          />
          <p className="text-[11px] text-rose-800/80 mt-1">
            Workers reaching this WBGT trigger immediate stop-work escalation.
          </p>
        </div>
      </div>

      {/* Multilingual Alert Message Customization */}
      <div className="pt-2 border-t border-slate-100 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Languages className="w-4 h-4 text-slate-500" />
            <span>Custom Wearable Alert Messages by Language</span>
          </div>

          <div
            role="tablist"
            aria-label="Alert message language"
            className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {(Object.keys(LANGUAGE_LABELS) as SupportedLanguage[]).map((code) => (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={activeLang === code}
                onClick={() => setActiveLang(code)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  activeLang === code
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {LANGUAGE_LABELS[code].native}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="space-y-2.5">
            <div>
              <label
                htmlFor="custom-amber-headline"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Amber Headline ({LANGUAGE_LABELS[activeLang].name})
              </label>
              <input
                id="custom-amber-headline"
                type="text"
                value={currentMessages.amberHeadline}
                onChange={(e) => handleMessageFieldChange('amberHeadline', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="custom-amber-action"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Amber Worker Action ({LANGUAGE_LABELS[activeLang].name})
              </label>
              <textarea
                id="custom-amber-action"
                rows={2}
                value={currentMessages.amberAction}
                onChange={(e) => handleMessageFieldChange('amberAction', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <label
                htmlFor="custom-red-headline"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Red Stop-Work Headline ({LANGUAGE_LABELS[activeLang].name})
              </label>
              <input
                id="custom-red-headline"
                type="text"
                value={currentMessages.redHeadline}
                onChange={(e) => handleMessageFieldChange('redHeadline', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="custom-red-action"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Red Worker Action ({LANGUAGE_LABELS[activeLang].name})
              </label>
              <textarea
                id="custom-red-action"
                rows={2}
                value={currentMessages.redAction}
                onChange={(e) => handleMessageFieldChange('redAction', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {statusMessage && (
        <div role="status" className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {statusMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            syncDisplayedThresholds(26.0, 29.0, tempUnit);
            handleSave(false);
          }}
          className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Defaults</span>
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleSave(true)}
          className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-60 flex items-center gap-1.5 cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : 'Save & Activate Thresholds'}</span>
        </button>
      </div>
    </section>
  );
}
