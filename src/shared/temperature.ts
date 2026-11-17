export type TemperatureUnit = 'C' | 'F';

export function celsiusToFahrenheit(tempC: number): number {
  return (tempC * 9) / 5 + 32;
}

export function fahrenheitToCelsius(tempF: number): number {
  return ((tempF - 32) * 5) / 9;
}

export function formatTemperature(
  tempC: number,
  unit: TemperatureUnit,
  decimals = 1
): string {
  const value = unit === 'F' ? celsiusToFahrenheit(tempC) : tempC;
  return `${value.toFixed(decimals)}°${unit}`;
}

export function formatTemperatureText(
  text: string,
  unit: TemperatureUnit
): string {
  if (unit === 'C') return text;
  return text.replace(/(-?\d+(?:\.\d+)?)°C/g, (_match, numStr) => {
    const valC = Number(numStr);
    if (!Number.isFinite(valC)) return _match;
    return `${celsiusToFahrenheit(valC).toFixed(1)}°F`;
  });
}
