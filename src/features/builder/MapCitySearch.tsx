import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { searchMapCities } from './mapCities';
import type { MapCity } from './mapCities';

type Props = {
  cities: MapCity[];
  value: string;
  mapNumber: number;
  onSelect: (code: string) => void;
};
export function MapCitySearch({ cities, value, mapNumber, onSelect }: Props) {
  const [query, setQuery] = useState(''),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null);
  const selected = cities.find((city) => city.code === value),
    matches = useMemo(() => searchMapCities(cities, query), [cities, query]);
  const choose = (code: string) => {
    setOpen(false);
    setQuery('');
    setActive(-1);
    onSelect(code);
  };
  useEffect(() => {
    if (open && active >= 0)
      (list.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({
        block: 'nearest',
      });
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
        setActive(-1);
      }
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  return (
    <div
      ref={root}
      className="map-city-search"
      data-card-control
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery('');
          setActive(-1);
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="map-city-field">
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 5 5" />
        </svg>
        <input
          ref={input}
          role="combobox"
          aria-label={`Buscar cidade no mapa ${mapNumber}`}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-cities`}
          aria-activedescendant={open && active >= 0 ? `${id}-city-${active}` : undefined}
          autoComplete="off"
          disabled={!cities.length}
          placeholder={cities.length ? 'Buscar cidade…' : 'Carregando cidades…'}
          value={open ? query : selected?.name || ''}
          onFocus={() => {
            setQuery('');
            setOpen(true);
            setActive(-1);
          }}
          onClick={() => {
            if (!open) {
              setQuery('');
              setOpen(true);
              setActive(-1);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.stopPropagation();
              event.preventDefault();
              setOpen(false);
              setQuery('');
              setActive(-1);
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              event.stopPropagation();
              setOpen(true);
              setActive((index) =>
                event.key === 'ArrowDown'
                  ? Math.min(matches.length - 1, index + 1)
                  : index < 0
                    ? matches.length - 1
                    : Math.max(0, index - 1),
              );
            }
            if (event.key === 'Enter' && open) {
              event.preventDefault();
              event.stopPropagation();
              const city = matches[Math.max(0, active)];
              if (city) choose(city.code);
            }
          }}
        />
        {(value || query) && (
          <button
            className="map-city-clear"
            aria-label={`Limpar filtro de cidade do mapa ${mapNumber}`}
            title="Ver todo o Tocantins"
            onClick={() => {
              if (value) choose('');
              else {
                setQuery('');
                setActive(-1);
                input.current?.focus();
              }
            }}
          >
            <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div className="map-city-dropdown">
          <div
            ref={list}
            id={`${id}-cities`}
            role="listbox"
            aria-label={`Cidades do mapa ${mapNumber}`}
            className="map-city-options"
          >
            {matches.map((city, index) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                key={city.code}
                id={`${id}-city-${index}`}
                aria-selected={city.code === value}
                data-active={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(city.code)}
              >
                <span>{city.name}</span>
                {city.code === value && (
                  <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          {!matches.length && <p role="status">Nenhuma cidade encontrada.</p>}
        </div>
      )}
    </div>
  );
}
