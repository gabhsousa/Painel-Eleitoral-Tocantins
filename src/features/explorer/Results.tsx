import { useEffect, useState } from 'react';
import { Dropdown } from '../../shared/ui/Dropdown';
import { LoadState } from '../../shared/ui/LoadState';
import { useData } from '../../shared/api/useData';
import { num, pct } from '../../shared/lib/format';
import type { Row } from '../../shared/types';
import { electoralGroup } from '../../shared/lib/partyColors';
export function Results({
  municipio,
  cityName,
  cargo,
  eleicao,
  cargoName,
}: {
  municipio: string;
  cityName?: string;
  cargo: string;
  eleicao: string;
  cargoName: string;
}) {
  const [activated, setActivated] = useState(false),
    [page, setPage] = useState(1);
  useEffect(() => setPage(1), [municipio, cargo, eleicao]);
  const params = new URLSearchParams({
    ano: '2026',
    turno: '1',
    cargo,
    eleicao,
    pagina: String(page),
    limite: '10',
    ...(municipio ? { municipio } : {}),
  });
  const results = useData<Row[]>(activated ? `/api/votos?${params}` : null);
  const total = Number(results.data?.[0]?.total_resultados || 0);
  return (
    <Dropdown title="Resultados" onOpen={() => setActivated(true)}>
      <p className="results-scope">{cityName || 'Tocantins'} · 1º turno</p>
      <p className="results-office">{cargoName}</p>
      <p className="data-note">
        Votos do {municipio ? 'município' : 'estado'}. Percentuais incluem votos brancos, nulos e de
        legenda.
      </p>
      <LoadState loading={results.loading} error={results.error} />
      {!results.loading && !results.error && results.data?.length === 0 && (
        <p className="data-note">Sem resultados para este cargo.</p>
      )}
      {!results.loading &&
        !results.error &&
        results.data?.map((v) => {
          const nominal = String(v.tipo_codigo) === '1',
            group = electoralGroup(v, cargo);
          const name =
            String(v.tipo_codigo) === '2'
              ? 'Branco'
              : String(v.tipo_codigo) === '3'
                ? 'Nulo'
                : String(v.tipo_codigo) === '4'
                  ? `Legenda · ${v.partido}`
                  : v.nome && v.nome !== '#NULO#'
                    ? String(v.nome)
                    : 'Nome indisponível';
          return (
            <div className="result-card" key={`${v.tipo_codigo}/${v.numero}`}>
              <div className="result-heading">
                <strong>{name}</strong>
                <span>{pct(v.percentual)}</span>
              </div>
              <div className="result-meta">
                <span>{nominal ? `${v.numero} · ${group.label}` : String(v.tipo_voto)}</span>
                <strong>{num(v.votos)} votos</strong>
              </div>
              <div className="result-bar" aria-hidden="true">
                <i
                  style={{
                    width: `${Math.max(0, Math.min(100, Number(v.percentual) || 0))}%`,
                    background:
                      nominal || String(v.tipo_codigo) === '4' ? group.color : 'var(--muted)',
                  }}
                />
              </div>
            </div>
          );
        })}
      {total > 10 && (
        <div className="vote-pagination">
          <button
            className="outline-button"
            aria-label="Resultados anteriores"
            disabled={page === 1 || results.loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span>
            {page} / {Math.ceil(total / 10)}
          </span>
          <button
            className="outline-button"
            aria-label="Próximos resultados"
            disabled={page * 10 >= total || results.loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </Dropdown>
  );
}
