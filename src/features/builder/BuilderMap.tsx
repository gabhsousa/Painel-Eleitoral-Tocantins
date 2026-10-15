import { useCallback, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { indicatorLabels as labels, indicatorFormat as format } from './indicators';
import type { MapIndicator, AbstentionScale } from './indicators';
import type { Row } from '../../shared/types';
import { buildHeatPoints, buildHeatScale, pointDistribution } from './heatData';
import { HeatRenderer } from './HeatRenderer';
import type { MapViewport } from './builderStorage';

type Props = {
  geometry: FeatureCollection<Polygon | MultiPolygon>;
  data: Row[];
  indicator: MapIndicator;
  theme: 'light' | 'dark';
  municipio: string;
  initialViewport?: MapViewport;
  onViewport?: (viewport: MapViewport) => void;
  abstentionScale?: AbstentionScale;
  municipalValues?: Row[];
  municipalMetric?: MapIndicator;
  municipalColor?: string;
  onMunicipio: (codigo: string) => void;
  onZoom: (zoom: number) => void;
};

const number = (value: unknown) => Number(value) || 0;

export function BuilderMap({
  geometry,
  data,
  indicator,
  theme,
  municipio,
  initialViewport,
  onViewport,
  abstentionScale,
  municipalValues,
  municipalMetric = 'votos',
  municipalColor = '#315c98',
  onMunicipio,
  onZoom,
}: Props) {
  const element = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    map = useRef<L.Map | null>(null),
    streets = useRef<L.TileLayer | null>(null),
    boundaries = useRef<L.FeatureGroup | null>(null),
    frame = useRef(0),
    drawRef = useRef<() => void>(() => {});
  const restoredViewport = useRef(initialViewport),
    lastScope = useRef<{ geometry: Props['geometry']; municipio: string } | null>(null);
  const heatPoints = useMemo(() => buildHeatPoints(data, indicator), [data, indicator]);
  const scale = useMemo(() => buildHeatScale(heatPoints), [heatPoints]);
  const distribution = useMemo(
    () => abstentionScale ?? pointDistribution(heatPoints),
    [abstentionScale, heatPoints],
  );
  const renderer = useRef<HeatRenderer | null>(null);
  if (!renderer.current) renderer.current = new HeatRenderer();
  const drawHeat = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (map.current && canvas.current)
        renderer.current!.draw(map.current, canvas.current, {
          points: heatPoints,
          scale,
          distribution,
          indicator,
          municipio,
        });
    });
  }, [heatPoints, scale, distribution, indicator, municipio]);
  drawRef.current = drawHeat;
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 5,
      maxZoom: 17,
      zoomSnap: 0.25,
      scrollWheelZoom: true,
      preferCanvas: true,
    });
    streets.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      minZoom: 5,
      maxZoom: 19,
      opacity: 0,
      className: 'street-tiles',
      crossOrigin: true,
    }).addTo(instance);
    L.control
      .zoom({ position: 'topright', zoomInTitle: 'Aproximar mapa', zoomOutTitle: 'Afastar mapa' })
      .addTo(instance);
    boundaries.current = L.featureGroup().addTo(instance);
    map.current = instance;
    const hide = () => canvas.current?.classList.add('is-moving'),
      show = () => {
        canvas.current?.classList.remove('is-moving');
        drawRef.current();
      };
    instance.on('zoomstart movestart', hide);
    instance.on('zoomend moveend', show);
    const observer = new ResizeObserver(() => {
      instance.invalidateSize({ pan: false });
      drawRef.current();
    });
    observer.observe(element.current);
    return () => {
      cancelAnimationFrame(frame.current);
      observer.disconnect();
      instance.off('zoomstart movestart', hide);
      instance.off('zoomend moveend', show);
      instance.remove();
      map.current = null;
      streets.current = null;
      boundaries.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const report = () => {
      const zoom = instance.getZoom();
      if (Number.isFinite(zoom)) onZoom(zoom);
    };
    instance.on('zoomend', report);
    report();
    return () => {
      instance.off('zoomend', report);
    };
  }, [onZoom]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !onViewport) return;
    const report = () => {
      const zoom = instance.getZoom();
      if (!Number.isFinite(zoom)) return;
      const center = instance.getCenter();
      onViewport({ latitude: center.lat, longitude: center.lng, zoom });
    };
    instance.on('moveend', report);
    return () => {
      instance.off('moveend', report);
    };
  }, [onViewport]);
  useEffect(() => {
    const instance = map.current,
      group = boundaries.current;
    if (!instance || !group) return;
    group.clearLayers();
    const border = theme === 'dark' ? '#59616c' : '#aab7c7',
      fill = theme === 'dark' ? '#171b20' : '#ffffff',
      activeFill = theme === 'dark' ? '#252b33' : '#edf1f5';
    const values = new Map(
      (municipalValues || []).map((row) => [String(row.municipio_codigo), row]),
    );
    const maximum = Math.max(
      1,
      ...(municipalValues || []).map((row) => number(row[municipalMetric])),
    );
    const shade = (value: number) => {
      const amount = Math.max(0, Math.min(1, value / maximum)),
        base = theme === 'dark' ? [37, 43, 51] : [235, 241, 248],
        color = municipalColor.replace('#', '');
      return `rgb(${base.map((channel, index) => Math.round(channel + (parseInt(color.slice(index * 2, index * 2 + 2), 16) - channel) * (0.18 + 0.82 * amount))).join(',')})`;
    };
    const geo = L.geoJSON(geometry, {
      style: (feature) => {
        const code = String(feature?.properties?.municipio_codigo),
          active = code === municipio,
          row = !municipio || active ? values.get(code) : undefined,
          colored = municipalValues !== undefined;
        return {
          color: active ? (theme === 'dark' ? '#ffffff' : '#142b49') : border,
          weight: active ? 1.6 : 0.65,
          fillColor: colored
            ? row?.[municipalMetric] != null
              ? shade(number(row[municipalMetric]))
              : fill
            : active
              ? activeFill
              : fill,
          fillOpacity: colored
            ? municipio && !active
              ? 0.42
              : 1
            : municipio
              ? active
                ? 0.08
                : 0.3
              : theme === 'dark'
                ? 0.62
                : 0.72,
          interactive: true,
        };
      },
      onEachFeature: (feature, layer) => {
        const code = String(feature.properties?.municipio_codigo),
          name = String(feature.properties?.nome_ibge);
        const row = values.get(code),
          label = document.createElement('span');
        label.textContent =
          municipalValues && (!municipio || code === municipio)
            ? `${name} · ${row?.[municipalMetric] != null ? format(number(row[municipalMetric]), municipalMetric) : 'Sem dados'} · ${labels[municipalMetric]}`
            : name;
        layer.bindTooltip(label, { sticky: true, className: 'city-tooltip', direction: 'top' });
        layer.on('click', () => onMunicipio(code));
      },
    }).addTo(group);
    const bounds = group.getBounds();
    if (bounds.isValid()) instance.setMaxBounds(bounds.pad(0.45));
    const activeLayer = geo
      .getLayers()
      .find(
        (layer) =>
          String(
            (layer as L.Layer & { feature?: { properties?: Record<string, unknown> } }).feature
              ?.properties?.municipio_codigo,
          ) === municipio,
      ) as L.Polygon | undefined;
    // Data/style refreshes preserve the camera. Only changing geography or city
    // fits the map; the first mount can restore the user's saved camera instead.
    if (
      !lastScope.current ||
      lastScope.current.geometry !== geometry ||
      lastScope.current.municipio !== municipio
    ) {
      const saved = !lastScope.current ? restoredViewport.current : undefined;
      lastScope.current = { geometry, municipio };
      instance.stop();
      if (saved)
        instance.setView([saved.latitude, saved.longitude], saved.zoom, { animate: false });
      else
        instance.fitBounds(activeLayer?.getBounds() || bounds, {
          padding: municipio ? [70, 70] : [44, 44],
          maxZoom: municipio ? 12 : undefined,
          animate: false,
        });
    }
    drawRef.current();
  }, [geometry, theme, municipio, onMunicipio, municipalValues, municipalMetric, municipalColor]);
  useEffect(() => {
    const instance = map.current,
      tiles = streets.current;
    if (!instance || !tiles) return;
    const update = () => {
      const progress = Math.max(0, Math.min(1, (instance.getZoom() - 6) / 7));
      tiles.setOpacity((theme === 'dark' ? 0.2 : 0.16) + progress * 0.58);
    };
    update();
    instance.on('zoom', update);
    return () => {
      instance.off('zoom', update);
    };
  }, [municipio, theme]);
  useEffect(() => drawHeat(), [drawHeat]);
  return (
    <div
      className="builder-map-shell"
      aria-label={
        municipalValues !== undefined
          ? `Mapa eleitoral por município: ${labels[municipalMetric]}`
          : `Mapa de calor dos locais de votação: ${labels[indicator]}`
      }
    >
      <div className="builder-map" ref={element} />
      <canvas className="heat-canvas" ref={canvas} aria-hidden="true" />
    </div>
  );
}
