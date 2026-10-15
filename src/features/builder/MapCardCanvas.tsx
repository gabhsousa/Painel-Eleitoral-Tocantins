import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import type { CanvasState, Point } from './builderStorage';
export type MapCanvasCard = {
  id: string;
  title: string;
  caption: string;
  controls?: ReactNode;
  children: ReactNode;
};
type Props = {
  cards: MapCanvasCard[];
  canvas: CanvasState;
  onCanvasChange: (canvas: CanvasState) => void;
  onTitleChange: (id: string, title: string) => void;
  onConfigure: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
};
type Drag = {
  id: string | null;
  pointer: number;
  start: Point;
  origin: Point;
  next: Point;
  moved: boolean;
};
const OVERVIEW_SCALE = 0.78;
export function MapCardCanvas({
  cards,
  canvas,
  onCanvasChange,
  onTitleChange,
  onConfigure,
  onRemove,
  onAdd,
}: Props) {
  const board = useRef<HTMLDivElement>(null),
    elements = useRef(new Map<string, HTMLElement>()),
    scene = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 }),
    [dragging, setDragging] = useState(false);
  const { positions, pan, focused } = canvas;
  const drag = useRef<Drag | null>(null),
    dragFrame = useRef(0),
    suppressClick = useRef(false);
  const setFocused = useCallback(
    (focused: string | null) => onCanvasChange({ ...canvas, focused }),
    [canvas, onCanvasChange],
  );
  useEffect(() => {
    const measure = () => {
      if (board.current)
        setSize({ width: board.current.clientWidth, height: board.current.clientHeight });
    };
    const observer = new ResizeObserver(measure);
    if (board.current) observer.observe(board.current);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(dragFrame.current);
    };
  }, []);
  useEffect(() => {
    if (!focused) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocused(null);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [focused, setFocused]);
  const focus = useCallback(
    (id: string) => {
      setFocused(id);
      elements.current.get(id)?.focus({ preventScroll: true });
      board.current?.scrollIntoView({
        block: 'nearest',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    },
    [setFocused],
  );
  const active = focused ? elements.current.get(focused) : null;
  const scale =
    active && size.width > 32 && size.height > 32
      ? Math.min(
          1.7,
          (size.width - 32) / active.offsetWidth,
          (size.height - 32) / active.offsetHeight,
        )
      : OVERVIEW_SCALE;
  const activePosition = focused ? positions[focused] || { x: 0, y: 0 } : { x: 0, y: 0 };
  const camera = {
    x: (size.width / 2) * (1 - scale) + (focused ? -activePosition.x * scale : pan.x),
    y: (size.height / 2) * (1 - scale) + (focused ? -activePosition.y * scale : pan.y),
  };
  const startDrag = (event: PointerEvent<HTMLElement>, id: string | null) => {
    if (
      focused ||
      event.button !== 0 ||
      (event.target as Element).closest('input,a,[data-card-control]')
    )
      return;
    event.stopPropagation();
    suppressClick.current = false;
    const origin = id ? positions[id] || { x: 0, y: 0 } : pan;
    drag.current = {
      id,
      pointer: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin,
      next: origin,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer) return;
    const dx = event.clientX - current.start.x,
      dy = event.clientY - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < 5) return;
    current.moved = true;
    const divisor = current.id ? scale : 1;
    current.next = { x: current.origin.x + dx / divisor, y: current.origin.y + dy / divisor };
    setDragging(true);
    if (!dragFrame.current)
      dragFrame.current = requestAnimationFrame(() => {
        dragFrame.current = 0;
        const state = drag.current;
        if (!state) return;
        if (state.id) {
          const card = elements.current.get(state.id);
          if (card)
            card.style.transform = `translate(calc(-50% + ${state.next.x}px), calc(-50% + ${state.next.y}px))`;
        } else if (scene.current) {
          const x = (size.width / 2) * (1 - scale) + state.next.x,
            y = (size.height / 2) * (1 - scale) + state.next.y;
          scene.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
          board.current?.style.setProperty('--board-x', `${x}px`);
          board.current?.style.setProperty('--board-y', `${y}px`);
        }
      });
  };
  const endDrag = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer) return;
    cancelAnimationFrame(dragFrame.current);
    dragFrame.current = 0;
    suppressClick.current = current.moved;
    onCanvasChange(
      current.id
        ? { ...canvas, positions: { ...positions, [current.id]: current.next } }
        : { ...canvas, pan: current.next },
    );
    setDragging(false);
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div
      ref={board}
      className={`map-board${focused ? ' is-focused' : ''}${dragging ? ' is-dragging' : ''}`}
      style={
        {
          '--board-scale': scale,
          '--board-x': `${camera.x}px`,
          '--board-y': `${camera.y}px`,
        } as CSSProperties
      }
      onPointerDown={(event) => {
        if (!(event.target as Element).closest('article,button')) startDrag(event, null);
      }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (!(event.target as Element).closest('article,button')) setFocused(null);
      }}
    >
      <div className="map-board-tools">
        <span>
          {cards.length
            ? focused
              ? 'Explorando o mapa'
              : 'Arraste os cards · Arraste o fundo para navegar'
            : ''}
        </span>
        {focused && (
          <button data-card-control onClick={() => setFocused(null)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 5-7 7 7 7M5 12h14" />
            </svg>
            Voltar ao grid
          </button>
        )}
      </div>
      {!cards.length && (
        <button data-card-control className="map-board-empty" onClick={onAdd}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>Adicionar mapa</span>
        </button>
      )}
      <div
        ref={scene}
        className="map-board-scene"
        style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${scale})` }}
      >
        {cards.map((item, index) => {
          const position = positions[item.id] || { x: 0, y: 0 },
            isFocused = focused === item.id;
          return (
            <article
              key={item.id}
              ref={(node) => {
                if (node) elements.current.set(item.id, node);
                else elements.current.delete(item.id);
              }}
              tabIndex={-1}
              inert={!!focused && !isFocused}
              className={`map-sheet map-card${focused && !isFocused ? ' is-secondary' : ''}`}
              aria-label={item.title || 'Mapa eleitoral'}
              style={{
                transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
              }}
              onPointerDown={(event) => startDrag(event, item.id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onClick={(event) => {
                event.stopPropagation();
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                if (!isFocused && !(event.target as Element).closest('input,a,[data-card-control]'))
                  focus(item.id);
              }}
            >
              <header className="map-card-header">
                <div className="map-card-heading">
                  <span>{item.caption}</span>
                  <input
                    aria-label={`Título do mapa ${index + 1}`}
                    placeholder="Dê um título ao mapa"
                    value={item.title}
                    maxLength={80}
                    onChange={(event) => onTitleChange(item.id, event.target.value)}
                  />
                </div>
                <div className="map-card-actions">
                  <button
                    data-card-control
                    aria-label={`Configurar mapa ${index + 1}`}
                    title="Configurar mapa"
                    onClick={() => onConfigure(item.id)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16M4 17h16M9 4v6M15 14v6" />
                    </svg>
                  </button>
                  <button
                    data-card-control
                    aria-label={`Remover mapa ${index + 1}`}
                    title="Remover mapa"
                    onClick={() => onRemove(item.id)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m7 7 10 10M17 7 7 17" />
                    </svg>
                  </button>
                  <button
                    className="map-card-grip"
                    aria-label={`Mover mapa ${index + 1}`}
                    title="Arraste para mover"
                    disabled={!!focused}
                    onKeyDown={(event) => {
                      const directions: Record<string, Point> = {
                        ArrowLeft: { x: -20, y: 0 },
                        ArrowRight: { x: 20, y: 0 },
                        ArrowUp: { x: 0, y: -20 },
                        ArrowDown: { x: 0, y: 20 },
                      };
                      const step = directions[event.key];
                      if (!step) return;
                      event.preventDefault();
                      onCanvasChange({
                        ...canvas,
                        positions: {
                          ...positions,
                          [item.id]: { x: position.x + step.x, y: position.y + step.y },
                        },
                      });
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      {[6, 12, 18].flatMap((y) =>
                        [9, 15].map((x) => <circle key={`${x}/${y}`} cx={x} cy={y} r="1.6" />),
                      )}
                    </svg>
                  </button>
                </div>
                {item.controls && <div className="map-card-controls">{item.controls}</div>}
              </header>
              <div className="map-card-content">
                <div className="map-card-map" inert={!isFocused}>
                  {item.children}
                </div>
                {!isFocused && (
                  <button className="map-card-preview" aria-label={`Explorar mapa ${index + 1}`}>
                    <span>
                      Explorar mapa
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 17 17 7M7 7h10v10" />
                      </svg>
                    </span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
