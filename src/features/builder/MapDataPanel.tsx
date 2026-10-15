import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { indicatorFormat, indicatorLabels } from './indicators';
import type { MapIndicator } from './indicators';
import type { Row } from '../../shared/types';

type Props = {
  kind: 'normal' | 'heat';
  metric: MapIndicator;
  cargoName: string;
  candidateName: string;
  rows: Row[];
  names: Map<string, string>;
  municipio: string;
  loading: boolean;
  error: string | null;
};
const ROW_HEIGHT = 142;
type DataField = MapIndicator | 'votos_nominais';
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const display = (value: Row[string], metric: DataField) =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—'
    : indicatorFormat(Number(value), metric === 'votos_nominais' ? 'votos' : metric);
function Eye() {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function MapDataPanel(props: Props) {
  const [open, setOpen] = useState(false),
    id = useId(),
    trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <button
        ref={trigger}
        className="map-data-trigger"
        data-card-control
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
      >
        <Eye />
        Ver dados
      </button>
      {open && <DataCard {...props} id={id} onClose={close} />}
    </>
  );
}
function DataCard({
  kind,
  metric,
  cargoName,
  candidateName,
  rows,
  names,
  municipio,
  loading,
  error,
  id,
  onClose,
}: Props & { id: string; onClose: () => void }) {
  const [search, setSearch] = useState(''),
    [allState, setAllState] = useState(false),
    [viewport, setViewport] = useState({ top: 0, height: 400 });
  const scroll = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const items = useMemo(() => {
    const query = normalize(search.trim());
    return rows
      .filter((row) => !municipio || allState || String(row.municipio_codigo) === municipio)
      .map((row) => {
        const city =
          names.get(String(row.municipio_codigo)) || String(row.municipio || row.municipio_codigo);
        const name = kind === 'heat' ? String(row.local_nome || `Local ${row.local_codigo}`) : city;
        return { row, city, name };
      })
      .filter(
        (item) =>
          !query ||
          normalize(
            `${item.name} ${item.city} ${item.row.local_codigo || ''} ${item.row.zona || ''}`,
          ).includes(query),
      )
      .sort(
        (a, b) =>
          a.city.localeCompare(b.city, 'pt-BR') ||
          a.name.localeCompare(b.name, 'pt-BR') ||
          String(a.row.zona).localeCompare(String(b.row.zona), undefined, { numeric: true }) ||
          String(a.row.local_codigo).localeCompare(String(b.row.local_codigo), undefined, {
            numeric: true,
          }),
      );
  }, [rows, names, municipio, allState, search, kind]);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    setSearch('');
    setAllState(false);
  }, [municipio]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const measure = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
    setViewport((previous) => ({ ...previous, top: 0 }));
  }, [search, municipio, allState, metric, rows]);
  const start = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - 3),
    end = Math.min(items.length, Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + 3);
  const voting = metric === 'votos' || metric === 'percentual_votos';
  const fields: DataField[] = voting
    ? ['votos', 'votos_nominais', 'percentual_votos']
    : metric === 'abstencoes_brancos_nulos'
      ? ['abstencoes', 'brancos', 'nulos']
      : metric === 'brancos' || metric === 'nulos'
        ? ['aptos', 'comparecimento', metric === 'brancos' ? 'nulos' : 'brancos']
        : ['aptos', 'comparecimento', 'abstencoes'];
  const scope = municipio && !allState ? names.get(municipio) || municipio : 'Tocantins';
  return (
    <section
      id={id}
      className="map-data-card"
      data-card-control
      role="region"
      aria-label="Dados do mapa"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className="map-data-heading">
        <div>
          <span>DADOS DA VISUALIZAÇÃO</span>
          <h3>Dados do mapa</h3>
        </div>
        <button
          ref={close}
          className="config-close"
          aria-label="Fechar dados do mapa"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <div className="map-data-context">
        <strong>{indicatorLabels[metric]}</strong>
        <span>{cargoName} · 2026 · 1º turno</span>
        {candidateName && <span>{candidateName}</span>}
      </div>
      {metric !== 'blank' && (
        <div className="map-data-filters">
          <label className="map-data-search">
            <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10" cy="10" r="6" />
              <path d="m15 15 5 5" />
            </svg>
            <input
              aria-label="Buscar nos dados do mapa"
              placeholder={kind === 'heat' ? 'Buscar cidade, local ou código' : 'Buscar município'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="map-data-scope">
            <span>
              {scope} · {items.length.toLocaleString('pt-BR')}{' '}
              {kind === 'heat'
                ? items.length === 1
                  ? 'local'
                  : 'locais'
                : items.length === 1
                  ? 'município'
                  : 'municípios'}
            </span>
            {municipio && (
              <button onClick={() => setAllState((value) => !value)}>
                {allState ? 'Só esta cidade' : 'Todo o estado'}
              </button>
            )}
          </div>
        </div>
      )}
      <div
        ref={scroll}
        className="map-data-scroll"
        tabIndex={0}
        aria-label="Lista de dados"
        onScroll={(event) =>
          setViewport({
            top: event.currentTarget.scrollTop,
            height: event.currentTarget.clientHeight,
          })
        }
      >
        {metric === 'blank' ? (
          <p className="map-data-empty">Este mapa está em branco, sem um indicador de dados.</p>
        ) : loading ? (
          <p className="map-data-empty" role="status">
            Carregando dados…
          </p>
        ) : error ? (
          <p className="map-data-empty" role="alert">
            {error}
          </p>
        ) : !items.length ? (
          <p className="map-data-empty">Nenhum registro encontrado.</p>
        ) : (
          <div
            role="list"
            aria-label={kind === 'heat' ? 'Locais de votação' : 'Municípios'}
            style={{ height: items.length * ROW_HEIGHT, position: 'relative' }}
          >
            {items.slice(start, end).map(({ row, city, name }, index) => (
              <div
                className="map-data-row"
                role="listitem"
                key={`${row.municipio_codigo}/${row.zona || ''}/${row.local_codigo || ''}`}
                style={{ top: (start + index) * ROW_HEIGHT, height: ROW_HEIGHT }}
                aria-posinset={start + index + 1}
                aria-setsize={items.length}
              >
                <strong className="map-data-name" title={name}>
                  {name}
                </strong>
                <small>
                  {kind === 'heat'
                    ? `${city} · Zona ${row.zona} · Local ${row.local_codigo}`
                    : `Código ${row.municipio_codigo}`}
                </small>
                <div className="map-data-value">
                  <span>{indicatorLabels[metric]}</span>
                  <strong>{display(row[metric], metric)}</strong>
                </div>
                {Number(row.secoes_sem_votos) > 0 && (
                  <span className="map-data-incomplete">Dados de votos incompletos</span>
                )}
                <dl>
                  {fields
                    .filter((field) => field !== metric && row[field] != null)
                    .map((field) => (
                      <div key={field}>
                        <dt>
                          {field === 'votos_nominais'
                            ? 'Total de votos nominais'
                            : indicatorLabels[field]}
                        </dt>
                        <dd>{display(row[field], field)}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>
      <footer className="map-data-source">
        Fonte: TSE ·{' '}
        {kind === 'heat' ? 'Locais com coordenadas usados no mapa.' : 'Dados por município.'}{' '}
        {metric === 'percentual_abstencao'
          ? 'Taxa = ausentes ÷ aptos × 100.'
          : metric === 'percentual_votos'
            ? 'Percentual = votos selecionados ÷ votos nominais × 100.'
            : metric === 'abstencoes_brancos_nulos'
              ? 'Agregado = abstenções + votos brancos + votos nulos do cargo.'
              : metric === 'brancos' || metric === 'nulos'
                ? 'Quantidade de votos para o cargo selecionado.'
                : ''}
      </footer>
    </section>
  );
}
