import type { ReactNode } from 'react';

interface PropsPanel {
  readonly titulo?: string;
  readonly rotulo?: string;
  readonly acento?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Panel({ titulo, rotulo, acento = false, children, className = '' }: PropsPanel) {
  return (
    <section
      className={[
        'relative rounded-grande border border-linea bg-superficie shadow-papel',
        'transition-shadow duration-200',
        acento ? 'border-l-[3px] border-l-acento' : 'hover:shadow-elevado',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(rotulo ?? titulo) !== undefined && (
        <header className="border-b border-linea px-6 pt-5 pb-4">
          {rotulo !== undefined && <p className="rotulo mb-1 tracking-widest">{rotulo}</p>}
          {titulo !== undefined && (
            <h2 className="font-display text-[1.35rem] leading-snug text-tinta">{titulo}</h2>
          )}
        </header>
      )}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}
