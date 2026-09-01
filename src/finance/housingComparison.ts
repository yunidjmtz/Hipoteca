import { addCents, fromCents, sumCents } from '@/core/money';
import type { Cents, EstadoPersistido, ViviendaGuardada } from '@/domain/types';
import { calcularCosteVivienda } from './housingCosts';
import { evaluarEncajePlanVivienda, type ResultadoEncajePlanVivienda } from './housingPlanFit';

/**
 * El valor económico sigue dominando la comparación, pero una compra no se
 * recomienda solo por ser barata: también debe encajar con el plan financiero
 * y con la capacidad financiera de la persona compradora.
 */
export const PESOS_VIVIENDA = {
  costePorM2: 60,
  encajeFinanciero: 25,
  necesidades: 15,
} as const;

export interface ResultadoComparacionVivienda {
  readonly vivienda: ViviendaGuardada;
  readonly costeReformas: Cents;
  readonly costeTotal: Cents;
  /** Euros por metro cuadrado, incluyendo las reformas. */
  readonly costePorM2: number;
  readonly puntuacion: number;
  /** Una vivienda no disponible o financieramente inviable nunca se recomienda. */
  readonly esRecomendable: boolean;
  readonly encajePlan: ResultadoEncajePlanVivienda | null;
  readonly criteriosNecesidadesCumplidos: number;
  readonly criteriosNecesidadesTotales: number;
  readonly desglose: {
    readonly costePorM2: number;
    readonly encajeFinanciero: number;
    readonly necesidades: number;
  };
}

function costeReformas(vivienda: ViviendaGuardada): Cents {
  return sumCents(vivienda.reformas.map((reforma) => reforma.costeEstimado));
}

function calcularDatosBase(vivienda: ViviendaGuardada, estado?: EstadoPersistido) {
  const reformas = costeReformas(vivienda);
  const total =
    estado === undefined
      ? addCents(vivienda.precioVenta, reformas)
      : calcularCosteVivienda(vivienda, estado).costeTotal;
  return {
    vivienda,
    costeReformas: reformas,
    costeTotal: total,
    costePorM2: fromCents(total) / vivienda.superficieM2,
  };
}

function calcularNecesidades(): { cumplidos: number; totales: number; puntuacion: number } {
  // Las características se describen en cada inmueble. Ya no hay requisitos
  // globales que puedan dejar de ser visibles y sesgar una recomendación.
  return { cumplidos: 0, totales: 0, puntuacion: PESOS_VIVIENDA.necesidades };
}

function puntuacionEncaje(encaje: ResultadoEncajePlanVivienda | null): number {
  if (encaje === null) return PESOS_VIVIENDA.encajeFinanciero;
  if (encaje.estado === 'no_viable') return 0;
  if (encaje.estado === 'sin_presupuesto') return PESOS_VIVIENDA.encajeFinanciero * 0.5;

  const meses = encaje.mesesHastaAlcanzar ?? 120;
  const factorEspera = Math.max(0.6, 1 - (meses / 120) * 0.4);
  const factorPresupuesto = encaje.estado === 'en_plan' ? 1 : 0.8;
  return PESOS_VIVIENDA.encajeFinanciero * factorEspera * factorPresupuesto;
}

/**
 * Compara solo viviendas con precio y superficie válidos. La parte económica
 * es relativa a la vivienda con menor coste real por m² del grupo.
 */
export function compararViviendas(
  viviendas: readonly ViviendaGuardada[],
  estado?: EstadoPersistido,
): ResultadoComparacionVivienda[] {
  const comparables = viviendas
    .filter((vivienda) => vivienda.precioVenta > 0 && vivienda.superficieM2 > 0)
    .map((vivienda) => calcularDatosBase(vivienda, estado));

  if (comparables.length === 0) return [];

  const disponibles = comparables.filter((datos) => datos.vivienda.yaNoDisponible !== true);
  const referenciasCoste = disponibles.length > 0 ? disponibles : comparables;
  const menorCostePorM2 = Math.min(...referenciasCoste.map((vivienda) => vivienda.costePorM2));

  return comparables
    .map((datos): ResultadoComparacionVivienda => {
      const encajePlan =
        estado === undefined ? null : evaluarEncajePlanVivienda(datos.vivienda, estado);
      const necesidades = calcularNecesidades();
      const cumpleNecesidades =
        estado === undefined ||
        necesidades.totales === 0 ||
        necesidades.cumplidos === necesidades.totales;
      const desglose = {
        costePorM2: PESOS_VIVIENDA.costePorM2 * (menorCostePorM2 / datos.costePorM2),
        encajeFinanciero: puntuacionEncaje(encajePlan),
        necesidades: necesidades.puntuacion,
      };

      return {
        ...datos,
        puntuacion: desglose.costePorM2 + desglose.encajeFinanciero + desglose.necesidades,
        esRecomendable:
          datos.vivienda.yaNoDisponible !== true &&
          encajePlan?.estado !== 'no_viable' &&
          cumpleNecesidades,
        encajePlan,
        criteriosNecesidadesCumplidos: necesidades.cumplidos,
        criteriosNecesidadesTotales: necesidades.totales,
        desglose,
      };
    })
    .sort(
      (a, b) =>
        Number(b.esRecomendable) - Number(a.esRecomendable) ||
        b.puntuacion - a.puntuacion ||
        a.costeTotal - b.costeTotal ||
        a.vivienda.nombre.localeCompare(b.vivienda.nombre, 'es'),
    );
}
