import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function InfoTooltip({
  texto,
}: {
  readonly texto: string;
  readonly alineado?: 'centro' | 'derecha';
}) {
  const [visible, setVisible] = useState(false);
  const tituloId = useId();
  const descripcionId = useId();
  const entendidoRef = useRef<HTMLButtonElement>(null);
  const cerrar = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!visible) return;

    const onKey = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') cerrar();
    };
    const overflowAnterior = document.body.style.overflow;

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    entendidoRef.current?.focus();

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', onKey);
    };
  }, [visible, cerrar]);

  return (
    <div className="ml-1.5 inline-flex shrink-0 align-middle">
      <button
        type="button"
        onClick={() => setVisible(true)}
        aria-label="Más información"
        aria-expanded={visible}
        aria-controls={visible ? tituloId : undefined}
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

      {visible &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/30 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-4"
            onMouseDown={(evento) => {
              if (evento.target === evento.currentTarget) cerrar();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={tituloId}
              aria-describedby={descripcionId}
              className="w-full max-w-md rounded-grande bg-superficie p-5 shadow-elevado"
            >
              <div>
                <p className="rotulo mb-1">Ayuda</p>
                <h2 id={tituloId} className="font-display text-xl text-tinta">
                  Más información
                </h2>
              </div>

              <p id={descripcionId} className="mt-4 text-sm leading-relaxed text-tinta-media">
                {texto}
              </p>

              <button
                ref={entendidoRef}
                type="button"
                onClick={cerrar}
                className="mt-5 w-full rounded-medio bg-acento px-4 py-2.5 text-sm font-semibold text-sobre-acento"
              >
                Entendido
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
