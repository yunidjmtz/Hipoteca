/**
 * TAE estimada por TIR — R12.
 * Incluye los costes obligatorios y los de cualquier producto activo que
 * conceda una bonificación del tipo de interés.
 * TAE = (1 + i_mensual)^12 − 1  (anualización compuesta, convención FEIN).
 */
import { type Cents, subtractCents, sumCents } from '@/core/money';
import type { LineaMensual, ProductoVinculado } from '@/domain/types';
import { calcularCosteVinculacionMes } from './mortgage';

// ---------------------------------------------------------------------------
// NPV del flujo de caja
// ---------------------------------------------------------------------------

function npv(flujo: readonly number[], tasa: number): number {
  let v = flujo[0] ?? 0;
  for (let k = 1; k < flujo.length; k++) {
    v += (flujo[k] ?? 0) / Math.pow(1 + tasa, k);
  }
  return v;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Calcula la TAE estimada a partir del flujo de caja y las vinculaciones.
 *
 * @param lineas   Flujo completo devuelto por construirFlujoDeCaja.
 * @param capital  Importe total del préstamo (antes de comisiones).
 * @param vinculaciones  Vinculaciones del escenario. Entran las obligatorias
 *                 activas y las activas que bonifican el tipo de interés.
 * @returns TAE como decimal (ej. 0.035 = 3,5 %) o 0 si no converge.
 */
export function calcularTaeEstimada(
  lineas: readonly LineaMensual[],
  capital: Cents,
  vinculaciones: readonly ProductoVinculado[],
): number {
  if (lineas.length < 2 || capital <= 0) return 0;
  const linea0 = lineas[0];
  if (linea0 === undefined) return 0;

  // Capital neto = lo que el prestatario recibe realmente (R12, paso 1)
  const comisionApertura = linea0.comisiones;
  const vinculacionesIncluidas = vinculaciones.filter(
    (v) => v.activo && (v.obligatorio || v.bonificacionTin > 0),
  );
  const costesInicialesIncluidos: Cents = sumCents(
    vinculacionesIncluidas.map((v) => v.costeInicial),
  );
  const capitalNeto = subtractCents(
    subtractCents(capital, comisionApertura),
    costesInicialesIncluidos,
  );
  if (capitalNeto <= 0) return 0;

  // Flujo: t=0 es −capitalNeto; t=k es cuota + costes obligatorios del mes k
  const cuotas = lineas.slice(1);
  const flujoNeto: number[] = [capitalNeto * -1];
  for (let k = 1; k <= cuotas.length; k++) {
    const linea = cuotas[k - 1];
    if (linea === undefined) break;
    const costesIncluidos: Cents = sumCents(
      vinculacionesIncluidas.map((v) => calcularCosteVinculacionMes(v, k)),
    );
    flujoNeto.push(linea.cuota + costesIncluidos);
  }

  // Bisección para encontrar la TIR mensual (R12, paso 2)
  const f = (r: number) => npv(flujoNeto, r);

  // f(0) > 0: el total de salidas es mayor que el capitalNeto (siempre, salvo tipo 0 %)
  if (f(0) <= 0) return 0;

  let lo = 0;
  let hi = 1; // 100 % mensual: físicamente imposible
  for (let i = 0; i < 64; i++) {
    if (f(hi) <= 0) break;
    hi *= 2;
  }
  if (f(hi) > 0) return 0; // no converge

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-13) break;
  }

  // R12, paso 3: anualización compuesta
  const irMensual = (lo + hi) / 2;
  return Math.pow(1 + irMensual, 12) - 1;
}
