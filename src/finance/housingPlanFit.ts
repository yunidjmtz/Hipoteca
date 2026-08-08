import { fechaLocalISO } from '@/core/dates';
import {
  addCents,
  maxCents,
  type Cents,
  multiplyCents,
  subtractCents,
  sumCents,
  ZERO,
} from '@/core/money';
import {
  calcularCapacidadAhorroActual,
  calcularDeudasMensuales,
  calcularIngresoMensualNormalizado,
  calcularOtrosIngresosMensuales,
  calcularPlazoEfectivo,
  evaluarPrecio,
} from '@/finance/affordability';
import { construirContexto } from '@/finance/contexto';
import { capitalDesdeCuota } from '@/finance/mortgage';
import { mesesHastaObjetivo } from '@/finance/savingsGoal';
import type { EstadoPersistido, EvaluacionPrecio, ViviendaGuardada } from '@/domain/types';

/** El mismo horizonte que se muestra en el plan de ahorro. */
export const HORIZONTE_PLAN_MESES = 120;

export type EstadoEncajePlanVivienda =
  | 'en_plan'
  | 'alcanzable'
  | 'no_viable'
  | 'sin_presupuesto';

export interface ResultadoEncajePlanVivienda {
  estado: EstadoEncajePlanVivienda;
  limitante: 'ingresos' | 'ahorro' | null;
  presupuestoPlanificado: Cents;
  diferenciaPresupuesto: Cents;
  mesesHastaAlcanzar: number | null;
  prestamoMaximoPorIngresos: Cents | null;
  motivo: string;
  evaluacion: EvaluacionPrecio | null;
}

/**
 * Relaciona una vivienda con el precio objetivo del plan.
 *
 * Una vivienda dentro del presupuesto encaja directamente. Si lo supera, se
 * comprueba que la cuota sea asumible y que el desembolso completo (incluida
 * su reforma) pueda reunirse dentro del horizonte de ahorro del plan.
 */
export function evaluarEncajePlanVivienda(
  vivienda: ViviendaGuardada,
  estado: EstadoPersistido,
  fechaInicio = fechaLocalISO(),
): ResultadoEncajePlanVivienda {
  const presupuestoPlanificado = estado.preferencias.precioObjetivo;

  if (presupuestoPlanificado <= ZERO) {
    return {
      estado: 'sin_presupuesto',
      limitante: null,
      presupuestoPlanificado,
      diferenciaPresupuesto: ZERO,
      mesesHastaAlcanzar: null,
      prestamoMaximoPorIngresos: null,
      motivo: 'Configura el precio objetivo en Mi plan para comprobar esta vivienda.',
      evaluacion: null,
    };
  }

  if (vivienda.precioVenta <= presupuestoPlanificado) {
    return {
      estado: 'en_plan',
      limitante: null,
      presupuestoPlanificado,
      diferenciaPresupuesto: ZERO,
      mesesHastaAlcanzar: 0,
      prestamoMaximoPorIngresos: null,
      motivo: 'El precio de venta está dentro del presupuesto planificado.',
      evaluacion: null,
    };
  }

  const costeReforma = sumCents(vivienda.reformas.map((reforma) => reforma.costeEstimado));
  // La reforma de esta vivienda sustituye a la estimación general, igual que
  // en el cálculo de su coste total.
  const estadoConReforma = {
    ...estado,
    gastos: { ...estado.gastos, reforma: costeReforma },
  };
  const evaluacion = evaluarPrecio(
    vivienda.precioVenta,
    construirContexto(estadoConReforma, vivienda.precioVenta),
  );
  const diferenciaPresupuesto = subtractCents(vivienda.precioVenta, presupuestoPlanificado);
  const plazoEfectivo = calcularPlazoEfectivo(
    estado.ajustes.plazoPorDefecto,
    estado.ajustes,
    estado.perfil.titulares,
  );
  const ingresosMensuales = addCents(
    calcularIngresoMensualNormalizado(estado.perfil.titulares),
    calcularOtrosIngresosMensuales(estado.perfil),
  );
  const cuotaMaximaPorIngresos = maxCents(
    ZERO,
    subtractCents(
      multiplyCents(ingresosMensuales, estado.ajustes.ratioBancarioMaximo),
      calcularDeudasMensuales(estado.perfil.deudas),
    ),
  );
  const prestamoMaximoPorIngresos =
    plazoEfectivo > 0
      ? capitalDesdeCuota(
          cuotaMaximaPorIngresos,
          estado.ajustes.tinPorDefecto,
          plazoEfectivo * 12,
        )
      : ZERO;

  if (plazoEfectivo <= 0 || evaluacion.ratioBancario > estado.ajustes.ratioBancarioMaximo) {
    return {
      estado: 'no_viable',
      limitante: 'ingresos',
      presupuestoPlanificado,
      diferenciaPresupuesto,
      mesesHastaAlcanzar: null,
      prestamoMaximoPorIngresos,
      motivo:
        plazoEfectivo <= 0
          ? 'La edad configurada no deja plazo disponible para financiar la compra.'
          : 'Con tus ingresos actuales, el banco no financiaría el importe necesario para esta compra.',
      evaluacion,
    };
  }

  const mesesHastaAlcanzar = mesesHastaObjetivo({
    ahorroInicial: estado.perfil.ahorrosActuales,
    ahorroMensual: calcularCapacidadAhorroActual(estado.perfil),
    extraordinarios: estado.perfil.ingresosExtraordinarios,
    fechaInicio,
    precioObjetivo: evaluacion.dineroMinimo,
    crecimientoAnualPrecio: estado.ajustes.crecimientoAnualPrecioVivienda,
    rentabilidadAnualAhorro: estado.ajustes.rentabilidadAnualAhorro,
    mesesMaximos: HORIZONTE_PLAN_MESES,
  });

  if (mesesHastaAlcanzar === null) {
    return {
      estado: 'no_viable',
      limitante: 'ahorro',
      presupuestoPlanificado,
      diferenciaPresupuesto,
      mesesHastaAlcanzar,
      prestamoMaximoPorIngresos,
      motivo: `No se reúne el desembolso mínimo en los próximos ${HORIZONTE_PLAN_MESES / 12} años con tu capacidad de ahorro actual.`,
      evaluacion,
    };
  }

  return {
    estado: 'alcanzable',
    limitante: null,
    presupuestoPlanificado,
    diferenciaPresupuesto,
    mesesHastaAlcanzar,
    prestamoMaximoPorIngresos,
    motivo:
      mesesHastaAlcanzar === 0
        ? 'Aunque supera el presupuesto, ya dispones del desembolso mínimo y la cuota es asumible.'
        : `Aunque supera el presupuesto, puedes reunir el desembolso mínimo en ${mesesHastaAlcanzar} ${mesesHastaAlcanzar === 1 ? 'mes' : 'meses'}.`,
    evaluacion,
  };
}
