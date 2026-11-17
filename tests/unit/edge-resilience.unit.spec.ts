import { describe, expect, it } from 'vitest';
import {
  ABU_DHABI_COORDS,
  estimateAbuDhabiSolarWm2,
  getAbuDhabiGstTimeParts,
  synthesizeGemma4EdgeObservation,
} from '../../src/shared/edgeWeatherFallback.ts';
import type { EnvironmentalObservation } from '../../src/shared/types.ts';

describe('Gemma 4 Edge Resilience & Abu Dhabi Solar/WBGT Continuity', () => {
  it('targets exact Abu Dhabi coordinates and models realistic GST desert solar irradiance', () => {
    expect(ABU_DHABI_COORDS.lat).toBeCloseTo(24.4539, 4);
    expect(ABU_DHABI_COORDS.lon).toBeCloseTo(54.3773, 4);

    const nightSolar = estimateAbuDhabiSolarWm2(2, 0);
    const noonClearSolar = estimateAbuDhabiSolarWm2(12, 0);
    const noonCloudySolar = estimateAbuDhabiSolarWm2(12, 80);

    expect(nightSolar).toBe(15);
    expect(noonClearSolar).toBeGreaterThan(850);
    expect(noonCloudySolar).toBeLessThan(noonClearSolar);
  });

  it('computes Gulf Standard Time (UTC+4) hour and minute deterministically', () => {
    // 08:30 UTC -> 12:30 GST
    const utcSample = new Date('2026-07-15T08:30:00Z');
    const parts = getAbuDhabiGstTimeParts(utcSample);
    expect(parts.hourGst).toBe(12);
    expect(parts.minuteGst).toBe(30);
  });

  it('synthesizes continuous Gemma 4 Edge Offline observations from both cached live feeds and cold offline boot', () => {
    const coldOffline = synthesizeGemma4EdgeObservation(null, 'Cold offline startup');
    expect(coldOffline.feedStatus).toBe('gemma4_edge_offline_mode');
    expect(coldOffline.edgeOfflineActive).toBe(true);
    expect(coldOffline.provider).toBe('Gemma 4 Edge Local Inference');
    expect(coldOffline.lat).toBe(ABU_DHABI_COORDS.lat);
    expect(coldOffline.lon).toBe(ABU_DHABI_COORDS.lon);
    expect(Number.isFinite(coldOffline.wbgtC)).toBe(true);
    expect(Number.isFinite(coldOffline.wetBulbC)).toBe(true);
    expect(Number.isFinite(coldOffline.globeTempC)).toBe(true);
    expect(coldOffline.resilienceReason).toBe('Cold offline startup');

    const cachedLive: EnvironmentalObservation = {
      timestampIso: '2026-07-15T10:15:00Z',
      hourGst: 14,
      station: 'Abu Dhabi Live Station (OpenWeatherMap · 24.45°N, 54.38°E)',
      lat: ABU_DHABI_COORDS.lat,
      lon: ABU_DHABI_COORDS.lon,
      airTempC: 43.2,
      relHumidityPct: 38,
      windSpeedMs: 3.4,
      solarWm2: 880,
      wetBulbC: 30.2,
      globeTempC: 54.8,
      wbgtC: 34.1,
      heatIndexC: 50.4,
      mode: 'live_abu_dhabi',
      sourceLabel: 'Live Abu Dhabi Feed (OpenWeatherMap API)',
      inUaeMiddayBreakWindow: true,
      feedStatus: 'live_abu_dhabi_feed',
      provider: 'OpenWeatherMap',
      edgeOfflineActive: false,
      lastLiveSyncIso: '2026-07-15T10:15:00Z',
      resilienceReason: null,
    };

    const anchoredOffline = synthesizeGemma4EdgeObservation(cachedLive, 'Network dropped');
    expect(anchoredOffline.feedStatus).toBe('gemma4_edge_offline_mode');
    expect(anchoredOffline.edgeOfflineActive).toBe(true);
    expect(anchoredOffline.lastLiveSyncIso).toBe('2026-07-15T10:15:00Z');
    expect(Math.abs(anchoredOffline.airTempC - cachedLive.airTempC)).toBeLessThanOrEqual(0.5);
    expect(Number.isFinite(anchoredOffline.wbgtC)).toBe(true);
  });
});
