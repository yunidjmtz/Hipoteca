/**
 * Comparador y puntuación de ofertas bancarias — §6.4.
 *
 * Métricas calculadas por oferta:
 *   taeEstimada, cuotaInicial, cuotaPostFija, costeRealTotal,
 *   desembolsoInicial, numVinculacionesObligatorias, indiceFlexibilidad.
 *
 * Puntuación: suma ponderada de dimensiones normalizadas 0-100.
 * Por defecto: coste real 40 %, cuota 20 %, desembolso 15 %,
 *              flexibilidad 15 %, vinculaciones 10 %.
 */
import { type Cents, ZERO, addCents, sumCents } from '@/core/money';
import type { OfertaBancaria } from '@/domain/types';
import { construirFlujoDeCaja } from './mortgage';
import { calcularTaeEstimada } from './apr';
import { flujoInputDesdeEscenario } from './scenario';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface PesosComparacion {
  costeReal: number;
  cuota: number;
  desembolsoInicial: number;
  flexibilidad: number;
  vinculaciones: number;
}

export const PESOS_POR_DEFECTO: PesosComparacion = {
  costeReal: 0.4,
  cuota: 0.2,
  desembolsoInicial: 0.15,
  flexibilidad: 0.15,
  vinculaciones: 0.1,
};

export interface MetricasOferta {
  ofertaId: string;
  taeEstimada: number;
  cuotaInicial: Cents;
  /** Cuota estimada de la fase variable (solo para mixta) o null. */
  cuotaPostFija: Cents | null;
  /** Σ cuotas + Σ costes vinculados + comisión apertura + costes iniciales vinculaciones. */
  costeRealTotal: Cents;
  /** Comisión apertura + costes iniciales de vinculaciones. */
  desembolsoInicial: Cents;
  numVinculacionesObligatorias: number;
  /** 0-100: 100 = sin comisiones de amortización. */
  indiceFlexibilidad: number;
}

export interface ResultadoComparacion {
  oferta: OfertaBancaria;
  metricas: MetricasOferta;
  /** Puntuación ponderada 0-100. */
  puntuacion: number;
  desglosePuntuacion: Record<keyof PesosComparacion, number>;
  esLaMenorCuota: boolean;
  esLaMenorTaeOficial: boolean;
  esLaMenorTaeEstimada: boolean;
  esLaMenorCosteReal: boolean;
  esMenorDesembolso: boolean;
  esMenosVinculaciones: boolean;
  esMejorGlobal: boolean;
}

// ---------------------------------------------------------------------------
// Cálculo de métricas
// ---------------------------------------------------------------------------

export function calcularMetricasOferta(oferta: OfertaBancaria): MetricasOferta {
  const esc = oferta.escenario;
  const input = flujoInputDesdeEscenario(esc);
  const lineas = construirFlujoDeCaja(input);
  const lineasCuotas = lineas.slice(1);

  const taeEstimada = calcularTaeEstimada(lineas, esc.importeSolicitado, esc.vinculaciones);
  const cuotaInicial = lineasCuotas[0]?.cuota ?? ZERO;

  // Cuota de la fase variable (solo para mixta)
  let cuotaPostFija: Cents | null = null;
  if (esc.tipo === 'mixta' && esc.mixtaAniosFijos !== undefined) {
    const mesesFijosTotal = esc.mixtaAniosFijos * 12;
    cuotaPostFija = lineasCuotas[mesesFijosTotal]?.cuota ?? null;
  }

  const sumaCuotas = sumCents(lineasCuotas.map((l) => l.cuota));
  const sumaCostesVinc = sumCents(lineasCuotas.map((l) => l.costesVinculados));
  const comisionApertura = lineas[0]?.comisiones ?? ZERO;
  const costesInicialesVinc = sumCents(esc.vinculaciones.map((v) => v.costeInicial));
  const costeRealTotal = addCents(
    addCents(addCents(sumaCuotas, sumaCostesVinc), comisionApertura),
    costesInicialesVinc,
  );

  const desembolsoInicial = addCents(comisionApertura, costesInicialesVinc);
  const numVinculacionesObligatorias = esc.vinculaciones.filter(
    (v) => v.obligatorio && v.activo,
  ).length;

  // Flexibilidad: comisiones de amortización bajas = más flexible
  const comParcial = Math.min(esc.comisiones.amortizacionParcial, 0.05) / 0.05;
  const comTotal = Math.min(esc.comisiones.amortizacionTotal, 0.05) / 0.05;
  const indiceFlexibilidad = 100 - (comParcial + comTotal) * 50;

  return {
    ofertaId: oferta.id,
    taeEstimada,
    cuotaInicial,
    cuotaPostFija,
    costeRealTotal,
    desembolsoInicial,
    numVinculacionesObligatorias,
    indiceFlexibilidad,
  };
}

// ---------------------------------------------------------------------------
// Comparación
// ---------------------------------------------------------------------------

