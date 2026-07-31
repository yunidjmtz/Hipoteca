import { useCallback, useEffect, useId, useRef, useState } from 'react';

export function InfoTooltip({ texto }: { readonly texto: string }) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const cerrar = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouse);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouse);
    };
  }, [visible, cerrar]);

  return (
    <div ref={ref} className="relative ml-1.5 inline-flex shrink-0 align-middle">
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label="Más información"
        aria-expanded={visible}
        aria-controls={tooltipId}
        aria-describedby={visible ? tooltipId : undefined}
        className={[
          'relative flex h-5 w-5 items-center justify-center rounded-full',
          'before:absolute before:-inset-3 before:rounded-full',
          'transition-[color,background-color,box-shadow,transform] duration-150',
          'hover:bg-acento-tenue hover:text-acento active:scale-95',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-superficie',
          visible ? 'bg-acento-tenue text-acento ring-1 ring-acento/25' : 'text-tinta-suave',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-[1.125rem] w-[1.125rem]"
          fill="none"
        >
          <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 10.75v5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="12" cy="7.75" r="1" fill="currentColor" />
        </svg>
      </button>
      {visible && (
        <div
          id={tooltipId}
          role="tooltip"
          className="tooltip-anima absolute bottom-full left-1/2 z-50 mb-3 w-72 -translate-x-1/2"
        >
          <div className="rounded-grande border border-linea bg-superficie p-4 shadow-elevado">
            <p className="text-[0.8125rem] leading-relaxed text-tinta-media">{texto}</p>
          </div>
          <div
            aria-hidden="true"
            className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b border-r border-linea bg-superficie"
          />
        </div>
      )}
    </div>
  );
}
