import {
  type Cents,
  ZERO,
  centsRoundHalfUp,
  addCents,
  subtractCents,
  multiplyCents,
} from '@/core/money';
import { fechaVencimiento } from '@/core/dates';
import type { LineaMensual, FlujoInput, ProductoVinculado, TipoHipoteca } from '@/domain/types';

// ---------------------------------------------------------------------------
// Cuota mensual — R6
// ---------------------------------------------------------------------------

/**
 * Cuota mensual por el sistema francés (amortización constante).
 * r = TIN_decimal / 12; n = plazoMeses.
 */
export function cuotaMensual(capital: Cents, tinAnual: number, plazoMeses: number): Cents {
  if (plazoMeses <= 0 || capital <= 0) return ZERO;
  const r = tinAnual / 12;
  if (1 + r === 1) {
    return centsRoundHalfUp(capital / plazoMeses);
  }
  const factor = Math.pow(1 + r, -plazoMeses);
  return centsRoundHalfUp((capital * r) / (1 - factor));
}

/**
 * Capital máximo financiable dada una cuota mensual. Inversa de cuotaMensual (R6).
 */
export function capitalDesdeCuota(cuota: Cents, tinAnual: number, plazoMeses: number): Cents {
  if (plazoMeses <= 0 || cuota <= 0) return ZERO;
  const r = tinAnual / 12;
  if (1 + r === 1) {
    return centsRoundHalfUp(cuota * plazoMeses);
  }
  const factor = Math.pow(1 + r, -plazoMeses);
  return centsRoundHalfUp((cuota * (1 - factor)) / r);
}

// ---------------------------------------------------------------------------
// Helpers de TIN y bonificaciones
// ---------------------------------------------------------------------------

/**
 * Bonificación efectiva de un producto en el mes k.
 * Aplica únicamente si activo = true y el año no ha superado aniosExigidos.
 */
function bonificacionEfectivaMes(v: ProductoVinculado, k: number): number {
  if (!v.activo) return 0;
  const anio = Math.ceil(k / 12);
  if (v.aniosExigidos !== null && anio > v.aniosExigidos) return 0;
  return v.bonificacionMaxima !== undefined
    ? Math.min(v.bonificacionTin, v.bonificacionMaxima)
    : v.bonificacionTin;
}

/**
 * Suma de bonificaciones de todas las vinculaciones activas en el mes k.
 */
export function calcularBonificacionTotal(
  vinculaciones: readonly ProductoVinculado[],
  k: number,
): number {
  let total = 0;
  for (const v of vinculaciones) {
    total += bonificacionEfectivaMes(v, k);
  }
  return total;
}

/**
 * Euríbor aplicable al mes k: usa el valor del periodo más reciente con
 * desdeMes <= k. Si no hay periodos definidos, usa el euribor constante.
 */
function obtenerEuriborMes(k: number, input: FlujoInput): number {
  const periodos = input.euriborPorPeriodos;
  if (periodos !== undefined && periodos.length > 0) {
    let euribor = input.euribor ?? 0;
    let mesElegido = -Infinity;
    for (const p of periodos) {
      if (p.desdeMes <= k && p.desdeMes >= mesElegido) {
        euribor = p.valor;
        mesElegido = p.desdeMes;
      }
    }
    return euribor;
  }
  return input.euribor ?? 0;
}

/**
 * TIN efectivo en el mes k según el tipo de hipoteca (R9, variable y mixta).
 * Para fija: max(sueloTin, tinAnual).
 * Para variable y fase variable de mixta: max(sueloTin, euribor + dif − bonifs).
 */
export function calcularTinMes(k: number, input: FlujoInput, mesesFijos: number): number {
  const { tipo, sueloTin, tinAnual, diferencial = 0, vinculaciones } = input;
  const bonif = calcularBonificacionTotal(vinculaciones, k);

  if (tipo === 'fija') {
    // Las bonificaciones reducen el TIN fijo de la misma forma que el variable (R13).
    return Math.max(sueloTin, tinAnual - bonif);
  }
  if (tipo === 'mixta' && k <= mesesFijos) {
    const tinFijo = input.mixtaTinFijo ?? tinAnual;
    return Math.max(sueloTin, tinFijo - bonif);
  }
  // variable o fase variable de mixta
  const euriborK = obtenerEuriborMes(k, input);
  return Math.max(sueloTin, euriborK + diferencial - bonif);
}

/**
 * Devuelve true si el mes k es un punto de revisión del TIN.
 * Variable: revisiones en k=1, 1+N, 1+2N, …
 * Mixta: primera revisión al inicio de la fase variable; luego cada N meses.
 */
function esRevision(
  k: number,
  tipo: TipoHipoteca,
  mesesFijos: number,
  periodicidadMeses: number,
): boolean {
  if (tipo === 'fija') return false;
  if (tipo === 'variable') {
    return k === 1 || (k - 1) % periodicidadMeses === 0;
  }
  // mixta
  if (k <= mesesFijos) return false;
  const kRelativo = k - mesesFijos;
  return kRelativo === 1 || (kRelativo - 1) % periodicidadMeses === 0;
}

