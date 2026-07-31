import {
  type Cents,
  ZERO,
  toCents,
  centsRoundHalfUp,
  addCents,
  subtractCents,
  multiplyCents,
  maxCents,
  minCents,
  sumCents,
} from '@/core/money';
import { cuotaMensual } from './mortgage';
import { calcularGastosCompra } from './purchaseCosts';
import { calcularDineroNecesario, inputDineroNecesarioDesdeGastos } from './moneyNeeded';
import type {
  ContextoEvaluacion,
  EvaluacionPrecio,
  EstadoViabilidad,
  ResultadoBusqueda,
  Titular,
  Ajustes,
} from '@/domain/types';

// ---------------------------------------------------------------------------
// Normalización de ingresos — R3
// ---------------------------------------------------------------------------

/** ingresos_mensuales = neto_por_paga × numeroPagas / 12 */
export function calcularIngresoMensualNormalizado(titulares: readonly Titular[]): Cents {
  let total: Cents = ZERO;
  for (const t of titulares) {
    total = addCents(total, centsRoundHalfUp((t.netoPorPaga * t.numeroPagas) / 12));
  }
  return total;
}

const DIVISORES_PERIODICIDAD = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
} as const;

/** Suma los gastos habituales del perfil expresados como equivalente mensual. */
function calcularImportesMensuales(
  importes: readonly {
    importe: Cents;
    periodicidad: keyof typeof DIVISORES_PERIODICIDAD;
  }[],
): Cents {
  return sumCents(
    importes.map((item) =>
      centsRoundHalfUp(item.importe / DIVISORES_PERIODICIDAD[item.periodicidad]),
    ),
  );
}

export function calcularGastosFijosMensuales(
  gastos: ContextoEvaluacion['perfil']['gastosFijos'],
): Cents {
  return calcularImportesMensuales(gastos.filter((gasto) => !gasto.esAlquilerActual));
}

/** Gastos mensuales actuales, incluido el alquiler que se paga hoy. */
export function calcularGastosFijosActualesMensuales(
  gastos: ContextoEvaluacion['perfil']['gastosFijos'],
): Cents {
  return calcularImportesMensuales(gastos);
}

/** Alquiler que se deja de pagar después de comprar la vivienda. */
export function calcularAlquilerActualMensual(
  gastos: ContextoEvaluacion['perfil']['gastosFijos'],
): Cents {
  return calcularImportesMensuales(gastos.filter((gasto) => gasto.esAlquilerActual));
}

export function calcularDeudasMensuales(deudas: ContextoEvaluacion['perfil']['deudas']): Cents {
  return calcularImportesMensuales(deudas);
}

/**
 * Margen mensual que queda hoy para ahorrar. Incluye todos los gastos fijos,
 * también el alquiler actual, y las deudas ya comprometidas.
 */
export function calcularCapacidadAhorroActual(perfil: ContextoEvaluacion['perfil']): Cents {
  const ingresos = addCents(
    calcularIngresoMensualNormalizado(perfil.titulares),
    perfil.otrosIngresosMensuales,
  );
  const deudas = calcularDeudasMensuales(perfil.deudas);
  const gastos = calcularGastosFijosActualesMensuales(perfil.gastosFijos);
  // Algunos datos importados antiguos aún guardan el alquiler fuera de la lista
  // de gastos. Solo se usa como respaldo si no hay un gasto marcado como alquiler.
  const alquilerMarcado = calcularAlquilerActualMensual(perfil.gastosFijos);
  const alquilerComoRespaldo = alquilerMarcado > ZERO ? ZERO : perfil.alquilerActual;
  return maxCents(
    ZERO,
    subtractCents(subtractCents(subtractCents(ingresos, deudas), gastos), alquilerComoRespaldo),
  );
}

// ---------------------------------------------------------------------------
// Plazo efectivo — R4
// ---------------------------------------------------------------------------

/**
 * Plazo real de la hipoteca limitado por la edad del titular de más edad.
 * El criterio 'mayor' (por defecto) usa el titular de más edad.
 */
export function calcularPlazoEfectivo(
  plazoSolicitado: number,
  ajustes: Ajustes,
  titulares: readonly Titular[],
): number {
  const edades = titulares.map((t) => t.edad);
  const edadCriterio = ajustes.criterioEdad === 'mayor' ? Math.max(...edades) : Math.min(...edades);

  const plazoMaxPorEdad = ajustes.edadMaximaAlVencimiento - edadCriterio;
  return Math.max(0, Math.min(plazoSolicitado, plazoMaxPorEdad));
}

// ---------------------------------------------------------------------------
// Factor limitante
// ---------------------------------------------------------------------------

