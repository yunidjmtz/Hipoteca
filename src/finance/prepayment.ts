/**
 * Simulación de amortización anticipada (R14).
 * Calcula el flujo real tras adelantar capital y devuelve el ahorro neto.
 *
 * Las reglas de interés (R7) y TIN (R9) son las mismas que en construirFlujoDeCaja.
 * Se reimplementa el bucle aquí para inyectar el evento de amortización
 * a mitad de la vida del préstamo, sin alterar la firma de la función principal.
 */
import {
  type Cents,
  ZERO,
  addCents,
  subtractCents,
  sumCents,
  minCents,
  centsRoundHalfUp,
} from '@/core/money';
import { fechaVencimiento } from '@/core/dates';
import type { LineaMensual, FlujoInput } from '@/domain/types';
import {
  construirFlujoDeCaja,
  cuotaMensual,
  calcularTinMes,
  calcularCosteVinculacionMes,
} from './mortgage';

// ---------------------------------------------------------------------------
// Helpers locales (duplicados intencionados para no modificar mortgage.ts)
// ---------------------------------------------------------------------------

function esRevisionLocal(
  k: number,
  tipo: FlujoInput['tipo'],
  mesesFijos: number,
  periodicidadMeses: number,
): boolean {
  if (tipo === 'fija') return false;
  if (tipo === 'variable') return k === 1 || (k - 1) % periodicidadMeses === 0;
  if (k <= mesesFijos) return false;
  const kRel = k - mesesFijos;
  return kRel === 1 || (kRel - 1) % periodicidadMeses === 0;
}

function costesVinculadosMesLocal(vincs: FlujoInput['vinculaciones'], k: number): Cents {
  let total: Cents = ZERO;
  for (const v of vincs) {
    total = addCents(total, calcularCosteVinculacionMes(v, k));
  }
  return total;
}

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type OpcionAmortizacion = 'cuota' | 'plazo';

export interface AportacionAmortizacion {
  /** Importe de la aportación extraordinaria (en céntimos). */
  importe: Cents;
  /** Número de cuota (1-indexado) en el que se realiza la aportación. */
  enMes: number;
}

export interface InputAmortizacionAnticipada {
  /**
   * Aportaciones extraordinarias a simular. Las que coinciden en un mismo mes
   * se suman antes de recalcular la cuota o el plazo.
   */
  aportaciones?: readonly AportacionAmortizacion[];
  /** Compatibilidad con la simulación de una sola aportación. */
  importe?: Cents;
  /** Compatibilidad con la simulación de una sola aportación. */
  enMes?: number;
  /** 'cuota': mismo plazo, cuota menor; 'plazo': misma cuota, plazo menor. */
  opcion: OpcionAmortizacion;
  /** Decimal; de EscenarioHipoteca.comisiones.amortizacionParcial. */
  comisionParcial: number;
}

export interface ResultadoAmortizacion {
  flujoAmortizado: LineaMensual[];
  comision: Cents;
  interesesOriginales: Cents;
  interesesAmortizados: Cents;
  ahorroIntereses: Cents;
  /** ahorroIntereses − comision */
  ahorroNeto: Cents;
  nuevaCuota: Cents | null;
  nuevoNumCuotas: number | null;
  diferenciaCuota: Cents | null;
  diferenciaMeses: number | null;
}

function agruparAportacionesPorMes(amort: InputAmortizacionAnticipada): Map<number, Cents> {
  const aportaciones = amort.aportaciones ?? [
    { importe: amort.importe ?? ZERO, enMes: amort.enMes ?? 1 },
  ];
  const porMes = new Map<number, Cents>();

  for (const aportacion of aportaciones) {
    if (aportacion.importe <= ZERO || aportacion.enMes < 1) continue;
    porMes.set(
      aportacion.enMes,
      addCents(porMes.get(aportacion.enMes) ?? ZERO, aportacion.importe),
    );
  }

  return porMes;
}

// ---------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------

/**
 * Construye el flujo de caja completo con el evento de amortización
 * anticipada inyectado en el mes indicado.
 *
 * Invariante: el flujo resultante tiene pendiente = 0 en la última línea.
 */
