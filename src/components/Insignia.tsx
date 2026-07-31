import type { NombreIcono } from '@/components/Icono';
import { Icono } from '@/components/Icono';

export type TonoInsignia = 'neutro' | 'hecho' | 'pendiente' | 'aviso';

const TONOS: Record<TonoInsignia, string> = {
  neutro: 'border-linea bg-superficie-2 text-tinta-media',
  hecho: 'border-comodo/35 bg-comodo-tenue text-comodo',
  pendiente: 'border-linea bg-superficie-2 text-tinta-suave',
  aviso: 'border-ajustado/35 bg-ajustado-tenue text-ajustado',
};

interface PropsInsignia {
  readonly tono?: TonoInsignia;
  readonly icono?: NombreIcono;
  readonly children: string;
}

/** El color nunca informa solo: la insignia siempre lleva su texto (§6.5). */
export function Insignia({ tono = 'neutro', icono, children }: PropsInsignia) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chico border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONOS[tono]}`}
    >
      {icono !== undefined && <Icono nombre={icono} tamano={13} />}
      {children}
    </span>
  );
}
