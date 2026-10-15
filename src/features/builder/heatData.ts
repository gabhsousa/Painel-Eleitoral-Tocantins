import type { Row } from '../../shared/types';
import type { MapIndicator, AbstentionScale } from './indicators';
export type HeatPoint = {
  municipio: string;
  latitude: number;
  longitude: number;
  value: number;
  volume: number;
};

const number = (value: unknown) => Number(value) || 0;
export function buildHeatPoints(data: Row[], indicator: MapIndicator): HeatPoint[] {
  if (indicator === 'blank') return [];
  const grouped = new Map<
    string,
    {
      municipio: string;
      latitude: number;
      longitude: number;
      value: number;
      weighted: number;
      weight: number;
      volume: number;
    }
  >();
  for (const row of data) {
    const latitude = Number(row.latitude),
      longitude = Number(row.longitude),
      value = Number(row[indicator]);
    if (
      row[indicator] == null ||
      !Number.isFinite(value) ||
      row.latitude == null ||
      row.longitude == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      value < 0
    )
      continue;
    const aptos = Math.max(1, number(row.aptos));
    const city = String(row.municipio_codigo),
      key = `${city}/${latitude.toFixed(6)}/${longitude.toFixed(6)}`,
      current = grouped.get(key) || {
        municipio: city,
        latitude,
        longitude,
        value: 0,
        weighted: 0,
        weight: 0,
        volume: 0,
      };
    current.volume += aptos;
    if (indicator.startsWith('percentual')) {
      const denominator =
        indicator === 'percentual_votos' ? Math.max(1, number(row.votos_nominais)) : aptos;
      current.weighted += value * denominator;
      current.weight += denominator;
    } else current.value += value;
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((point) => ({
      municipio: point.municipio,
      latitude: point.latitude,
      longitude: point.longitude,
      value: indicator.startsWith('percentual') ? point.weighted / point.weight : point.value,
      volume: point.volume,
    }))
    .filter((point) => point.value > 0);
}
export function buildHeatScale(points: HeatPoint[]) {
  const values = points.map((point) => point.value).sort((a, b) => a - b),
    volumes = points.map((point) => point.volume).sort((a, b) => a - b);
  return {
    min: values[Math.floor(values.length * 0.05)] || 0,
    max: values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] || 0,
    volumeMin: volumes[Math.floor(volumes.length * 0.1)] || 0,
    volumeMax: volumes[Math.min(volumes.length - 1, Math.floor(volumes.length * 0.9))] || 0,
  };
}
export type HeatScale = ReturnType<typeof buildHeatScale>;

export function normalizeRange(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min)
    return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
export function abstentionWeight(value: number, scale: AbstentionScale) {
  if (scale.maximo <= scale.minimo) return 0.5;
  if (value <= scale.minimo) return 0;
  if (value >= scale.maximo) return 1;
  return value <= scale.media
    ? 0.5 * normalizeRange(value, scale.minimo, scale.media)
    : 0.5 + 0.5 * normalizeRange(value, scale.media, scale.maximo);
}
export function pointDistribution(points: HeatPoint[]): AbstentionScale {
  const values = points.map((point) => point.value);
  return {
    minimo: values.length ? Math.min(...values) : 0,
    maximo: values.length ? Math.max(...values) : 0,
    media: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
  };
}
