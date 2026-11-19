import type { RiskTier } from './types';

/**
 * SiteGuard Unified Mission-Control Design Tokens
 * Extracted from the finished Apple Watch components (`WatchShell.tsx`,
 * `AppCarousel.tsx`, `WatchFaceGauge.tsx`) so every page shares one cohesive palette.
 */
export const SG_COLORS = {
  pageBg: '#0B1120',
  cardBg: '#141821',
  cardElevatedBg: '#17191d',
  watchCardBg: '#212121',
  insetBg: '#0e131f',
  borderSubtle: 'rgba(255, 255, 255, 0.09)',
  borderStrong: 'rgba(120, 122, 255, 0.35)',
  accentPurple: '#787aff',
  criticalRed: '#fa114f',
  tierGreen: '#10b981',
  tierAmber: '#f59e0b',
  tierRed: '#ef4444',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
} as const;

export const SG_RADII = {
  card: 'rounded-[22px]',
  panel: 'rounded-[24px]',
  shell: 'rounded-[28px]',
  control: 'rounded-xl',
} as const;

export const SG_SURFACES = {
  card: 'bg-[#141821]/95 border border-white/10 rounded-[22px] shadow-[0_8px_32px_rgba(0,0,0,0.32)]',
  panel: 'bg-[#141821]/95 border border-white/10 rounded-[24px] shadow-[0_12px_40px_rgba(0,0,0,0.38)]',
  inset: 'bg-[#0c111d] border border-white/8 rounded-xl',
  input:
    'bg-[#0c111d] border border-white/12 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#787aff] transition-colors',
  buttonPrimary:
    'bg-[#787aff] hover:bg-[#898bff] text-white font-semibold rounded-xl transition-all active:scale-[0.99] cursor-pointer whitespace-nowrap shrink-0',
  buttonSecondary:
    'bg-[#17191d] hover:bg-[#1f2430] border border-white/12 text-slate-100 font-semibold rounded-xl transition-all active:scale-[0.99] cursor-pointer whitespace-nowrap shrink-0',
  buttonCritical:
    'bg-[#fa114f] hover:brightness-110 text-white font-semibold rounded-xl transition-all active:scale-[0.99] cursor-pointer whitespace-nowrap shrink-0',
} as const;

export function getTierTokens(tier: RiskTier) {
  if (tier === 'Red') {
    return {
      hex: SG_COLORS.tierRed,
      accentHex: SG_COLORS.criticalRed,
      ringClass:
        'border-[#fa114f]/55 ring-1 ring-[#fa114f]/30 shadow-[0_0_26px_rgba(250,17,79,0.14)]',
      pillClass: 'bg-[#fa114f]/15 border-[#fa114f]/50 text-[#ff6b93]',
      textClass: 'text-[#ff5c8a]',
      dotClass: 'bg-[#fa114f] sg-tier-pulse-red',
    };
  }
  if (tier === 'Amber') {
    return {
      hex: SG_COLORS.tierAmber,
      accentHex: SG_COLORS.tierAmber,
      ringClass:
        'border-[#f59e0b]/45 ring-1 ring-[#f59e0b]/20 shadow-[0_0_22px_rgba(245,158,11,0.10)]',
      pillClass: 'bg-[#f59e0b]/15 border-[#f59e0b]/45 text-amber-300',
      textClass: 'text-amber-300',
      dotClass: 'bg-[#f59e0b] sg-tier-pulse-amber',
    };
  }
  return {
    hex: SG_COLORS.tierGreen,
    accentHex: SG_COLORS.tierGreen,
    ringClass: 'border-white/10 hover:border-[#787aff]/40',
    pillClass: 'bg-[#10b981]/15 border-[#10b981]/40 text-emerald-300',
    textClass: 'text-emerald-300',
    dotClass: 'bg-[#10b981]',
  };
}
