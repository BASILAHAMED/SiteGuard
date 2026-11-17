import type { EnvironmentalObservation } from './types.ts';

/**
 * Historical Abu Dhabi Mussafah Industrial peak summer heatwave hourly curve
 * matching /data/uae_heatwave_abu_dhabi.csv (August peak heatwave profile).
 * Outdoor WBGT calculated using Stull (2011) psychrometric wet-bulb approximation
 * and Liljegren-calibrated globe temperature under desert solar irradiance.
 */
export const HISTORICAL_UAE_HEATWAVE_CURVE: Omit<
  EnvironmentalObservation,
  'mode' | 'sourceLabel' | 'inUaeMiddayBreakWindow'
>[] = [
  {
    timestampIso: '2025-08-14T06:00:00+04:00',
    hourGst: 6,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 33.8,
    relHumidityPct: 64,
    windSpeedMs: 2.1,
    solarWm2: 65,
    wetBulbC: 28.1,
    globeTempC: 36.2,
    wbgtC: 29.3,
    heatIndexC: 45.2,
  },
  {
    timestampIso: '2025-08-14T07:00:00+04:00',
    hourGst: 7,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 35.4,
    relHumidityPct: 59,
    windSpeedMs: 2.3,
    solarWm2: 240,
    wetBulbC: 28.5,
    globeTempC: 40.8,
    wbgtC: 30.7,
    heatIndexC: 47.0,
  },
  {
    timestampIso: '2025-08-14T08:00:00+04:00',
    hourGst: 8,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 37.6,
    relHumidityPct: 52,
    windSpeedMs: 2.6,
    solarWm2: 460,
    wetBulbC: 28.8,
    globeTempC: 45.5,
    wbgtC: 32.0,
    heatIndexC: 48.6,
  },
  {
    timestampIso: '2025-08-14T09:00:00+04:00',
    hourGst: 9,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 40.1,
    relHumidityPct: 44,
    windSpeedMs: 2.9,
    solarWm2: 665,
    wetBulbC: 28.9,
    globeTempC: 49.8,
    wbgtC: 33.1,
    heatIndexC: 49.8,
  },
  {
    timestampIso: '2025-08-14T10:00:00+04:00',
    hourGst: 10,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 42.5,
    relHumidityPct: 38,
    windSpeedMs: 3.2,
    solarWm2: 825,
    wetBulbC: 29.1,
    globeTempC: 53.4,
    wbgtC: 34.1,
    heatIndexC: 51.2,
  },
  {
    timestampIso: '2025-08-14T11:00:00+04:00',
    hourGst: 11,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 44.4,
    relHumidityPct: 34,
    windSpeedMs: 3.4,
    solarWm2: 930,
    wetBulbC: 29.4,
    globeTempC: 56.1,
    wbgtC: 35.0,
    heatIndexC: 52.9,
  },
  {
    timestampIso: '2025-08-14T12:00:00+04:00',
    hourGst: 12,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 45.8,
    relHumidityPct: 32,
    windSpeedMs: 3.6,
    solarWm2: 975,
    wetBulbC: 29.8,
    globeTempC: 57.8,
    wbgtC: 35.8,
    heatIndexC: 54.6,
  },
  {
    timestampIso: '2025-08-14T13:00:00+04:00',
    hourGst: 13,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 46.7,
    relHumidityPct: 30,
    windSpeedMs: 3.8,
    solarWm2: 955,
    wetBulbC: 29.9,
    globeTempC: 58.5,
    wbgtC: 36.1,
    heatIndexC: 55.2,
  },
  {
    timestampIso: '2025-08-14T14:00:00+04:00',
    hourGst: 14,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 47.1,
    relHumidityPct: 29,
    windSpeedMs: 4.1,
    solarWm2: 880,
    wetBulbC: 29.8,
    globeTempC: 57.9,
    wbgtC: 36.0,
    heatIndexC: 55.1,
  },
  {
    timestampIso: '2025-08-14T15:00:00+04:00',
    hourGst: 15,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 46.2,
    relHumidityPct: 32,
    windSpeedMs: 4.3,
    solarWm2: 745,
    wetBulbC: 30.1,
    globeTempC: 55.6,
    wbgtC: 35.8,
    heatIndexC: 55.0,
  },
  {
    timestampIso: '2025-08-14T16:00:00+04:00',
    hourGst: 16,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 44.5,
    relHumidityPct: 38,
    windSpeedMs: 4.0,
    solarWm2: 565,
    wetBulbC: 30.4,
    globeTempC: 52.3,
    wbgtC: 35.4,
    heatIndexC: 54.8,
  },
  {
    timestampIso: '2025-08-14T17:00:00+04:00',
    hourGst: 17,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 42.3,
    relHumidityPct: 44,
    windSpeedMs: 3.5,
    solarWm2: 340,
    wetBulbC: 30.4,
    globeTempC: 48.1,
    wbgtC: 34.4,
    heatIndexC: 53.6,
  },
  {
    timestampIso: '2025-08-14T18:00:00+04:00',
    hourGst: 18,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 39.9,
    relHumidityPct: 52,
    windSpeedMs: 2.8,
    solarWm2: 110,
    wetBulbC: 30.3,
    globeTempC: 43.2,
    wbgtC: 33.2,
    heatIndexC: 52.4,
  },
  {
    timestampIso: '2025-08-14T19:00:00+04:00',
    hourGst: 19,
    station: 'Abu Dhabi Mussafah Industrial (Historical Record)',
    lat: 24.3712,
    lon: 54.5097,
    airTempC: 37.8,
    relHumidityPct: 58,
    windSpeedMs: 2.4,
    solarWm2: 15,
    wetBulbC: 29.8,
    globeTempC: 38.9,
    wbgtC: 31.9,
    heatIndexC: 50.5,
  },
];