export function simularAmortizacionAnticipada(
  input: FlujoInput,
  amort: InputAmortizacionAnticipada,
): ResultadoAmortizacion {
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

  // Flujo base: para obtener los intereses originales de referencia
  const flujoOriginal = construirFlujoDeCaja(input);
  const interesesOriginales = sumCents(flujoOriginal.slice(1).map((l) => l.intereses));
  const cuotaOriginalMes1 = flujoOriginal[1]?.cuota ?? ZERO;
  const aportacionesPorMes = agruparAportacionesPorMes(amort);

  // Estado inicial del bucle amortizado
  let tinActual = calcularTinMes(1, input, mesesFijos);
  let cuotaActual = cuotaMensual(capital, tinActual, plazoMeses);
  let pendiente: Cents = capital;
  let comision: Cents = ZERO;
  let nuevaCuota: Cents | null = null;
  let plazoEfectivo = plazoMeses;

  const lineas: LineaMensual[] = [];

  // Línea 0: desembolso inicial
  lineas.push({
    numero: 0,
    fecha: fechaVencimiento(fechaPrimeraCuota, 1),
    tinAplicado: tinActual,
    cuota: ZERO,
    intereses: ZERO,
    principal: ZERO,
    amortizacionExtraordinaria: ZERO,
    pendiente: capital,
    costesVinculados: ZERO,
    comisiones: comisionApertura,
  });

  for (let k = 1; k <= plazoEfectivo; k++) {
    const fecha = fechaVencimiento(fechaPrimeraCuota, k);
    const mesesRestantes = plazoEfectivo - k + 1;

    // Revisión del TIN (R9, mixta y variable)
    const tinCalculado = calcularTinMes(k, input, mesesFijos);
    const estaEnTramoEstable = tipo === 'fija' || (tipo === 'mixta' && k <= mesesFijos);
    const cambiaBonificacionEnTramoEstable = estaEnTramoEstable && tinCalculado !== tinActual;
    if (
      esRevisionLocal(k, tipo, mesesFijos, periodicidadMeses) ||
      cambiaBonificacionEnTramoEstable
    ) {
      tinActual = tinCalculado;
      cuotaActual = cuotaMensual(pendiente, tinActual, mesesRestantes);
    }

    // Aportación extraordinaria antes del pago ordinario del mes k.
    const aportacion = aportacionesPorMes.get(k) ?? ZERO;
    let comisionMes = ZERO;
    let amortizacionExtraordinaria = ZERO;
    if (aportacion > ZERO) {
      const importeEfectivo = minCents(aportacion, pendiente);
      amortizacionExtraordinaria = importeEfectivo;
      comisionMes = centsRoundHalfUp(importeEfectivo * amort.comisionParcial);
      comision = addCents(comision, comisionMes);
      pendiente = subtractCents(pendiente, importeEfectivo);

      if (pendiente <= ZERO) {
        // Amortización total anticipada: termina aquí
        lineas.push({
          numero: k,
          fecha,
          tinAplicado: tinActual,
          cuota: ZERO,
          intereses: ZERO,
          principal: ZERO,
          amortizacionExtraordinaria,
          pendiente: ZERO,
          costesVinculados: ZERO,
          comisiones: comisionMes,
        });
        break;
      }

      if (amort.opcion === 'cuota') {
        // Mismo plazo, cuota menor: recalcular con el nuevo capital
        cuotaActual = cuotaMensual(pendiente, tinActual, mesesRestantes);
        nuevaCuota = cuotaActual;
      } else {
        // Misma cuota, plazo menor: buscar cuántos meses quedan
        const r = tinActual / 12;
        if (r > 0) {
          const rawN = Math.log(cuotaActual / (cuotaActual - pendiente * r)) / Math.log(1 + r);
          plazoEfectivo = k - 1 + Math.ceil(rawN);
        } else {
          plazoEfectivo = k - 1 + Math.ceil(pendiente / cuotaActual);
        }
      }
    }

    const esUltima = k === plazoEfectivo;
    const rRaw = tinActual / 12;
    const r = 1 + rRaw === 1 ? 0 : rRaw;
    const intereses = centsRoundHalfUp(pendiente * r);
    const principal: Cents = esUltima ? pendiente : subtractCents(cuotaActual, intereses);
    const cuotaReal: Cents = esUltima ? addCents(intereses, pendiente) : cuotaActual;
    const cv = costesVinculadosMesLocal(vinculaciones, k);
    const nuevoPendiente = subtractCents(pendiente, principal);

    lineas.push({
      numero: k,
      fecha,
      tinAplicado: tinActual,
      cuota: cuotaReal,
      intereses,
      principal,
      amortizacionExtraordinaria,
      pendiente: nuevoPendiente,
      costesVinculados: cv,
      comisiones: comisionMes,
    });

    pendiente = nuevoPendiente;
  }

  const interesesAmortizados = sumCents(lineas.slice(1).map((l) => l.intereses));
  const ahorroIntereses = subtractCents(interesesOriginales, interesesAmortizados);
  const ahorroNeto = subtractCents(ahorroIntereses, comision);

  return {
    flujoAmortizado: lineas,
    comision,
    interesesOriginales,
    interesesAmortizados,
    ahorroIntereses,
    ahorroNeto,
    nuevaCuota: amort.opcion === 'cuota' ? nuevaCuota : null,
    nuevoNumCuotas: amort.opcion === 'plazo' ? plazoEfectivo : null,
    diferenciaCuota:
      amort.opcion === 'cuota' && nuevaCuota !== null
        ? subtractCents(cuotaOriginalMes1, nuevaCuota)
        : null,
    diferenciaMeses: amort.opcion === 'plazo' ? plazoMeses - plazoEfectivo : null,
  };
}
