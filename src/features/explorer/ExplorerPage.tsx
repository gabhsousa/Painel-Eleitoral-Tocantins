import { useCallback, useEffect, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { ElectionMap } from './ElectionMap';
import { Metrics } from './Metrics';
import { Results } from './Results';
import { Dropdown } from '../../shared/ui/Dropdown';
import { LoadState } from '../../shared/ui/LoadState';
import { Icon } from '../../shared/ui/Icon';
import { useData, prefetchData } from '../../shared/api/useData';
import type { DataState } from '../../shared/api/useData';
import { num, pct } from '../../shared/lib/format';
import type { Row, MapLocal, MapLocations } from '../../shared/types';
export type ExplorerSelection = {
  municipio: string;
  cargo: string;
  search: string;
  selected: MapLocal | null;
  retry: number;
  votePage: number;
};
export const INITIAL_EXPLORER_SELECTION: ExplorerSelection = {
  municipio: '',
  cargo: '1',
  search: '',
  selected: null,
  retry: 0,
  votePage: 1,
};
type Props = {
  geometry: DataState<FeatureCollection<Polygon | MultiPolygon>>;
  offices: Row[];
  eleicao: string;
  theme: 'light' | 'dark';
  selection: ExplorerSelection;
  setSelection: Dispatch<SetStateAction<ExplorerSelection>>;
};
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const localKey = (l: MapLocal) => `${l.municipio_codigo}/${l.zona}/${l.local_codigo}`;
const emptyLocations: MapLocal[] = [];

export function ExplorerPage({
  geometry,
  offices,
  eleicao,
  theme,
  selection,
  setSelection,
}: Props) {
  const { municipio, cargo, search, selected, retry, votePage } = selection;
  const setSearch = (search: string) => setSelection((previous) => ({ ...previous, search }));
  const setSelected = (selected: MapLocal | null) =>
    setSelection((previous) => ({ ...previous, selected }));
  const setCargo = (cargo: string) => setSelection((previous) => ({ ...previous, cargo }));
  const setRetry = (update: (value: number) => number) =>
    setSelection((previous) => ({ ...previous, retry: update(previous.retry) }));
  const setVotePage = (value: number | ((value: number) => number)) =>
    setSelection((previous) => ({
      ...previous,
      votePage: typeof value === 'number' ? value : value(previous.votePage),
    }));
  const params = new URLSearchParams({
    ano: '2026',
    turno: '1',
    cargo,
    eleicao,
    pagina: String(retry + 1),
    ...(municipio ? { municipio } : {}),
  });
  const winners = useData<Row[]>(
    `/api/mapa/vencedores?ano=2026&turno=1&cargo=${cargo}&eleicao=${eleicao}&pagina=${retry + 1}`,
  );
  useEffect(() => {
    if (!offices || !winners.data) return;
    let active = true;
    void (async () => {
      for (const office of offices) {
        if (!active) break;
        const code = String(office.cargo_codigo);
        if (code === cargo) continue;
        try {
          await prefetchData(
            `/api/mapa/vencedores?ano=2026&turno=1&cargo=${code}&eleicao=${office.eleicao_codigo}&pagina=${retry + 1}`,
          );
        } catch {}
      }
    })();
    return () => {
      active = false;
    };
  }, [offices, winners.data, cargo, retry]);
  const summary = useData<Row>(`/api/resumo?${params}`);
  const points = useData<MapLocations>(municipio ? `/api/mapa/locais?${params}` : null);
  const detailParams = selected
    ? new URLSearchParams({
        ano: '2026',
        turno: '1',
        cargo,
        eleicao,
        municipio: String(selected.municipio_codigo),
        zona: String(selected.zona),
      })
    : null;
  const detail = useData<{ local: Row | null; secoes: Row[] }>(
    selected ? `/api/locais/${selected.local_codigo}?${detailParams}` : null,
  );
  const votes = useData<Row[]>(
    selected
      ? `/api/votos?${detailParams}&local=${selected.local_codigo}&pagina=${votePage}&limite=20`
      : null,
  );
  const chooseMunicipio = useCallback(
    (municipio: string) =>
      setSelection((previous) => ({
        ...previous,
        municipio,
        selected: null,
        search: '',
        votePage: 1,
      })),
    [setSelection],
  );
  const chooseLocal = useCallback(
    (selected: MapLocal) => setSelection((previous) => ({ ...previous, selected, votePage: 1 })),
    [setSelection],
  );
  const cities = useMemo(
    () =>
      (geometry.data?.features || [])
        .map((f) => ({
          code: String(f.properties?.municipio_codigo),
          name: String(f.properties?.nome_ibge),
          ibge: String(f.properties?.codarea),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [geometry.data],
  );
  const city = cities.find((c) => c.code === municipio);
  const locais = points.data?.items || emptyLocations;
  const filtered = locais.filter((l) =>
    normalize(`${l.local_nome} ${l.bairro} ${l.local_codigo} ${l.zona}`).includes(
      normalize(search),
    ),
  );
  const visibleCities = cities.filter((c) => normalize(c.name).includes(normalize(search)));
  const s = summary.data;

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Dados e navegação eleitoral">
        <div className="sidebar-top">
          <p className="eyebrow">MAPA ELEITORAL</p>
          <h1>{city?.name || 'Tocantins'}</h1>
          {municipio && (
            <p className="subtitle">
              Município TSE {municipio} · IBGE {city?.ibge}
            </p>
          )}
          <label className="cargo-label">
            Cargo
            <select
              value={cargo}
              onChange={(e) => {
                setCargo(e.target.value);
                setSelected(null);
                setVotePage(1);
              }}
            >
              {(offices.length ? offices : [{ cargo_codigo: '1', cargo: 'Presidente' }]).map(
                (c) => (
                  <option key={String(c.cargo_codigo)} value={String(c.cargo_codigo)}>
                    {c.cargo}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <div className="sidebar-content">
          {selected ? (
            <>
              <button className="back-button" onClick={() => setSelected(null)}>
                <Icon name="arrow-left" /> Locais de {city?.name}
              </button>
              <p className="eyebrow">LOCAL DE VOTAÇÃO</p>
              <h2 className="local-title">{selected.local_nome}</h2>
              <p className="address">
                {selected.endereco}
                <br />
                {selected.bairro}
              </p>
              <div className="local-codes">
                Zona {selected.zona} <span>·</span> Cadastro {selected.local_codigo}
              </div>
              <LoadState loading={detail.loading} error={detail.error} />
              {detail.data?.local && <Metrics data={detail.data.local} />}
              <p className="data-note">
                {selected.status !== 'Coordenadas do cadastro' && (
                  <>
                    {selected.status}. Posição original do cadastro TSE.
                    <br />
                  </>
                )}
                {selected.aptos == null
                  ? 'Sem BU individual neste local. Resultados consolidados na seção principal, quando vinculada.'
                  : Number(selected.divergencias) > 0
                    ? 'Há códigos divergentes entre BU e cadastro. Consulte as seções abaixo.'
                    : 'Resultados vinculados às seções do cadastro.'}
              </p>
              <h3>Seções e boletins</h3>
              {detail.data?.secoes.map((sec) => (
                <div className="section-card" key={String(sec.secao)}>
                  <strong>Seção {sec.secao}</strong>
                  <span>{sec.status}</span>
                  <small>
                    BU {sec.local_codigo_bu || 'indisponível'} · Cadastro da principal{' '}
                    {sec.local_codigo_principal || 'indisponível'}
                  </small>
                  {sec.tipo_secao === 'Agregada' && (
                    <small>
                      Principal: {sec.secao_bu} · {sec.local_nome_principal}
                    </small>
                  )}
                  {sec.situacao_local === 'Codigo divergente' && (
                    <small className="warning-text">
                      Código divergente: prédio efetivo não comprovado.
                    </small>
                  )}
                </div>
              ))}
              <h3>Votação do local</h3>
              <p className="data-note">
                Percentuais sobre todos os votos dos BUs próprios deste local, incluindo branco,
                nulo e legenda.
              </p>
              <LoadState loading={votes.loading} error={votes.error} />
              {votes.data?.length === 0 && (
                <p className="data-note">Sem votos de BU próprio para este recorte.</p>
              )}
              {votes.data?.map((v, i) => (
                <div className="vote-item" key={i}>
                  <div>
                    <strong>
                      {v.tipo_codigo === '2'
                        ? 'Branco'
                        : v.tipo_codigo === '3'
                          ? 'Nulo'
                          : v.nome && v.nome !== '#NULO#'
                            ? v.nome
                            : 'Nome indisponível'}
                    </strong>
                    <small>
                      {v.tipo_voto}
                      {v.partido && v.partido !== '#NULO#' ? ` · ${v.partido}` : ''}
                    </small>
                  </div>
                  <div>
                    <strong>{num(v.votos)}</strong>
                    <small>{pct(v.percentual)}</small>
                  </div>
                </div>
              ))}
              {Number(votes.data?.[0]?.total_resultados || 0) > 20 && (
                <div className="vote-pagination">
                  <button
                    className="outline-button"
                    disabled={votePage === 1 || votes.loading}
                    onClick={() => setVotePage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <span>Página {votePage}</span>
                  <button
                    className="outline-button"
                    disabled={
                      votePage * 20 >= Number(votes.data?.[0]?.total_resultados || 0) ||
                      votes.loading
                    }
                    onClick={() => setVotePage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              )}
              <p className="data-note">
                Não somar novamente os totais das seções agregadas. Votos de senador podem incluir
                múltiplas escolhas por eleitor.
              </p>
            </>
          ) : (
            <>
              <LoadState loading={summary.loading} error={summary.error} />
              {s && <Metrics data={s} />}
              {(summary.error || points.error) && (
                <button className="outline-button" onClick={() => setRetry((r) => r + 1)}>
                  Tentar novamente
                </button>
              )}
              <Results
                municipio={municipio}
                cityName={city?.name}
                cargo={cargo}
                eleicao={eleicao}
                cargoName={String(
                  offices?.find((c) => String(c.cargo_codigo) === cargo)?.cargo || 'Presidente',
                )}
              />
              {municipio && (
                <div className="explore-heading">
                  <h2>{municipio ? 'Locais de votação' : 'Explore os municípios'}</h2>
                  <span>{municipio ? num(points.data?.total) : cities.length}</span>
                </div>
              )}
              <Dropdown
                title="Explore os municípios"
                count={cities.length}
                enabled={!municipio}
                expandWhen={search}
                visibleContent={
                  !municipio ? (
                    <label className="search">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="10" cy="10" r="6" />
                        <path d="m15 15 5 5" />
                      </svg>
                      <input
                        aria-label={municipio ? 'Buscar local de votação' : 'Buscar município'}
                        placeholder={municipio ? 'Buscar local ou código…' : 'Buscar município…'}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  ) : undefined
                }
              >
                {municipio && (
                  <label className="search">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="10" cy="10" r="6" />
                      <path d="m15 15 5 5" />
                    </svg>
                    <input
                      aria-label={municipio ? 'Buscar local de votação' : 'Buscar município'}
                      placeholder={municipio ? 'Buscar local ou código…' : 'Buscar município…'}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                )}
                {municipio ? (
                  <>
                    <LoadState loading={points.loading} error={points.error} />
                    <div className="location-list">
                      {filtered.map((l) => (
                        <button
                          className="location-button"
                          key={localKey(l)}
                          onClick={() => chooseLocal(l)}
                        >
                          <span
                            className={`location-dot${l.latitude == null ? ' unavailable' : ''}`}
                          />
                          <div>
                            <strong>{l.local_nome}</strong>
                            <small>
                              Zona {l.zona} · Local {l.local_codigo}
                            </small>
                            <small>
                              {l.status !== 'Coordenadas do cadastro'
                                ? l.status
                                : Number(l.divergencias) > 0
                                  ? 'Código do BU divergente'
                                  : l.aptos == null
                                    ? 'Sem BU individual'
                                    : `${num(l.secoes_cadastradas)} seções cadastradas`}
                            </small>
                          </div>
                          <span className="chevron">
                            <Icon name="chevron-right" />
                          </span>
                        </button>
                      ))}
                    </div>
                    {points.data && filtered.length === 0 && (
                      <p className="data-note">Nenhum local encontrado.</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="list-caption">Clique no mapa ou selecione uma cidade.</p>
                    <div className="city-list">
                      {visibleCities.map((c) => (
                        <button key={c.code} onClick={() => chooseMunicipio(c.code)}>
                          <span>{c.name}</span>
                          <span className="chevron">
                            <Icon name="arrow-up-right" />
                          </span>
                        </button>
                      ))}
                    </div>
                    {geometry.data && visibleCities.length === 0 && (
                      <p className="data-note">Nenhum município encontrado.</p>
                    )}
                  </>
                )}
              </Dropdown>
            </>
          )}
        </div>
        <div className="sidebar-footer">TSE · Boletins de urna e cadastro de locais</div>
      </aside>
      <section className="map-stage" aria-label="Exploração geográfica">
        {geometry.data && (
          <ElectionMap
            geometry={geometry.data}
            winners={winners.data || []}
            cargo={cargo}
            theme={theme}
            municipio={municipio}
            locations={locais}
            selectedLocal={selected ? localKey(selected) : ''}
            onMunicipio={chooseMunicipio}
            onLocal={chooseLocal}
          />
        )}
        {(geometry.loading || geometry.error) && (
          <div className="map-loading">
            <LoadState loading={geometry.loading} error={geometry.error} />
          </div>
        )}
        <div className="map-breadcrumb">
          <span>TOCANTINS</span>
          {city && (
            <>
              <span className="crumb-divider">/</span>
              <strong>{city.name}</strong>
            </>
          )}
        </div>
        {municipio ? (
          <button className="reset-map" onClick={() => chooseMunicipio('')}>
            <Icon name="reset" /> Ver todo o Tocantins
          </button>
        ) : (
          <div className="map-instruction">
            <span className="instruction-icon">
              <Icon name="arrow-up-right" />
            </span>
            <div>
              <strong>Comece pelo mapa</strong>
              <span>Clique em um município para aproximar.</span>
            </div>
          </div>
        )}
        <div className="map-bottom">
          <div className="map-caption">
            {municipio
              ? points.loading
                ? 'Carregando locais…'
                : points.error
                  ? 'Locais indisponíveis'
                  : `${points.data?.mapeados ?? 0} locais no mapa`
              : '139 municípios mapeados'}
          </div>
        </div>
      </section>
    </div>
  );
}
