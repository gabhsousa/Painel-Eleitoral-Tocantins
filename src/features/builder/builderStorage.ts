import { mapIndicators } from './indicators';
import type { MapIndicator } from './indicators';

export type Point = { x: number; y: number };
export type MapConfig = {
  id: string;
  kind: 'normal' | 'heat';
  metric: MapIndicator;
  cargo: string;
  eleicao: string;
  cargoName: string;
  candidato: string;
  candidatoName: string;
  color: string;
  title: string;
};
export type MapViewport = { latitude: number; longitude: number; zoom: number };
export type MapView = { municipio: string; viewport?: MapViewport };
export type CanvasState = { positions: Record<string, Point>; pan: Point; focused: string | null };
export type BuilderDraft = {
  version: 1;
  cards: MapConfig[];
  canvas: CanvasState;
  views: Record<string, MapView>;
};
export const BUILDER_STORAGE_KEY = 'eleitoral-map-builder:2026:1:v1';
export const EMPTY_MAP_VIEW: MapView = { municipio: '' };
const metrics = new Set<string>(mapIndicators);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const code = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{1,12}$/.test(value);
const point = (value: unknown): value is Point =>
  record(value) &&
  typeof value.x === 'number' &&
  typeof value.y === 'number' &&
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  Math.abs(value.x) <= 1e7 &&
  Math.abs(value.y) <= 1e7;
const config = (value: unknown): value is MapConfig =>
  record(value) &&
  text(value.id, 100) &&
  /^[\w-]+$/.test(value.id) &&
  !['__proto__', 'constructor', 'prototype'].includes(value.id) &&
  (value.kind === 'normal' || value.kind === 'heat') &&
  typeof value.metric === 'string' &&
  metrics.has(value.metric) &&
  code(value.cargo) &&
  code(value.eleicao) &&
  text(value.cargoName, 200) &&
  text(value.candidato, 12) &&
  (value.candidato === '' || code(value.candidato)) &&
  text(value.candidatoName, 200) &&
  text(value.title, 80) &&
  typeof value.color === 'string' &&
  /^#[\da-f]{6}$/i.test(value.color);
const viewport = (value: unknown): value is MapViewport =>
  record(value) &&
  typeof value.latitude === 'number' &&
  Number.isFinite(value.latitude) &&
  Math.abs(value.latitude) <= 90 &&
  typeof value.longitude === 'number' &&
  Number.isFinite(value.longitude) &&
  Math.abs(value.longitude) <= 180 &&
  typeof value.zoom === 'number' &&
  Number.isFinite(value.zoom) &&
  value.zoom >= 5 &&
  value.zoom <= 17;
export function emptyBuilderDraft(): BuilderDraft {
  return {
    version: 1,
    cards: [],
    canvas: { positions: {}, pan: { x: 0, y: 0 }, focused: null },
    views: {},
  };
}

// Restore only known fields: a damaged or older cache cannot break the editor.
export function decodeBuilderDraft(value: unknown): BuilderDraft {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.cards))
    return emptyBuilderDraft();
  const ids = new Set<string>(),
    cards: MapConfig[] = [];
  for (const item of value.cards) {
    if (!config(item) || ids.has(item.id)) continue;
    ids.add(item.id);
    cards.push({
      id: item.id,
      kind: item.kind,
      metric: item.metric,
      cargo: item.cargo,
      eleicao: item.eleicao,
      cargoName: item.cargoName,
      candidato: item.candidato,
      candidatoName: item.candidatoName,
      color: item.color,
      title: item.title,
    });
  }
  const canvas = record(value.canvas) ? value.canvas : {},
    positions = record(canvas.positions) ? canvas.positions : {},
    views = record(value.views) ? value.views : {};
  return {
    version: 1,
    cards,
    canvas: {
      positions: Object.fromEntries(
        cards.map((card, index) => {
          const saved = positions[card.id];
          return [
            card.id,
            point(saved)
              ? { x: saved.x, y: saved.y }
              : { x: (index % 3) * 460, y: Math.floor(index / 3) * 680 },
          ];
        }),
      ),
      pan: point(canvas.pan) ? { x: canvas.pan.x, y: canvas.pan.y } : { x: 0, y: 0 },
      focused:
        typeof canvas.focused === 'string' && ids.has(canvas.focused) ? canvas.focused : null,
    },
    views: Object.fromEntries(
      cards.map((card) => {
        const saved = views[card.id],
          view = record(saved) ? saved : {};
        return [
          card.id,
          {
            municipio: code(view.municipio) ? view.municipio : '',
            ...(viewport(view.viewport)
              ? {
                  viewport: {
                    latitude: view.viewport.latitude,
                    longitude: view.viewport.longitude,
                    zoom: view.viewport.zoom,
                  },
                }
              : {}),
          },
        ];
      }),
    ),
  };
}
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
let sessionDraft = emptyBuilderDraft();
let storageFailed = false;
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
export function loadBuilderDraft(
  storage: StorageAccess | undefined = browserStorage(),
): BuilderDraft {
  if (storageFailed) return decodeBuilderDraft(sessionDraft);
  try {
    const saved = storage?.getItem(BUILDER_STORAGE_KEY);
    if (saved) return decodeBuilderDraft(JSON.parse(saved));
  } catch {}
  return decodeBuilderDraft(sessionDraft);
}
export function saveBuilderDraft(
  draft: BuilderDraft,
  storage: StorageAccess | undefined = browserStorage(),
): boolean {
  // Memory still preserves navigation when browser storage is disabled or full.
  sessionDraft = draft;
  try {
    if (!storage) {
      storageFailed = true;
      return false;
    }
    storage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(draft));
    storageFailed = false;
    return true;
  } catch {
    storageFailed = true;
    return false;
  }
}
export function addBuilderMap(draft: BuilderDraft, card: MapConfig): BuilderDraft {
  let index = 0;
  const occupied = new Set(
    Object.values(draft.canvas.positions).map((position) => `${position.x}/${position.y}`),
  );
  while (occupied.has(`${(index % 3) * 460}/${Math.floor(index / 3) * 680}`)) index++;
  const position = { x: (index % 3) * 460, y: Math.floor(index / 3) * 680 };
  return {
    ...draft,
    cards: [...draft.cards, card],
    canvas: {
      positions: { ...draft.canvas.positions, [card.id]: position },
      pan: { x: -position.x * 0.78 || 0, y: -position.y * 0.78 || 0 },
      focused: null,
    },
    views: { ...draft.views, [card.id]: EMPTY_MAP_VIEW },
  };
}
export function removeBuilderMap(draft: BuilderDraft, id: string): BuilderDraft {
  const { [id]: position, ...positions } = draft.canvas.positions,
    { [id]: view, ...views } = draft.views;
  return {
    ...draft,
    cards: draft.cards.filter((card) => card.id !== id),
    canvas: {
      ...draft.canvas,
      positions,
      focused: draft.canvas.focused === id ? null : draft.canvas.focused,
    },
    views,
  };
}
export function selectBuilderCity(
  draft: BuilderDraft,
  id: string,
  municipio: string,
): BuilderDraft {
  if (!draft.cards.some((card) => card.id === id)) return draft;
  const current = draft.views[id] || EMPTY_MAP_VIEW;
  if (current.municipio === municipio && draft.canvas.focused === id) return draft;
  return {
    ...draft,
    canvas: { ...draft.canvas, focused: id },
    views: { ...draft.views, [id]: current.municipio === municipio ? current : { municipio } },
  };
}
