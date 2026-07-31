import type { ReactNode } from 'react';

interface PropsExplicacion {
  readonly titulo: string;
  readonly children: ReactNode;
}

/**
 * Acordeón accesible implementado con <details>/<summary> nativos.
 * El chevron rota mediante la pseudo-clase [open] de Tailwind v4.
 */
export function Explicacion({ titulo, children }: PropsExplicacion) {
  return (
    <details className="group rounded-medio border border-linea bg-superficie">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-tinta select-none">
        <span>{titulo}</span>
        {/* El chevron gira cuando <details> tiene el atributo [open] */}
        <span
          aria-hidden="true"
          className="shrink-0 text-tinta-suave transition-transform duration-200 group-open:rotate-90"
        >
          ▸
        </span>
      </summary>
      <div className="border-t border-linea px-4 py-3 text-sm text-tinta-media">{children}</div>
    </details>
  );
}