export type FactorLimitante =
  'ahorro' | 'cuota' | 'ahorro_y_cuota' | 'tasacion' | 'edad' | 'ninguno';

export function factorLimitante(e: EvaluacionPrecio): FactorLimitante {
  const faltaAhorro = e.faltante > 0;
  const cuotaExcesiva = e.estado === 'cuota_excesiva' || e.ratioBancario > 0.35;
  if (faltaAhorro && cuotaExcesiva) return 'ahorro_y_cuota';
  if (faltaAhorro) return 'ahorro';
  if (cuotaExcesiva) return 'cuota';
  return 'ninguno';
}

// ---------------------------------------------------------------------------
// Evaluación de un precio — §4.2, R5, R11
// ---------------------------------------------------------------------------

export function evaluarPrecio(precio: Cents, ctx: ContextoEvaluacion): EvaluacionPrecio {
  const { perfil, gastos, costesRecurrentes, ajustes, configFiscal } = ctx;

  // R5: base financiable
  const tasacion = ctx.valorTasacion;
  const baseFinanciable = minCents(precio, tasacion);
  const importeFinanciado = multiplyCents(baseFinanciable, ctx.ltv);
  const entrada = subtractCents(precio, importeFinanciado);

  // Impuestos y gastos de compra
  const resultadoGastos = calcularGastosCompra(
    precio,
    configFiscal,
    ctx.estadoVivienda,
    ctx.esVpoEspecial,
    ctx.reduccion,
    gastos,
    ctx.valorReferenciaFiscal,
  );

  // Plazo efectivo (R4)
  const plazoEfectivo = calcularPlazoEfectivo(ctx.plazoAnios, ajustes, perfil.titulares);

  // Cuota mensual (R6)
  const cuota = cuotaMensual(importeFinanciado, ctx.tinAnual, plazoEfectivo * 12);

  // Ingresos normalizados (R3)
  const ingresoMensual = addCents(
    calcularIngresoMensualNormalizado(perfil.titulares),
    perfil.otrosIngresosMensuales,
  );

  // Otras deudas mensuales
  const otrasDeudas = calcularDeudasMensuales(perfil.deudas);
  const gastosFijosMensuales = calcularGastosFijosMensuales(perfil.gastosFijos);

  // R11: ratio bancario
  const ratioBancario = ingresoMensual > 0 ? (cuota + otrasDeudas) / ingresoMensual : Infinity;

  // R11: coste mensual real de la vivienda
  const costeMensualVivienda = sumCents([
    cuota,
    costesRecurrentes.comunidadMensual,
    centsRoundHalfUp(costesRecurrentes.ibiAnual / 12),
    centsRoundHalfUp(costesRecurrentes.seguroHogarAnual / 12),
    centsRoundHalfUp(costesRecurrentes.seguroVidaAnual / 12),
    costesRecurrentes.mantenimientoMensual,
    costesRecurrentes.garajeMensual,
    costesRecurrentes.suministrosMensuales,
    costesRecurrentes.otrosMensuales,
  ]);

  const ratioPersonal =
    ingresoMensual > 0 ? (costeMensualVivienda + otrasDeudas) / ingresoMensual : Infinity;

  const dineroLibreMensual = subtractCents(
    subtractCents(subtractCents(ingresoMensual, costeMensualVivienda), otrasDeudas),
    gastosFijosMensuales,
  );

  // §4.3: dinero necesario
  const dnInput = inputDineroNecesarioDesdeGastos(
    entrada,
    resultadoGastos.impuestos,
    resultadoGastos.gastosObligatorios,
    resultadoGastos.gastosComerciales,
    gastos,
    perfil.ahorrosActuales,
  );
  const dn = calcularDineroNecesario(dnInput);

  const ahorroDisponible = dn.ahorroUtilizable;
  const faltante = dn.faltanteMinimo;

  const estado = determinarEstado(
    dn,
    ratioBancario,
    ajustes.ratioBancarioMaximo,
    ajustes.ratioPersonalObjetivo,
  );

  const motivo = generarMotivo(estado, dn, ratioBancario, ajustes.ratioBancarioMaximo);

  return {
    precio,
    tasacion,
    importeFinanciado,
    entrada,
    impuestos: resultadoGastos.impuestos,
    gastosObligatorios: resultadoGastos.gastosObligatorios,
    gastosInmobiliaria: resultadoGastos.inmobiliaria,
    gastosBroker: resultadoGastos.broker,
    otrosGastos: addCents(resultadoGastos.gastosObligatorios, resultadoGastos.gastosComerciales),
    dineroMinimo: dn.dineroMinimo,
    dineroRecomendado: dn.dineroRecomendado,
    dineroComodo: dn.dineroComodo,
    ahorroDisponible,
    faltante,
    cuota,
    costeMensualVivienda,
    ratioBancario,
    ratioPersonal,
    dineroLibreMensual,
    estado,
    motivo,
  };
}