function normalizar(val: number, min: number, max: number, lowerIsBetter: boolean): number {
  if (max === min) return 100;
  return lowerIsBetter ? ((max - val) / (max - min)) * 100 : ((val - min) / (max - min)) * 100;
}

/**
 * Compara las ofertas y devuelve los resultados ordenados de mejor a peor
 * según la puntuación ponderada. Con una sola oferta recibe puntuación 100.
 */
export function compararOfertas(
  ofertas: readonly OfertaBancaria[],
  pesos: PesosComparacion = PESOS_POR_DEFECTO,
): ResultadoComparacion[] {
  if (ofertas.length === 0) return [];

  const todos = ofertas.map((o) => ({ oferta: o, metricas: calcularMetricasOferta(o) }));

  const minCuota = Math.min(...todos.map((m) => m.metricas.cuotaInicial));
  const maxCuota = Math.max(...todos.map((m) => m.metricas.cuotaInicial));
  const minCoste = Math.min(...todos.map((m) => m.metricas.costeRealTotal));
  const maxCoste = Math.max(...todos.map((m) => m.metricas.costeRealTotal));
  const minDesemb = Math.min(...todos.map((m) => m.metricas.desembolsoInicial));
  const maxDesemb = Math.max(...todos.map((m) => m.metricas.desembolsoInicial));
  const minFlex = Math.min(...todos.map((m) => m.metricas.indiceFlexibilidad));
  const maxFlex = Math.max(...todos.map((m) => m.metricas.indiceFlexibilidad));
  const minVinc = Math.min(...todos.map((m) => m.metricas.numVinculacionesObligatorias));
  const maxVinc = Math.max(...todos.map((m) => m.metricas.numVinculacionesObligatorias));

  const resultados: ResultadoComparacion[] = todos.map(({ oferta, metricas }) => {
    const scoreCuota = normalizar(metricas.cuotaInicial, minCuota, maxCuota, true);
    const scoreCoste = normalizar(metricas.costeRealTotal, minCoste, maxCoste, true);
    const scoreDesemb = normalizar(metricas.desembolsoInicial, minDesemb, maxDesemb, true);
    const scoreFlex = normalizar(metricas.indiceFlexibilidad, minFlex, maxFlex, false);
    const scoreVinc = normalizar(metricas.numVinculacionesObligatorias, minVinc, maxVinc, true);

    const puntuacion =
      scoreCoste * pesos.costeReal +
      scoreCuota * pesos.cuota +
      scoreDesemb * pesos.desembolsoInicial +
      scoreFlex * pesos.flexibilidad +
      scoreVinc * pesos.vinculaciones;

    return {
      oferta,
      metricas,
      puntuacion,
      desglosePuntuacion: {
        costeReal: scoreCoste,
        cuota: scoreCuota,
        desembolsoInicial: scoreDesemb,
        flexibilidad: scoreFlex,
        vinculaciones: scoreVinc,
      },
      esLaMenorCuota: false,
      esLaMenorTaeOficial: false,
      esLaMenorTaeEstimada: false,
      esLaMenorCosteReal: false,
      esMenorDesembolso: false,
      esMenosVinculaciones: false,
      esMejorGlobal: false,
    };
  });

  // Marcar los mejores de cada dimensión
  const mejorPunt = Math.max(...resultados.map((r) => r.puntuacion));
  const menorCuota = Math.min(...resultados.map((r) => r.metricas.cuotaInicial));
  const menorCoste = Math.min(...resultados.map((r) => r.metricas.costeRealTotal));
  const menorDesemb = Math.min(...resultados.map((r) => r.metricas.desembolsoInicial));
  const menosVinc = Math.min(...resultados.map((r) => r.metricas.numVinculacionesObligatorias));
  const menorTaeEstimada = Math.min(...resultados.map((r) => r.metricas.taeEstimada));
  const ofertasConTae = resultados.filter((r) => r.oferta.taeOficial !== undefined);
  const menorTaeOficial =
    ofertasConTae.length > 0
      ? Math.min(...ofertasConTae.map((r) => r.oferta.taeOficial ?? Infinity))
      : Infinity;

  for (const r of resultados) {
    r.esLaMenorCuota = r.metricas.cuotaInicial === menorCuota;
    r.esLaMenorCosteReal = r.metricas.costeRealTotal === menorCoste;
    r.esMenorDesembolso = r.metricas.desembolsoInicial === menorDesemb;
    r.esMenosVinculaciones = r.metricas.numVinculacionesObligatorias === menosVinc;
    r.esLaMenorTaeEstimada = r.metricas.taeEstimada === menorTaeEstimada;
    r.esLaMenorTaeOficial =
      r.oferta.taeOficial !== undefined && r.oferta.taeOficial === menorTaeOficial;
    r.esMejorGlobal = Math.abs(r.puntuacion - mejorPunt) < 0.01;
  }

  return resultados.sort((a, b) => b.puntuacion - a.puntuacion);
}