/**
 * Stull (2011) empirical wet-bulb temperature from air temperature (°C) and RH (%).
 */
export function computeWetBulbStull(tempC: number, rhPct: number): number {
  const rh = Math.max(5, Math.min(100, rhPct));
  const tw =
    tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;
  return Number(tw.toFixed(1));
}

/**
 * Approximated black-globe temperature (°C) from air temp, solar irradiance (W/m²), and wind speed (m/s).
 */
export function computeGlobeTempApprox(tempC: number, solarWm2: number, windMs: number): number {
  const v = Math.max(0.5, windMs);
  const deltaGlobe = (0.0155 * solarWm2) / Math.pow(v, 0.45);
  return Number((tempC + deltaGlobe).toFixed(1));
}

/**
 * Outdoor WBGT = 0.7 * Tw + 0.2 * Tg + 0.1 * Ta (ISO 7243).
 */
export function computeOutdoorWbgt(tempC: number, rhPct: number, windMs: number, solarWm2: number): {
  wetBulbC: number;
  globeTempC: number;
  wbgtC: number;
  heatIndexC: number;
} {
  const wetBulbC = computeWetBulbStull(tempC, rhPct);
  const globeTempC = computeGlobeTempApprox(tempC, solarWm2, windMs);
  const wbgtC = Number((0.7 * wetBulbC + 0.2 * globeTempC + 0.1 * tempC).toFixed(1));

  // Rothfusz heat index approximation in °C
  const tf = tempC * 1.8 + 32;
  const r = rhPct;
  let hiF =
    -42.379 +
    2.04901523 * tf +
    10.14333127 * r -
    0.22475541 * tf * r -
    0.00683783 * tf * tf -
    0.05481717 * r * r +
    0.00122874 * tf * tf * r +
    0.00085282 * tf * r * r -
    0.00000199 * tf * tf * r * r;
  if (tf < 80) hiF = tf;
  const heatIndexC = Number((((hiF - 32) * 5) / 9).toFixed(1));

  return { wetBulbC, globeTempC, wbgtC, heatIndexC };
}

/**
 * UAE Ministerial Resolution No. 44 of 2022:
 * Outdoor Midday Working Break is mandatory 12:30–15:00 GST (June 15 – September 15).
 */
export function isInMiddayBreakWindow(hourGst: number, minuteGst = 0): boolean {
  const totalMin = hourGst * 60 + minuteGst;
  return totalMin >= 12 * 60 + 30 && totalMin < 15 * 60;
}

export function getHistoricalObservationForHour(hourGst: number): EnvironmentalObservation {
  const clamped = Math.max(6, Math.min(19, Math.round(hourGst)));
  const row =
    HISTORICAL_UAE_HEATWAVE_CURVE.find((r) => r.hourGst === clamped) ??
    HISTORICAL_UAE_HEATWAVE_CURVE[5];
  return {
    ...row,
    mode: 'historical_heatwave',
    sourceLabel: 'Historical UAE Summer Heatwave Record (Abu Dhabi Mussafah CSV)',
    inUaeMiddayBreakWindow: isInMiddayBreakWindow(row.hourGst, 0),
    feedStatus: 'historical_calibration',
    provider: 'Historical UAE CSV',
    edgeOfflineActive: false,
    lastLiveSyncIso: null,
    resilienceReason: null,
  };
}