// ---------------------------------------------------------------------------
// Búsqueda del precio máximo — R16
// ---------------------------------------------------------------------------

const PASO_GRUESO = toCents(1_000);
const PASO_FINO = toCents(100);

export function buscarPrecioMaximo(
  predicado: (e: EvaluacionPrecio) => boolean,
  ctxFactory: ContextoEvaluacion | ((precio: Cents) => ContextoEvaluacion),
  rango: { min: Cents; max: Cents },
): ResultadoBusqueda {
  const resolverCtx = typeof ctxFactory === 'function' ? ctxFactory : () => ctxFactory;

  type Intervalo = { desde: Cents; hasta: Cents };
  const intervalosViables: Intervalo[] = [];
  let inicioIntervalo: Cents | null = null;

  // Barrido grueso de 1.000 € en 1.000 €
  for (let p: Cents = rango.min; p <= rango.max; p = addCents(p, PASO_GRUESO)) {
    const viable = predicado(evaluarPrecio(p, resolverCtx(p)));
    if (viable && inicioIntervalo === null) {
      inicioIntervalo = p;
    } else if (!viable && inicioIntervalo !== null) {
      intervalosViables.push({ desde: inicioIntervalo, hasta: subtractCents(p, PASO_GRUESO) });
      inicioIntervalo = null;
    }
  }
  if (inicioIntervalo !== null) {
    intervalosViables.push({ desde: inicioIntervalo, hasta: rango.max });
  }

  if (intervalosViables.length === 0) {
    return { precioMaximo: null, intervalosViables: [], hayDiscontinuidad: false };
  }

  const ultimo = intervalosViables[intervalosViables.length - 1];
  if (ultimo === undefined) {
    return { precioMaximo: null, intervalosViables: [], hayDiscontinuidad: false };
  }

  // Refinado fino en el borde superior del último intervalo viable
  let finoBajo = ultimo.hasta;
  let finoAlto = minCents(addCents(ultimo.hasta, PASO_GRUESO), rango.max);

  // Si el último intervalo llega al tope del rango no hay nada que refinar
  if (finoBajo < finoAlto) {
    while (finoAlto - finoBajo > PASO_FINO) {
      const medio = Math.floor((finoBajo + finoAlto) / 2) as Cents;
      if (predicado(evaluarPrecio(medio, resolverCtx(medio)))) {
        finoBajo = medio;
      } else {
        finoAlto = medio;
      }
    }
  }

  return {
    precioMaximo: finoBajo,
    intervalosViables,
    hayDiscontinuidad: intervalosViables.length > 1,
  };
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function determinarEstado(
  dn: ReturnType<typeof calcularDineroNecesario>,
  ratioBancario: number,
  ratioMax: number,
  ratioObjetivo: number,
): EstadoViabilidad {
  const tieneMinimo = dn.faltanteMinimo <= 0;
  const tieneRecomendado = dn.faltanteRecomendado <= 0;
  const cuotaOk = ratioBancario <= ratioMax;
  const ratioComodo = ratioBancario <= ratioObjetivo;

  if (!tieneMinimo && !cuotaOk) return 'no_viable';
  if (!tieneMinimo) return 'falta_ahorro';
  if (!cuotaOk) return 'cuota_excesiva';
  if (!tieneRecomendado || !ratioComodo) return 'ajustado';
  if (dn.faltanteComodo <= 0 && ratioComodo) return 'comodo';
  return 'viable';
}

function generarMotivo(
  estado: EstadoViabilidad,
  dn: ReturnType<typeof calcularDineroNecesario>,
  ratioBancario: number,
  ratioMax: number,
): string {
  switch (estado) {
    case 'comodo':
      return 'Dispones del dinero recomendado y la cuota es asumible.';
    case 'viable':
      return 'Dispones del dinero mínimo y la cuota está dentro del límite.';
    case 'ajustado':
      return dn.faltanteRecomendado > 0
        ? 'Cubre el mínimo, pero te falta parte del dinero recomendado.'
        : `La cuota (${(ratioBancario * 100).toFixed(1)} %) roza el límite del ${(ratioMax * 100).toFixed(0)} %.`;
    case 'falta_ahorro':
      return 'La cuota sería asumible, pero no tienes suficiente ahorro para el desembolso inicial.';
    case 'cuota_excesiva':
      return `La cuota supera el ${(ratioMax * 100).toFixed(0)} % de tus ingresos.`;
    case 'no_viable':
      return 'Ni el ahorro ni la cuota son suficientes para esta operación.';
  }
}
