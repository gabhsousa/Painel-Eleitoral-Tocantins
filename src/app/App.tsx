import { lazy, Suspense, useEffect, useState } from 'react';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { useData } from '../shared/api/useData';
import { Icon } from '../shared/ui/Icon';
import type { Row } from '../shared/types';
import { ExplorerPage, INITIAL_EXPLORER_SELECTION } from '../features/explorer/ExplorerPage';
const MapBuilderPage = lazy(() =>
  import('../features/builder/MapBuilderPage').then((module) => ({
    default: module.MapBuilderPage,
  })),
);

export function App() {
  const [view, setView] = useState<'explore' | 'builder'>(() =>
    window.location.hash === '#construtor' ? 'builder' : 'explore',
  );
  useEffect(() => {
    const sync = () => setView(window.location.hash === '#construtor' ? 'builder' : 'explore');
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('eleitoral-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('eleitoral-theme', theme);
    } catch {}
  }, [theme]);
  const [selection, setSelection] = useState(INITIAL_EXPLORER_SELECTION);
  const cargo = selection.cargo;
  const geometry = useData<FeatureCollection<Polygon | MultiPolygon>>('/maps/tocantins.geojson');
  const cargos = useData<Row[]>('/api/cargos');
  const eleicao = String(
    cargos.data?.find((c) => String(c.cargo_codigo) === cargo)?.eleicao_codigo ||
      (cargo === '1' ? '6257' : '6259'),
  );
  return (
    <main className="dashboard">
      <header className="app-header">
        <a className="brand" href="#" aria-label="Consulta Eleitoral Tocantins">
          TO
          <span>
            <Icon name="brand-dot" />
          </span>
          <div>CONSULTA ELEITORAL</div>
        </a>
        <nav className="app-tabs" aria-label="Áreas da aplicação">
          <a className={view === 'explore' ? 'active' : ''} href="#">
            Explorar
          </a>
          <a className={view === 'builder' ? 'active' : ''} href="#construtor">
            Construtor de mapas
          </a>
        </nav>
        <div className="header-context">
          <span className="live-dot" /> Dados do TSE{' '}
          <span className="election-badge">2026 · 1º turno</span>
          <button
            className="theme-toggle"
            aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
            title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} />
          </button>
        </div>
      </header>
      {view === 'builder' ? (
        <Suspense
          fallback={
            <p className="load-state" role="status">
              Carregando construtor…
            </p>
          }
        >
          <MapBuilderPage
            geometry={geometry.data || null}
            theme={theme}
            cargo={cargo}
            eleicao={eleicao}
            offices={cargos.data || []}
          />
        </Suspense>
      ) : (
        <ExplorerPage
          geometry={geometry}
          offices={cargos.data || []}
          eleicao={eleicao}
          theme={theme}
          selection={selection}
          setSelection={setSelection}
        />
      )}
    </main>
  );
}
