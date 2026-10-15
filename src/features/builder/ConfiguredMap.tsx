import { memo, useCallback, useMemo, useState } from 'react';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { BuilderMap } from './BuilderMap';
import { indicatorLabels, indicatorFormat, isVoting, isNonNominal } from './indicators';
import { MapDataPanel } from './MapDataPanel';
import { heatRadiusAtZoom } from './heatZoom';
import { useData } from '../../shared/api/useData';
import type { MapConfig, MapView, MapViewport } from './builderStorage';
import type { Row } from '../../shared/types';
type Geometry = FeatureCollection<Polygon | MultiPolygon>;
type VoteMap = { municipios: Row[]; locais: Row[] };
type ParticipationMap = VoteMap & { escala: Row | null };
export const ConfiguredMap = memo(function ConfiguredMap({
  config,
  geometry,
  theme,
  view,
  onViewChange,
}: {
  config: MapConfig;
  geometry: Geometry | null;
  theme: 'light' | 'dark';
  view: MapView;
  onViewChange: (id: string, view: Partial<MapView>) => void;
}) {
  const municipio = view.municipio;
  const [zoom, setZoom] = useState(view.viewport?.zoom || 5);
  const setMunicipio = useCallback(
    (municipio: string) => onViewChange(config.id, { municipio }),
    [config.id, onViewChange],
  );
  const setViewport = useCallback(
    (viewport: MapViewport) => onViewChange(config.id, { viewport }),
    [config.id, onViewChange],
  );
  const voting = isVoting(config.metric),
    nonNominal = isNonNominal(config.metric),
    blank = config.metric === 'blank';
  const params = `ano=2026&turno=1&cargo=${config.cargo}&eleicao=${config.eleicao}`;
  const votes = useData<VoteMap>(
    voting
      ? `/api/mapa/votacao?${params}${config.candidato ? `&candidato=${config.candidato}` : ''}`
      : null,
  );
  const nonNominalVotes = useData<VoteMap>(nonNominal ? `/api/mapa/nao-nominais?${params}` : null);
  const participation = useData<ParticipationMap>(
    !blank && !voting && !nonNominal && config.kind === 'heat'
      ? `/api/mapa/participacao?${params}`
      : null,
  );
  const regions = useData<Row[]>(
    !blank && !voting && !nonNominal && config.kind === 'normal'
      ? `/api/mapa/indicadores?${params}`
      : null,
  );
  const empty = useMemo<Row[]>(() => [], []);
  const municipalValues = voting
    ? votes.data?.municipios || empty
    : nonNominal
      ? nonNominalVotes.data?.municipios || empty
      : regions.data || empty;
  const localValues = useMemo(
    () =>
      (voting
        ? votes.data?.locais || empty
        : nonNominal
          ? nonNominalVotes.data?.locais || empty
          : participation.data?.locais || empty
      ).map((row) => ({
        ...row,
        percentual_comparecimento:
          row.aptos && Number(row.aptos) > 0
            ? (100 * Number(row.comparecimento)) / Number(row.aptos)
            : null,
      })),
    [voting, nonNominal, votes.data, nonNominalVotes.data, participation.data, empty],
  );
  const loading = voting
    ? votes.loading
    : nonNominal
      ? nonNominalVotes.loading
      : config.kind === 'normal'
        ? regions.loading
        : participation.loading;
  const error = voting
    ? votes.error
    : nonNominal
      ? nonNominalVotes.error
      : config.kind === 'normal'
        ? regions.error
        : participation.error;
  const maximum = Math.max(0, ...municipalValues.map((row) => Number(row[config.metric]) || 0));
  const scale = useMemo(
    () =>
      config.metric === 'percentual_abstencao' && participation.data?.escala
        ? {
            minimo: Number(participation.data.escala.minimo),
            media: Number(participation.data.escala.media),
            maximo: Number(participation.data.escala.maximo),
          }
        : undefined,
    [config.metric, participation.data],
  );
  const names = useMemo(
    () =>
      new Map(
        (geometry?.features || []).map((feature) => [
          String(feature.properties?.municipio_codigo),
          String(feature.properties?.nome_ibge),
        ]),
      ),
    [geometry],
  );
  return (
    <>
      {geometry ? (
        <BuilderMap
          geometry={geometry}
          data={config.kind === 'heat' ? localValues : empty}
          indicator={config.kind === 'heat' ? config.metric : 'blank'}
          theme={theme}
          municipio={municipio}
          initialViewport={view.viewport}
          onViewport={setViewport}
          onMunicipio={setMunicipio}
          onZoom={setZoom}
          abstentionScale={scale}
          municipalValues={config.kind === 'normal' && !blank ? municipalValues : undefined}
          municipalMetric={config.metric}
          municipalColor={config.color}
        />
      ) : (
        <div className="card-loading">Carregando malha municipal…</div>
      )}
      {municipio && (
        <button className="builder-map-back" onClick={() => setMunicipio('')}>
          <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 5-7 7 7 7M5 12h14" />
          </svg>
          Ver Tocantins
        </button>
      )}
      {loading && !blank && <span className="card-data-status">Carregando dados…</span>}
      {error && !blank && (
        <div className="builder-data-error" role="alert">
          {error}
        </div>
      )}
      <MapDataPanel
        kind={config.kind}
        metric={config.metric}
        cargoName={config.cargoName}
        candidateName={config.candidatoName}
        rows={config.kind === 'heat' ? localValues : municipalValues}
        names={names}
        municipio={municipio}
        loading={loading}
        error={error}
      />
      {!blank && !loading && !error && (config.kind === 'normal' || heatRadiusAtZoom(zoom) > 0) && (
        <div className="heat-legend" aria-label="Escala do mapa">
          <div>
            <span>
              {config.kind === 'heat' && scale ? `${scale.minimo.toLocaleString('pt-BR')}%` : '0'}
            </span>
            <i
              style={
                config.kind === 'normal'
                  ? {
                      background: `linear-gradient(90deg, ${theme === 'dark' ? '#252b33' : '#ebf1f8'}, ${config.color})`,
                    }
                  : undefined
              }
            />
            <span>
              {config.kind === 'heat' && scale
                ? `${scale.maximo.toLocaleString('pt-BR')}%`
                : config.kind === 'normal'
                  ? indicatorFormat(maximum, config.metric)
                  : 'Maior'}
            </span>
          </div>
          <small>{indicatorLabels[config.metric]}</small>
          {config.kind === 'heat' && scale && (
            <small>Média estadual {scale.media.toLocaleString('pt-BR')}%</small>
          )}
        </div>
      )}
      <small className="map-source">
        Fonte: TSE · Limites: IBGE ·{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap
        </a>
      </small>
    </>
  );
});
