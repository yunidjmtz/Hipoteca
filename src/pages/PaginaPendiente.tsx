import type { ReactNode } from 'react';
import type { Seccion } from '@/app/secciones';
import { Icono } from '@/components/Icono';
import { Insignia } from '@/components/Insignia';
import { Panel } from '@/components/Panel';

interface Props {
  readonly seccion: Seccion;
  readonly children?: ReactNode;
}

/**
 * Pantalla honesta mientras la sección no está construida: dice en qué fase
 * llega y qué va a contener exactamente. Preferible a maquetar cifras falsas,
 * que es justo lo que §8 rechaza.
 */
export function PaginaPendiente({ seccion, children }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <header className="aparece-0">
        <div className="flex items-center gap-2.5 text-acento">
          <Icono nombre={seccion.icono} tamano={22} />
          <p className="rotulo text-acento">{seccion.fase}</p>
        </div>
        <h1 className="mt-2 text-[clamp(1.75rem,1.4rem+1.4vw,2.375rem)] text-tinta">
          {seccion.etiqueta}
        </h1>
        <p className="mt-2 max-w-prose text-[0.9375rem] text-tinta-media">{seccion.resumen}</p>
      </header>

      {children}

      <Panel rotulo="Contenido previsto" className="aparece-2">
        <ul className="flex flex-col gap-3">
          {seccion.contenidos.map((linea) => (
            <li key={linea} className="flex gap-3 text-sm text-tinta-media">
              <Icono nombre="reloj" tamano={16} className="mt-0.5 shrink-0 text-tinta-suave" />
              <span>{linea}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 flex flex-wrap items-center gap-2 border-t border-linea pt-4 text-xs text-tinta-suave">
          <Insignia tono="pendiente" icono="reloj">
            Pendiente
          </Insignia>
          <span>
            Esta sección se construye en la {seccion.fase}. El plan se ejecuta por fases y no se
            empieza una hasta cerrar la anterior.
          </span>
        </p>
      </Panel>
    </div>
  );
}
