import type { Map as LeafletMap } from 'leaflet';
import { HEAT_BRUSH_EXTENT, heatRadiusAtZoom, heatVolumeRadius } from './heatZoom';
import { abstentionWeight, normalizeRange } from './heatData';
import type { HeatPoint, HeatScale } from './heatData';
import type { AbstentionScale, MapIndicator } from './indicators';
import { heatPalette } from './heatPalette';

type Brush = { canvas: HTMLCanvasElement; extent: number };
type HeatFrame = {
  points: HeatPoint[];
  scale: HeatScale;
  distribution: AbstentionScale;
  indicator: MapIndicator;
  municipio: string;
};

function resize(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

/** Reuses kernels and the offscreen surface; only colors pixels touched by visible schools. */
export class HeatRenderer {
  private surface: HTMLCanvasElement | null = null;
  private readonly brushes = new Map<number, Brush>();

  private brushFor(radius: number): Brush | null {
    if (radius < 1) return null;
    const key = Math.round(radius * 4) / 4;
    const cached = this.brushes.get(key);
    if (cached) return cached;
    const extent = key * HEAT_BRUSH_EXTENT;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.ceil(extent * 2);
    const context = canvas.getContext('2d');
    if (!context) return null;
    const gradient = context.createRadialGradient(extent, extent, 0, extent, extent, extent);
    gradient.addColorStop(0, 'rgba(0,0,0,.96)');
    gradient.addColorStop(0.18, 'rgba(0,0,0,.85)');
    gradient.addColorStop(0.4, 'rgba(0,0,0,.5)');
    gradient.addColorStop(0.68, 'rgba(0,0,0,.16)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const brush = { canvas, extent };
    if (this.brushes.size >= 128) this.brushes.delete(this.brushes.keys().next().value!);
    this.brushes.set(key, brush);
    return brush;
  }

  draw(map: LeafletMap, target: HTMLCanvasElement, frame: HeatFrame) {
    const size = map.getSize();
    const width = Math.max(1, size.x),
      height = Math.max(1, size.y);
    const context = target.getContext('2d');
    if (!context) return;
    resize(target, width, height);
    target.style.width = `${size.x}px`;
    target.style.height = `${size.y}px`;
    context.clearRect(0, 0, width, height);
    const radius = heatRadiusAtZoom(map.getZoom());
    if (!radius || !frame.points.length) return;

    const surface = (this.surface ??= document.createElement('canvas'));
    resize(surface, width, height);
    const intensity = surface.getContext('2d', { willReadFrequently: true });
    if (!intensity) return;
    intensity.clearRect(0, 0, width, height);
    let left = width,
      top = height,
      right = 0,
      bottom = 0;

    for (const point of frame.points) {
      if (frame.municipio && point.municipio !== frame.municipio) continue;
      const position = map.latLngToContainerPoint([point.latitude, point.longitude]);
      const volume = normalizeRange(point.volume, frame.scale.volumeMin, frame.scale.volumeMax);
      const brush = this.brushFor(radius * heatVolumeRadius(volume));
      if (!brush) continue;
      const x = position.x - brush.extent,
        y = position.y - brush.extent;
      if (x > width || y > height || x + brush.canvas.width < 0 || y + brush.canvas.height < 0)
        continue;
      const weight =
        frame.indicator === 'percentual_abstencao'
          ? abstentionWeight(point.value, frame.distribution)
          : normalizeRange(point.value, frame.scale.min, frame.scale.max);
      intensity.globalAlpha = 0.1 + weight * 0.6;
      intensity.drawImage(brush.canvas, x, y);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + brush.canvas.width);
      bottom = Math.max(bottom, y + brush.canvas.height);
    }
    intensity.globalAlpha = 1;
    // Include one pixel for fractional drawImage edges. Keep geographic projection unchanged.
    const x = Math.max(0, Math.floor(left) - 1),
      y = Math.max(0, Math.floor(top) - 1);
    const w = Math.min(width, Math.ceil(right) + 1) - x;
    const h = Math.min(height, Math.ceil(bottom) + 1) - y;
    if (w <= 0 || h <= 0) return;
    const image = intensity.getImageData(x, y, w, h),
      pixels = image.data;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const alpha = pixels[offset + 3];
      if (alpha < 2) {
        pixels[offset + 3] = 0;
        continue;
      }
      const color = Math.min(255, Math.round(alpha * 1.42));
      pixels[offset] = heatPalette[color * 3];
      pixels[offset + 1] = heatPalette[color * 3 + 1];
      pixels[offset + 2] = heatPalette[color * 3 + 2];
      pixels[offset + 3] = Math.min(205, Math.round(alpha * 0.86));
    }
    context.putImageData(image, x, y);
  }
}
