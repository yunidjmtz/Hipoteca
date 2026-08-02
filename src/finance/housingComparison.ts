import { addCents, fromCents, sumCents } from '@/core/money';
import type { Cents, ViviendaGuardada } from '@/domain/types';

/**
 * El coste por m² domina la comparación. Las características aportan un 20 %
 * de la nota para que una vivienda algo más cara pueda compensarlo con
 * cualidades útiles, sin ocultar una diferencia económica grande.
 */
export const PESOS_VIVIENDA = {
  costePorM2: 80,
  exterior: 8,
  garaje: 8,
  trastero: 4,
} as const;

export interface ResultadoComparacionVivienda {
  readonly vivienda: ViviendaGuardada;
  readonly costeReformas: Cents;
  readonly costeTotal: Cents;
  /** Euros por metro cuadrado, incluyendo las reformas. */
  readonly costePorM2: number;
  readonly puntuacion: number;
  readonly desglose: {
    readonly costePorM2: number;
    readonly exterior: number;
    readonly garaje: number;
    readonly trastero: number;
  };
}

function costeReformas(vivienda: ViviendaGuardada): Cents {
  return sumCents(vivienda.reformas.map((reforma) => reforma.costeEstimado));
}

function calcularDatosBase(vivienda: ViviendaGuardada) {
  const reformas = costeReformas(vivienda);
  const total = addCents(vivienda.precioVenta, reformas);
  return {
    vivienda,
    costeReformas: reformas,
    costeTotal: total,
    costePorM2: fromCents(total) / vivienda.superficieM2,
  };
}

/**
 * Compara solo viviendas con precio y superficie válidos. La parte económica
 * es relativa a la vivienda con menor coste real por m² del grupo.
 */
export function compararViviendas(
  viviendas: readonly ViviendaGuardada[],
): ResultadoComparacionVivienda[] {
  const comparables = viviendas
    .filter((vivienda) => vivienda.precioVenta > 0 && vivienda.superficieM2 > 0)
    .map(calcularDatosBase);

  if (comparables.length === 0) return [];

  const menorCostePorM2 = Math.min(...comparables.map((vivienda) => vivienda.costePorM2));

  return comparables
    .map((datos): ResultadoComparacionVivienda => {
      const desglose = {
        costePorM2: PESOS_VIVIENDA.costePorM2 * (menorCostePorM2 / datos.costePorM2),
        exterior: datos.vivienda.esExterior ? PESOS_VIVIENDA.exterior : 0,
        garaje: datos.vivienda.tieneGaraje ? PESOS_VIVIENDA.garaje : 0,
        trastero: datos.vivienda.tieneTrastero ? PESOS_VIVIENDA.trastero : 0,
      };

      return {
        ...datos,
        puntuacion: desglose.costePorM2 + desglose.exterior + desglose.garaje + desglose.trastero,
        desglose,
      };
    })
    .sort(
      (a, b) =>
        b.puntuacion - a.puntuacion ||
        a.costeTotal - b.costeTotal ||
        a.vivienda.nombre.localeCompare(b.vivienda.nombre, 'es'),
    );
}
