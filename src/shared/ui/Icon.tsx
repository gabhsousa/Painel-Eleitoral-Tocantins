type IconName =
  | 'sun'
  | 'moon'
  | 'arrow-left'
  | 'arrow-up-right'
  | 'reset'
  | 'chevron-right'
  | 'brand-dot';
export function Icon({ name, className = 'ui-icon' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {name === 'sun' && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
        </>
      )}
      {name === 'moon' && <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />}
      {name === 'arrow-left' && (
        <>
          <path d="m15 18-6-6 6-6" />
          <path d="M9 12h10" />
        </>
      )}
      {name === 'arrow-up-right' && (
        <>
          <path d="M7 17 17 7" />
          <path d="M7 7h10v10" />
        </>
      )}
      {name === 'reset' && (
        <>
          <path d="m9 14-5-5 5-5" />
          <path d="M4 9h9a7 7 0 0 1 7 7v4" />
        </>
      )}
      {name === 'chevron-right' && <path d="m9 18 6-6-6-6" />}
      {name === 'brand-dot' && <circle className="icon-fill" cx="12" cy="12" r="5" />}
    </svg>
  );
}
