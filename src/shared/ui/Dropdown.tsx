import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
export function Dropdown({
  title,
  count,
  enabled = true,
  onOpen,
  expandWhen,
  visibleContent,
  children,
}: {
  title: string;
  count?: number;
  enabled?: boolean;
  onOpen?: () => void;
  expandWhen?: string;
  visibleContent?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  useEffect(() => {
    if (expandWhen?.trim()) setOpen(true);
  }, [expandWhen]);
  if (!enabled) return <>{children}</>;
  return (
    <section className={`results-menu${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="results-toggle"
        aria-label={title}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((value) => !value);
        }}
      >
        <span>{title}</span>
        <span className="dropdown-controls">
          {count !== undefined && <span className="dropdown-count">{count}</span>}
          <svg className="results-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {visibleContent && <div className="dropdown-visible">{visibleContent}</div>}
      <div className="results-collapse" id={panelId} aria-hidden={!open} inert={!open}>
        <div className="results-clip">
          <div className="results-body">{children}</div>
        </div>
      </div>
    </section>
  );
}