// ---------------------------------------------------------------------------
// Costes periódicos de vinculaciones — Fase 2
// ---------------------------------------------------------------------------

/**
 * Coste mensual de una vinculación en el mes k.
 * Aplica crecimiento compuesto anual (incrementoAnual) y respeta aniosExigidos.
 */
export function calcularCosteVinculacionMes(v: ProductoVinculado, k: number): Cents {
  if (!v.activo) return ZERO;
  const anio = Math.ceil(k / 12);
  if (v.aniosExigidos !== null && anio > v.aniosExigidos) return ZERO;
  return multiplyCents(v.costeAnual, Math.pow(1 + v.incrementoAnual, anio - 1) / 12);
}

/**
 * Suma de costes mensuales de todas las vinculaciones activas en el mes k.
 */
function calcularCostesVinculadosMes(vinculaciones: FlujoInput['vinculaciones'], k: number): Cents {
  let total: Cents = ZERO;
  for (const v of vinculaciones) {
    total = addCents(total, calcularCosteVinculacionMes(v, k));
  }
  return total;
}

// ---------------------------------------------------------------------------
// Cuadro de amortización completo — §4.1, R7, R9, R10
// ---------------------------------------------------------------------------

/**
 * Construye el flujo de caja mensual completo.
 *
 * - Línea 0: desembolso inicial (comisión de apertura; cuota, intereses, principal = 0).
 * - Líneas 1..n: cuotas mensuales con cierre exacto a pendiente = 0 en la última.
 *
 * Soporta hipoteca fija (Fase 1a), variable (R9) y mixta (R10).
 * En cada revisión del TIN se recalcula la cuota con el capital pendiente
 * y el plazo restante, replicando el comportamiento real de las entidades.
 */
export function construirFlujoDeCaja(input: FlujoInput): LineaMensual[] {
  const {
    capital,
    plazoMeses,
    fechaPrimeraCuota,
    comisionApertura,
    vinculaciones,
    tipo,
    periodicidadRevision,
  } = input;

  const periodicidadMeses: number = periodicidadRevision === 'semestral' ? 6 : 12;
  const mesesFijos = (input.mixtaAniosFijos ?? 0) * 12;

  // TIN y cuota iniciales (para fija y fase fija de mixta, no cambian)
  let tinActual = calcularTinMes(1, input, mesesFijos);
  let cuotaActual = cuotaMensual(capital, tinActual, plazoMeses);
  let pendiente: Cents = capital;

  const lineas: LineaMensual[] = [];

  // Línea 0: desembolso inicial
  lineas.push({
    numero: 0,
    fecha: fechaVencimiento(fechaPrimeraCuota, 1),
    tinAplicado: tinActual,
    cuota: ZERO,
    intereses: ZERO,
    principal: ZERO,
    pendiente: capital,
    costesVinculados: ZERO,
    comisiones: comisionApertura,
  });

  for (let k = 1; k <= plazoMeses; k++) {
    const esUltima = k === plazoMeses;
    const fecha = fechaVencimiento(fechaPrimeraCuota, k);
    const mesesRestantes = plazoMeses - k + 1;

    // Revisión del TIN (variable y mixta)
    const tinCalculado = calcularTinMes(k, input, mesesFijos);
    const estaEnTramoEstable = tipo === 'fija' || (tipo === 'mixta' && k <= mesesFijos);
    const cambiaBonificacionEnTramoEstable = estaEnTramoEstable && tinCalculado !== tinActual;
    if (esRevision(k, tipo, mesesFijos, periodicidadMeses) || cambiaBonificacionEnTramoEstable) {
      tinActual = tinCalculado;
      cuotaActual = cuotaMensual(pendiente, tinActual, mesesRestantes);
    }

    const rRaw = tinActual / 12;
    const r = 1 + rRaw === 1 ? 0 : rRaw;
    const intereses = centsRoundHalfUp(pendiente * r);

    // R7: última cuota cierra el capital pendiente exacto
    const principal: Cents = esUltima ? pendiente : subtractCents(cuotaActual, intereses);

    const cuotaReal: Cents = esUltima ? addCents(intereses, pendiente) : cuotaActual;

    const costesVinculados = calcularCostesVinculadosMes(vinculaciones, k);
    const nuevoPendiente = subtractCents(pendiente, principal);

    lineas.push({
      numero: k,
      fecha,
      tinAplicado: tinActual,
      cuota: cuotaReal,
      intereses,
      principal,
      pendiente: nuevoPendiente,
      costesVinculados,
      comisiones: ZERO,
    });

    pendiente = nuevoPendiente;
  }

  return lineas;
}

export type { LineaMensual };
