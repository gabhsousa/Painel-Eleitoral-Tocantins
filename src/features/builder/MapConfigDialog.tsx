import { useEffect, useRef, useState } from 'react';
import type { Row } from '../../shared/types';
import type { MapConfig } from './builderStorage';
import { useData } from '../../shared/api/useData';
import { electoralGroup } from '../../shared/lib/partyColors';
import {
  generatedTitle,
  indicatorLabels,
  isVoting,
  isNonNominal,
  mapIndicators,
} from './indicators';
import type { MapIndicator } from './indicators';
export function MapConfigDialog({
  initial,
  offices,
  defaultCargo,
  onClose,
  onSave,
}: {
  initial: MapConfig | null;
  offices: Row[];
  defaultCargo: string;
  onClose: () => void;
  onSave: (config: MapConfig) => void;
}) {
  const element = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<'normal' | 'heat'>(initial?.kind || 'normal');
  const [metric, setMetric] = useState<MapIndicator>(initial?.metric || 'votos');
  const [cargo, setCargo] = useState(initial?.cargo || defaultCargo),
    [candidato, setCandidato] = useState(initial?.candidato || '');
  const [title, setTitle] = useState(initial?.title || ''),
    [search, setSearch] = useState('');
  const choices =
    initial && !offices.some((row) => String(row.cargo_codigo) === initial.cargo)
      ? [
          ...offices,
          {
            cargo_codigo: initial.cargo,
            cargo: initial.cargoName,
            eleicao_codigo: initial.eleicao,
          },
        ]
      : offices;
  const office = choices.find((row) => String(row.cargo_codigo) === cargo) || choices[0];
  const eleicao = String(office.eleicao_codigo),
    cargoName = String(office.cargo);
  const voting = isVoting(metric);
  const candidates = useData<Row[]>(
    voting ? `/api/mapa/candidatos?ano=2026&turno=1&cargo=${cargo}&eleicao=${eleicao}` : null,
  );
  const candidate = candidates.data?.find((row) => String(row.numero) === candidato);
  const options =
    candidates.data?.filter(
      (row) =>
        String(row.numero) === candidato ||
        `${row.nome} ${row.numero} ${row.partido}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .includes(
            search
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase(),
          ),
    ) || [];
  useEffect(() => {
    element.current?.showModal();
    return () => element.current?.close();
  }, []);
  const suggested = generatedTitle(metric, cargoName, candidate ? String(candidate.nome) : '');
  const candidateRequired = metric === 'percentual_votos';
  const valid = metric === 'blank' || !voting || (!candidato && !candidateRequired) || !!candidate;
  return (
    <dialog
      ref={element}
      className="map-config-dialog"
      aria-labelledby="map-config-heading"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          const automatic =
            !title.trim() ||
            !!(
              initial &&
              title === initial.title &&
              initial.title ===
                generatedTitle(initial.metric, initial.cargoName, initial.candidatoName)
            );
          onSave({
            id: initial?.id || crypto.randomUUID(),
            kind,
            metric,
            cargo,
            eleicao,
            cargoName,
            candidato: voting ? candidato : '',
            candidatoName: voting && candidato ? visibleName(candidate, initial) : '',
            color: candidate ? electoralGroup(candidate, cargo).color : '#315c98',
            title: automatic ? suggested : title.trim(),
          });
        }}
      >
        <div className="map-config-header">
          <div>
            <span>COMPONHA SUA VISUALIZAÇÃO</span>
            <h2 id="map-config-heading">{initial ? 'Configurar mapa' : 'Adicionar mapa'}</h2>
          </div>
          <button
            type="button"
            className="config-close"
            aria-label="Fechar configuração"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="map-kind-options" aria-label="Tipo de mapa">
          {(['normal', 'heat'] as const).map((type) => (
            <button
              type="button"
              key={type}
              aria-pressed={kind === type}
              onClick={() => {
                if (type === kind) return;
                setKind(type);
                setMetric(type === 'heat' ? 'percentual_abstencao' : 'votos');
                setCandidato('');
                setSearch('');
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {type === 'normal' ? (
                  <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16" />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="4" />
                  </>
                )}
              </svg>
              <strong>{type === 'normal' ? 'Mapa normal' : 'Mapa de calor'}</strong>
              <small>
                {type === 'normal' ? 'Cores por município' : 'Calor por local de votação'}
              </small>
            </button>
          ))}
        </div>
        <label className="map-config-field">
          Parâmetro
          <select
            aria-label="Parâmetro"
            value={metric}
            onChange={(event) => {
              setMetric(event.target.value as MapIndicator);
              setCandidato('');
              setSearch('');
            }}
          >
            {mapIndicators.map((value) => (
              <option key={value} value={value}>
                {indicatorLabels[value]}
              </option>
            ))}
          </select>
        </label>
        {metric !== 'blank' && (
          <label className="map-config-field">
            Cargo
            <select
              aria-label="Cargo"
              value={cargo}
              onChange={(event) => {
                setCargo(event.target.value);
                setCandidato('');
                setSearch('');
              }}
            >
              {choices.map((row) => (
                <option key={String(row.cargo_codigo)} value={String(row.cargo_codigo)}>
                  {row.cargo}
                </option>
              ))}
            </select>
          </label>
        )}
        {voting && (
          <>
            <label className="map-config-field">
              Candidato
              <select
                aria-label="Candidato"
                value={candidato}
                onChange={(event) => setCandidato(event.target.value)}
                disabled={candidates.loading || !!candidates.error}
              >
                <option value="">
                  {candidates.loading
                    ? 'Carregando candidatos…'
                    : candidateRequired
                      ? 'Selecione um candidato'
                      : 'Todos os votos nominais'}
                </option>
                {options.map((row) => (
                  <option key={String(row.numero)} value={String(row.numero)}>
                    {row.numero} · {row.nome} · {row.partido}
                  </option>
                ))}
              </select>
            </label>
            {(candidates.data?.length || 0) > 20 && (
              <label className="map-config-field candidate-filter">
                Filtrar candidatos
                <input
                  placeholder="Nome, número ou partido"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            )}
            {candidates.error && (
              <p className="config-error" role="alert">
                {candidates.error}
              </p>
            )}
          </>
        )}
        {metric === 'percentual_abstencao' && (
          <p className="map-config-note">
            Ausentes ÷ eleitores aptos × 100. A escala usa a distribuição estadual.
          </p>
        )}
        {metric === 'percentual_votos' && (
          <p className="map-config-note">Votos do candidato ÷ votos nominais do cargo × 100.</p>
        )}
        {isNonNominal(metric) && (
          <p className="map-config-note">
            {metric === 'abstencoes_brancos_nulos'
              ? 'Soma das abstenções, votos brancos e votos nulos'
              : 'Quantidade de ' + indicatorLabels[metric].toLowerCase()}{' '}
            para o cargo selecionado.{' '}
            {kind === 'heat' ? 'Totais por local de votação.' : 'Totais por município.'}
          </p>
        )}
        <label className="map-config-field">
          Título
          <input
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={suggested}
          />
        </label>
        <div className="map-config-footer">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="add-map-button" type="submit" disabled={!valid || candidates.loading}>
            {initial ? 'Salvar alterações' : 'Adicionar ao grid'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
function visibleName(candidate: Row | undefined, initial: MapConfig | null) {
  return String(candidate?.nome || initial?.candidatoName || '');
}
