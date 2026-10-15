import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { MapCardCanvas } from './MapCardCanvas';
import { MapCitySearch } from './MapCitySearch';
import { MapConfigDialog } from './MapConfigDialog';
import { ConfiguredMap } from './ConfiguredMap';
import {
  addBuilderMap,
  EMPTY_MAP_VIEW,
  loadBuilderDraft,
  removeBuilderMap,
  saveBuilderDraft,
  selectBuilderCity,
} from './builderStorage';
import type { CanvasState, MapConfig, MapView } from './builderStorage';
import type { Row } from '../../shared/types';
type Geometry = FeatureCollection<Polygon | MultiPolygon>;
type Props = {
  geometry: Geometry | null;
  theme: 'light' | 'dark';
  cargo: string;
  eleicao: string;
  offices: Row[];
};
function Plus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MapBuilderPage({ geometry, theme, cargo, eleicao, offices }: Props) {
  const [draft, setDraft] = useState(loadBuilderDraft);
  const [saved, setSaved] = useState(true);
  const cards = draft.cards;
  const cities = useMemo(
    () =>
      (geometry?.features || [])
        .map((feature) => ({
          code: String(feature.properties?.municipio_codigo),
          name: String(feature.properties?.nome_ibge),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [geometry],
  );
  useEffect(() => {
    setSaved(saveBuilderDraft(draft));
  }, [draft]);
  const updateCanvas = useCallback(
    (canvas: CanvasState) => setDraft((previous) => ({ ...previous, canvas })),
    [],
  );
  const updateView = useCallback(
    (id: string, view: Partial<MapView>) =>
      setDraft((previous) => {
        if (!previous.cards.some((card) => card.id === id)) return previous;
        if (view.municipio !== undefined) return selectBuilderCity(previous, id, view.municipio);
        const current = previous.views[id] || EMPTY_MAP_VIEW,
          next = { ...current, ...view };
        if (
          next.municipio === current.municipio &&
          next.viewport?.latitude === current.viewport?.latitude &&
          next.viewport?.longitude === current.viewport?.longitude &&
          next.viewport?.zoom === current.viewport?.zoom
        )
          return previous;
        return { ...previous, views: { ...previous.views, [id]: next } };
      }),
    [],
  );
  const [dialog, setDialog] = useState<{ card: MapConfig | null } | null>(null);
  const available = offices.length
    ? offices
    : [{ cargo_codigo: cargo, cargo: 'Presidente', eleicao_codigo: eleicao }];
  const add = () => setDialog({ card: null });
  return (
    <div className="builder-editor">
      <section className="builder-canvas" aria-label="Área de composição do mapa">
        <div className="canvas-toolbar editor-toolbar">
          <div>
            <span>CONSTRUTOR DE MAPAS</span>
            <strong>
              {cards.length
                ? `${cards.length} ${cards.length === 1 ? 'mapa' : 'mapas'}`
                : 'Sua composição'}
            </strong>
            <small className="builder-save-status" role="status">
              {saved ? 'Salvo neste navegador' : 'Salvo nesta sessão'}
            </small>
          </div>
          <button className="add-map-button" onClick={add}>
            <Plus />
            Adicionar mapa
          </button>
        </div>
        <MapCardCanvas
          canvas={draft.canvas}
          onCanvasChange={updateCanvas}
          cards={cards.map((card, index) => ({
            id: card.id,
            title: card.title,
            caption: `${card.kind === 'heat' ? 'CALOR' : 'MAPA ELEITORAL'} · ${card.cargoName}`,
            controls: (
              <MapCitySearch
                cities={cities}
                value={draft.views[card.id]?.municipio || ''}
                mapNumber={index + 1}
                onSelect={(code) =>
                  setDraft((previous) => selectBuilderCity(previous, card.id, code))
                }
              />
            ),
            children: (
              <ConfiguredMap
                config={card}
                geometry={geometry}
                theme={theme}
                view={draft.views[card.id] || EMPTY_MAP_VIEW}
                onViewChange={updateView}
              />
            ),
          }))}
          onAdd={add}
          onTitleChange={(id, title) =>
            setDraft((previous) => ({
              ...previous,
              cards: previous.cards.map((card) => (card.id === id ? { ...card, title } : card)),
            }))
          }
          onConfigure={(id) => setDialog({ card: cards.find((card) => card.id === id) || null })}
          onRemove={(id) => setDraft((previous) => removeBuilderMap(previous, id))}
        />
      </section>
      {dialog && (
        <MapConfigDialog
          key={dialog.card?.id || 'new'}
          initial={dialog.card}
          offices={available}
          defaultCargo={cargo}
          onClose={() => setDialog(null)}
          onSave={(config) => {
            setDraft((previous) =>
              dialog.card
                ? {
                    ...previous,
                    cards: previous.cards.map((card) => (card.id === config.id ? config : card)),
                  }
                : addBuilderMap(previous, config),
            );
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
