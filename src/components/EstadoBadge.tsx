import type { EstadoViabilidad } from '@/domain/types';

interface PropsEstadoBadge {
  readonly estado: EstadoViabilidad;
}

interface ConfigBadge {
  texto: string;
  clases: string;
}

// El color nunca informa solo: cada variante lleva su texto (§6.5).
const CONFIG: Record<EstadoViabilidad, ConfigBadge> = {
  comodo: {
    texto: 'Cómodo',
    clases: 'text-comodo bg-comodo-tenue border-comodo/35',
  },
  viable: {
    texto: 'Viable',
    clases: 'text-comodo bg-comodo-tenue border-comodo/35',
  },
  ajustado: {
    texto: 'Ajustado',
    clases: 'text-ajustado bg-ajustado-tenue border-ajustado/35',
  },
  falta_ahorro: {
    texto: 'Falta ahorro',
    clases: 'text-revisar bg-revisar-tenue border-revisar/35',
  },
  cuota_excesiva: {
    texto: 'Cuota alta',
    clases: 'text-revisar bg-revisar-tenue border-revisar/35',
  },
  no_viable: {
    texto: 'No viable',
    clases: 'text-no-viable bg-no-viable-tenue border-no-viable/35',
  },
};

export function EstadoBadge({ estado }: PropsEstadoBadge) {
  const { texto, clases } = CONFIG[estado];
  return (
    <span
      className={`inline-flex items-center rounded-chico border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${clases}`}
    >
      {texto}
    </span>
  );
}
