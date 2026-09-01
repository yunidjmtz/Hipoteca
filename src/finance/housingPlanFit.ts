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
  buscarPrecioMaximo,
  calcularCapacidadAhorroActual,
  calcularDeudasMensuales,
  calcularIngresoMensualNormalizado,
  calcularOtrosIngresosMensuales,
  calcularPlazoEfectivo,
  esCompraComoda,
  evaluarPrecio,
  RANGO_BUSQUEDA_CAPACIDAD,
} from '@/finance/affordability';
import { construirContexto, CONTEXTO_VIVIENDA_PLAN } from '@/finance/contexto';
import { capitalDesdeCuota } from '@/finance/mortgage';
import { proyectarAhorro } from '@/finance/savingsGoal';
import type { EstadoPersistido, EvaluacionPrecio, ViviendaGuardada } from '@/domain/types';

/** El mismo horizonte que se muestra en el plan de ahorro. */
export const HORIZONTE_PLAN_MESES = 120;

export type EstadoEncajePlanVivienda = 'en_plan' | 'alcanzable' | 'no_viable' | 'sin_presupuesto';

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
 * Relaciona una vivienda con el precio cómodo calculado para el plan.
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
  const presupuestoPlanificado =
    buscarPrecioMaximo(
      (evaluacion) => esCompraComoda(evaluacion, estado.ajustes.ratioPersonalObjetivo),
      (precio) => construirContexto(estado, precio, undefined, CONTEXTO_VIVIENDA_PLAN),
      RANGO_BUSQUEDA_CAPACIDAD,
    ).precioMaximo ?? ZERO;
  const faltaPresupuesto = presupuestoPlanificado <= ZERO;

  const costeReforma = sumCents(vivienda.reformas.map((reforma) => reforma.costeEstimado));
  // La reforma de esta vivienda sustituye a la estimación general, igual que
  // en el cálculo de su coste total.
  const estadoConReforma = {
    ...estado,
    gastos: { ...estado.gastos, reforma: costeReforma },
  };
  const evaluacion = evaluarPrecio(
    vivienda.precioVenta,
    construirContexto(estadoConReforma, vivienda.precioVenta, undefined, vivienda),
  );
  const estaDentroDelPresupuesto =
    !faltaPresupuesto && vivienda.precioVenta <= presupuestoPlanificado;
  const diferenciaPresupuesto = maxCents(
    ZERO,
    subtractCents(vivienda.precioVenta, presupuestoPlanificado),
  );
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
      ? capitalDesdeCuota(cuotaMaximaPorIngresos, estado.ajustes.tinPorDefecto, plazoEfectivo * 12)
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

  const evaluacionesPorMes = new Map<number, EvaluacionPrecio>([[0, evaluacion]]);
  const evaluacionEnMes = (mes: number): EvaluacionPrecio => {
    const existente = evaluacionesPorMes.get(mes);
    if (existente !== undefined) return existente;

    const factorPrecio = Math.pow(1 + estado.ajustes.crecimientoAnualPrecioVivienda, mes / 12);
    const precioFuturo = multiplyCents(vivienda.precioVenta, factorPrecio);
    const futura = evaluarPrecio(
      precioFuturo,
      construirContexto(estadoConReforma, precioFuturo, undefined, vivienda),
    );
    evaluacionesPorMes.set(mes, futura);
    return futura;
  };
  const proyeccion = proyectarAhorro({
    ahorroInicial: estado.perfil.ahorrosActuales,
    ahorroMensual: calcularCapacidadAhorroActual(estado.perfil),
    extraordinarios: estado.perfil.ingresosExtraordinarios,
    fechaInicio,
    precioObjetivo: evaluacion.dineroRecomendado,
    crecimientoAnualPrecio: estado.ajustes.crecimientoAnualPrecioVivienda,
    rentabilidadAnualAhorro: estado.ajustes.rentabilidadAnualAhorro,
    mesesMaximos: HORIZONTE_PLAN_MESES,
    objetivoEnMes: (mes) => evaluacionEnMes(mes).dineroRecomendado,
  });
  const primerMesConAhorro = proyeccion.find((punto) => punto.diferencia >= ZERO);
  const primerMesViable = proyeccion.find(
    (punto) =>
      punto.diferencia >= ZERO &&
      evaluacionEnMes(punto.mes).ratioBancario <= estado.ajustes.ratioBancarioMaximo,
  );
  const mesesHastaAlcanzar = primerMesViable?.mes ?? null;

  if (mesesHastaAlcanzar === null) {
    const precioFuturoLimitaIngresos = primerMesConAhorro !== undefined;
    return {
      estado: 'no_viable',
      limitante: precioFuturoLimitaIngresos ? 'ingresos' : 'ahorro',
      presupuestoPlanificado,
      diferenciaPresupuesto,
      mesesHastaAlcanzar,
      prestamoMaximoPorIngresos,
      motivo: precioFuturoLimitaIngresos
        ? 'El ahorro alcanzaría el desembolso, pero el precio proyectado elevaría la cuota por encima del límite bancario.'
        : `No se reúne el desembolso recomendado en los próximos ${HORIZONTE_PLAN_MESES / 12} años con tu capacidad de ahorro actual.`,
      evaluacion,
    };
  }

  if (faltaPresupuesto) {
    return {
      estado: 'sin_presupuesto',
      limitante: null,
      presupuestoPlanificado,
      diferenciaPresupuesto: ZERO,
      mesesHastaAlcanzar,
      prestamoMaximoPorIngresos,
      motivo:
        'La cuota y el ahorro son compatibles, pero faltan ingresos para calcular una compra cómoda de referencia.',
      evaluacion,
    };
  }

  if (estaDentroDelPresupuesto) {
    return {
      estado: 'en_plan',
      limitante: null,
      presupuestoPlanificado,
      diferenciaPresupuesto,
      mesesHastaAlcanzar,
      prestamoMaximoPorIngresos,
      motivo:
        mesesHastaAlcanzar === 0
          ? 'Está dentro del presupuesto, dispones del desembolso recomendado y la cuota es asumible.'
          : `Está dentro del presupuesto y puedes reunir el desembolso recomendado en ${mesesHastaAlcanzar} ${mesesHastaAlcanzar === 1 ? 'mes' : 'meses'}.`,
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
        ? 'Aunque supera el presupuesto, ya dispones del desembolso recomendado y la cuota es asumible.'
        : `Aunque supera el presupuesto, puedes reunir el desembolso recomendado en ${mesesHastaAlcanzar} ${mesesHastaAlcanzar === 1 ? 'mes' : 'meses'}.`,
    evaluacion,
  };
}
