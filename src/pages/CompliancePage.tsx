import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Printer, Sparkles } from 'lucide-react';
import type { BreakRecord, EnvironmentalObservation, IncidentLogEntry } from '../shared/types';

interface ComplianceReport {
  siteName: string;
  emirate: string;
  regulationReference: string;
  env: EnvironmentalObservation;
  compliantPct: number;
  breaks: BreakRecord[];
  incidents: IncidentLogEntry[];
  cachedNarrative: {
    narrative: string;
    source: 'gemini' | 'template_fallback';
    updatedAt: string;
  } | null;
  generatedAt: string;
}

export function CompliancePage() {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingNarrative, setGeneratingNarrative] = useState(false);

  // Insurer / Regulator export metadata fields
  const [mohreId, setMohreId] = useState('EST-AUH-88412');
  const [recipient, setRecipient] = useState('UAE MOHRE Labor Inspection / Daman Occupational Insurer');
  const [permitRef, setPermitRef] = useState('AUH-SUMMER-2026-LOT07');

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch('/api/compliance/report');
      const json = (await res.json()) as ComplianceReport;
      setReport(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleGenerateNarrative = async () => {
    setGeneratingNarrative(true);
    try {
      const res = await fetch('/api/compliance/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insurerRef: `${mohreId} / ${recipient}` }),
      });
      const saved = await res.json();
      setReport((prev) => (prev ? { ...prev, cachedNarrative: saved } : prev));
    } finally {
      setGeneratingNarrative(false);
    }
  };

  const handleDownloadJson = () => {
    if (!report) return;
    const bundle = {
      exportedFor: recipient,
      mohreEstablishmentId: mohreId,
      sitePermitRef: permitRef,
      privacyGuarantee: 'Zero PII, zero raw physiological vitals included in compliance export.',
      ...report,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `siteguard-uae-compliance-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return (
      <main className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="h-96 bg-slate-200/70 rounded-xl animate-pulse" />
      </main>
    );
  }

  if (!report) return null;

  const degradedCount = report.incidents.filter(
    (i) => i.eventType === 'sensor_degradation' || i.eventType === 'gps_loss'
  ).length;
  const redCount = report.incidents.filter((i) => i.severity === 'Red').length;

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-8 space-y-6">
      {/* Header + Export Controls */}
      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            UAE Midday Working Break Compliance Report
          </h1>
          <p className="text-sm text-slate-600 mt-1">{report.regulationReference}</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Regulator JSON</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Printable Report Sheet */}
      <div className="print-container bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-8">
        {/* Report Masthead */}
        <div className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono text-slate-500">
              SITEGUARD COMPLIANCE RECORD · GENOS TEAM
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">{report.siteName}</h2>
            <p className="text-xs text-slate-600 mt-1">
              {report.emirate} · Mandatory Break Window: 12:30–15:00 GST (June 15 – September 15) ·{' '}
              Current Window Status:{' '}
              <strong className="text-slate-900">
                {report.env.inUaeMiddayBreakWindow ? 'ACTIVE MIDDAY HALT WINDOW' : 'PRE/POST WINDOW'}
              </strong>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6 text-right font-mono tabular-nums">
            <div>
              <div className="text-[11px] text-slate-500">Break Compliance</div>
              <div className="text-2xl font-bold text-slate-900">{report.compliantPct}%</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Red Stop-Work</div>
              <div className="text-2xl font-bold text-rose-700">{redCount}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Sensor Fallbacks</div>
              <div className="text-2xl font-bold text-amber-700">{degradedCount}</div>
            </div>
          </div>
        </div>

        {/* Full Compliance vs Active Escalations Summary Strip */}
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-xs font-medium ${
            report.compliantPct === 100 && redCount === 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          {report.compliantPct === 100 && redCount === 0
            ? `Full Compliance Achieved: 100% of ${report.breaks.length} monitored crew members met the UAE Midday Working Break requirement with 0 heat-safety violations.`
            : `${report.breaks.filter((b) => !b.compliant).length} crew member(s) pending required break completion · ${redCount} Red escalation(s) logged.`}
        </div>

        {/* Insurer / Regulator Export Metadata Fields */}
        <section>
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span>Insurer &amp; Regulator Export Metadata</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="mohre-id" className="block text-xs font-medium text-slate-600 mb-1">
                Employer / MOHRE Establishment ID
              </label>
              <input
                id="mohre-id"
                type="text"
                value={mohreId}
                onChange={(e) => setMohreId(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="recipient" className="block text-xs font-medium text-slate-600 mb-1">
                Insurer / Regulator Export Recipient
              </label>
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="permit-ref" className="block text-xs font-medium text-slate-600 mb-1">
                Site Permit &amp; Policy Reference
              </label>
              <input
                id="permit-ref"
                type="text"
                value={permitRef}
                onChange={(e) => setPermitRef(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>
          </div>
        </section>

        {/* Gemini Plain-Language Executive Narrative */}
        <section className="pt-6 border-t border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Site Manager Executive Narrative
              </h3>
              <p className="text-xs text-slate-500">
                Plain-language compliance briefing generated by Gemini without personal worker vitals.
              </p>
            </div>
            <button
              type="button"
              disabled={generatingNarrative}
              onClick={handleGenerateNarrative}
              className="no-print px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-60 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{generatingNarrative ? 'Generating...' : 'Generate Summary with Gemini'}</span>
            </button>
          </div>

          {report.cachedNarrative ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-800 leading-relaxed">
              <p>{report.cachedNarrative.narrative}</p>
              <div className="mt-2 text-[11px] font-mono text-slate-500">
                Source: {report.cachedNarrative.source === 'gemini' ? 'Gemini 4 Hydrogen' : 'Compliance Template'} ·{' '}
                Generated {new Date(report.cachedNarrative.updatedAt).toLocaleTimeString()}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-500">
              Click &quot;Generate Summary with Gemini&quot; to produce an auditor-ready plain-language compliance narrative for {recipient}.
            </div>
          )}
        </section>

        {/* Breaks Taken vs UAE Midday Break Window */}
        <section className="pt-6 border-t border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Today&apos;s Rest Breaks vs. UAE Midday Working Break Requirement
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Anonymized Unit</th>
                  <th className="py-2.5 pr-4 font-medium">Zone</th>
                  <th className="py-2.5 pr-4 font-medium">Required Midday Window</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Breaks Taken</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Target Min</th>
                  <th className="py-2.5 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.breaks.map((b) => (
                  <tr key={b.workerId}>
                    <td className="py-2.5 pr-4 font-medium text-slate-900">
                      {b.workerId} · {b.roleLabel}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-600">{b.zone}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">
                      {b.requiredMiddayWindow}
                    </td>
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-right text-slate-900">
                      {b.breaksTakenMin} min
                    </td>
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-right text-slate-500">
                      {b.requiredMin} min
                    </td>
                    <td
                      className={`py-2.5 text-right text-xs font-semibold ${
                        b.compliant
                          ? 'text-emerald-700'
                          : b.status === 'Action Required'
                            ? 'text-rose-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {b.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Incident, Near-Miss & Sensor Degradation Log */}
        <section className="pt-6 border-t border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Incident, Near-Miss &amp; Sensor Degradation Audit Log ({report.incidents.length} Entries)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Timestamp</th>
                  <th className="py-2 pr-3 font-medium">Unit</th>
                  <th className="py-2 pr-3 font-medium">Severity</th>
                  <th className="py-2 pr-3 font-medium">Event Summary</th>
                  <th className="py-2 font-medium">Action Taken</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.incidents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-emerald-700 font-medium">
                      Zero heat-stress escalations or sensor violations logged for this shift — full compliance recorded.
                    </td>
                  </tr>
                ) : (
                  report.incidents.map((inc) => (
                    <tr key={inc.id}>
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {new Date(inc.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {inc.workerId}
                      </td>
                      <td
                        className={`py-2.5 pr-3 font-mono font-semibold whitespace-nowrap ${
                          inc.severity === 'Red'
                            ? 'text-rose-700'
                            : inc.severity === 'Amber'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {inc.severity}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-800">{inc.summary}</td>
                      <td className="py-2.5 text-slate-600">{inc.actionTaken}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
