import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DemoDrawerProps {
  open: boolean;
  onClose: () => void;
}

const DEMO_STEPS = [
  {
    step: '01',
    title: 'Prospective Early Warning Fires',
    route: '/worker',
    detail:
      'Select W-101 (Steel Fixer, unacclimatized 3 days). Notice the wearable starts Green, yet the deterministic forecast projects an Amber crossing in ~12–18 min with Gemini multilingual guidance in Hindi/Urdu/Bengali/Tagalog.',
  },
  {
    step: '02',
    title: 'Advance Simulated Clock to Crossing',
    route: '/worker',
    detail:
      'Click "+3 min Step" or "+6 min Step" in the simulator panel. Watch the live trajectory climb along the sparkline and actually cross into Amber/Red as predicted.',
  },
  {
    step: '03',
    title: 'Privacy-Enforced Supervisor Action',
    route: '/supervisor',
    detail:
      'Open Supervisor view. Raw vitals (HR, skin temp) are architecturally stripped at the API layer — only risk tiers, projected crossing times, and break queues appear. Click "Order 15m Break" or "Rotate".',
  },
  {
    step: '04',
    title: 'Fault Injection & Graceful Degradation',
    route: '/worker',
    detail:
      'Return to Worker and click "Disconnect BLE" or "Sensor noise". Scoring immediately degrades to Environment-Only WBGT mode and logs the degradation event; clearing faults triggers "insufficient trend data" until 4 clean samples return.',
  },
  {
    step: '05',
    title: 'UAE Midday Break Compliance & Validation',
    route: '/compliance',
    detail:
      'Inspect the 12:30–15:00 GST compliance table, generate the Gemini plain-language site summary, export PDF, then inspect empirical lead-time & MAE/RMSE ablation metrics on Backtest and Forecast pages.',
  },
];

export function DemoDrawer({ open, onClose }: DemoDrawerProps) {
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[#141821] text-slate-100 h-full border-l border-white/10 flex flex-col justify-between overflow-y-auto shadow-2xl">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
            <div>
              <h2 className="text-lg font-bold text-white">3-Minute Demo Walkthrough</h2>
              <p className="text-xs text-slate-400 mt-1">
                GenOS Team · Challenge 07: Climate-Resilient Worker Health
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close demo guide"
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 cursor-pointer transition-all active:scale-[0.99]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <ol className="mt-6 space-y-5">
            {DEMO_STEPS.map((item) => (
              <li key={item.step} className="pb-5 border-b border-white/8 last:border-none">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-mono font-semibold text-[#787aff]">
                    Step {item.step}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigate(item.route);
                      onClose();
                    }}
                    className="text-xs font-semibold text-[#787aff] underline underline-offset-2 hover:text-white cursor-pointer active:scale-[0.99]"
                  >
                    Go to {item.route}
                  </button>
                </div>
                <h3 className="text-sm font-semibold text-white mt-1">{item.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed mt-1">{item.detail}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="p-6 border-t border-white/10 bg-[#0B1120]">
          <p className="text-xs text-slate-400 leading-relaxed">
            Hardware-agnostic contract: UI simulator sliders push to{' '}
            <code className="font-mono text-slate-200">POST /api/ble/telemetry</code> using the
            identical schema expected from physical BLE wearable gateways.
          </p>
        </div>
      </div>
    </div>
  );
}
