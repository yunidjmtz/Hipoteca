import type { ReactNode } from 'react';

interface PropsPanel {
  readonly titulo?: string;
  readonly rotulo?: string;
  readonly acento?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
  readonly contenidoClassName?: string;
  readonly encabezadoClassName?: string;
  readonly accionEncabezado?: ReactNode;
}

export function Panel({
  titulo,
  rotulo,
  acento = false,
  children,
  className = '',
  contenidoClassName = '',
  encabezadoClassName = '',
  accionEncabezado,
}: PropsPanel) {
  return (
    <section
      className={[
        'relative rounded-grande border border-linea bg-superficie shadow-papel',
        'transition-shadow duration-200',
        acento ? 'border-l-[3px] border-l-acento' : 'lg:hover:shadow-elevado',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(rotulo ?? titulo) !== undefined && (
        <header
          className={`flex items-start justify-between gap-4 border-b border-linea px-4 pt-4 pb-3.5 sm:px-6 sm:pt-5 sm:pb-4 ${encabezadoClassName}`}
        >
          <div>
            {rotulo !== undefined && <p className="rotulo mb-1 tracking-widest">{rotulo}</p>}
            {titulo !== undefined && (
              <h2 className="font-display text-[1.35rem] leading-snug text-tinta">{titulo}</h2>
            )}
          </div>
          {accionEncabezado !== undefined && <div className="shrink-0">{accionEncabezado}</div>}
        </header>
      )}
      <div className={`px-4 py-4 sm:px-6 sm:py-5 ${contenidoClassName}`}>{children}</div>
    </section>
  );
}
