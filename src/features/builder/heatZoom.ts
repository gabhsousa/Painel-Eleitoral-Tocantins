// Shared geographical scale for all municipalities. Selecting a city changes
// the camera, never the size or visibility of the heat layer at the same zoom.
export const HEAT_REFERENCE_ZOOM = 10;
export const HEAT_BASE_RADIUS = 3.5;
export const HEAT_MAX_RADIUS = 28;
export const HEAT_BRUSH_EXTENT = 1.45;
export const HEAT_MIN_ZOOM = HEAT_REFERENCE_ZOOM + Math.log2(1 / HEAT_BASE_RADIUS);
export function heatRadiusAtZoom(zoom: number) {
  const radius = Math.min(HEAT_MAX_RADIUS, HEAT_BASE_RADIUS * 2 ** (zoom - HEAT_REFERENCE_ZOOM));
  return radius < 1 ? 0 : radius;
}
// Volume changes the footprint gently, so large schools cannot engulf neighbours.
export function heatVolumeRadius(volume: number) {
  return 0.75 + 0.35 * Math.sqrt(Math.max(0, Math.min(1, volume)));
}
