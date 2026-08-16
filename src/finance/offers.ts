/**
 * Comparador y puntuación de ofertas bancarias — §6.4.
 *
 * Métricas calculadas por oferta:
 *   taeEstimada, cuotaInicial, cuotaPostFija, costeRealTotal,
 *   desembolsoInicial, numVinculacionesObligatorias, indiceFlexibilidad.
 *
 * Puntuación: media ponderada de dimensiones normalizadas 0-100.
 * Por defecto: coste real 35 %, cuota 15 %, desembolso 15 %, resistencia a
 *              subidas 15 %, flexibilidad 10 %, vinculaciones 10 %.
 */
import {
  type Cents,
  ZERO,
  addCents,
  maxCents,
  subtractCents,
  sumCents,
  toCents,
} from '@/core/money';
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
  resiliencia: number;
  flexibilidad: number;
  vinculaciones: number;
}

export const PESOS_POR_DEFECTO: PesosComparacion = {
  costeReal: 0.35,
  cuota: 0.15,
  desembolsoInicial: 0.15,
  resiliencia: 0.15,
  flexibilidad: 0.1,
  vinculaciones: 0.1,
};

export interface ContextoComparacionHipotecas {
  ingresoMensual: Cents;
  otrasDeudasMensuales: Cents;
  ratioBancarioMaximo: number;
  ahorrosDisponibles?: Cents;
  gastosCompraNoFinanciados?: Cents;
}

export interface MetricasOferta {
  ofertaId: string;
  taeEstimada: number;
  cuotaInicial: Cents;
  /** Cuota estimada de la fase variable (solo para mixta) o null. */
  cuotaPostFija: Cents | null;
  /** Aportación al precio + cuotas + vinculaciones y comisiones de la hipoteca. */
  costeRealTotal: Cents;
  /** Aportación al precio + comisión de apertura + costes iniciales activos. */
  desembolsoInicial: Cents;
  numVinculacionesObligatorias: number;
  /** 0-100: 100 = sin comisiones de amortización. */
  indiceFlexibilidad: number;
  /** Cuota relevante si el índice sube 2 puntos y se pierden bonificaciones. */
  cuotaTensionada: Cents;
  /** 0-100: penaliza el incremento de cuota en el escenario adverso. */
  indiceResiliencia: number;
  ratioBancarioActual: number | null;
  ratioBancarioTensionado: number | null;
  /** Desembolso de la oferta más gastos e impuestos no financiados de la compra. */
  efectivoTotalNecesario: Cents | null;
  ahorroSuficiente: boolean | null;
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
  /** Excluye ofertas rechazadas o que superan el límite de esfuerzo tensionado. */
  esAptaParaRecomendacion: boolean;
  esMejorGlobal: boolean;
}

// ---------------------------------------------------------------------------
// Cálculo de métricas
// ---------------------------------------------------------------------------

function cuotaRelevante(
  input: ReturnType<typeof flujoInputDesdeEscenario>,
  flujo: ReturnType<typeof construirFlujoDeCaja>,
): Cents {
  if (input.tipo !== 'mixta') return flujo[1]?.cuota ?? ZERO;
  const mesesFijos = Math.min((input.mixtaAniosFijos ?? 0) * 12, input.plazoMeses - 1);
  return flujo[mesesFijos + 1]?.cuota ?? flujo[1]?.cuota ?? ZERO;
}

function inputTensionado(input: ReturnType<typeof flujoInputDesdeEscenario>) {
  const vinculaciones = input.vinculaciones.map((vinculacion) => ({
    ...vinculacion,
    activo: false,
  }));
  if (input.tipo === 'fija') return { ...input, vinculaciones };

  const euriborPorPeriodos = input.euriborPorPeriodos?.map((periodo) => ({
    ...periodo,
    valor: periodo.valor + 0.02,
  }));
  return {
    ...input,
    vinculaciones,
    euribor: (input.euribor ?? 0) + 0.02,
    ...(euriborPorPeriodos !== undefined ? { euriborPorPeriodos } : {}),
  };
}

export function calcularMetricasOferta(
  oferta: OfertaBancaria,
  contexto?: ContextoComparacionHipotecas,
): MetricasOferta {
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
  const costesInicialesVinc = sumCents(
    esc.vinculaciones.filter((v) => v.activo).map((v) => v.costeInicial),
  );
  const aportacionCompra = maxCents(ZERO, subtractCents(esc.precioCompra, esc.importeSolicitado));
  const costeRealTotal = addCents(
    aportacionCompra,
    addCents(addCents(addCents(sumaCuotas, sumaCostesVinc), comisionApertura), costesInicialesVinc),
  );

  const desembolsoInicial = addCents(
    aportacionCompra,
    addCents(comisionApertura, costesInicialesVinc),
  );
  const numVinculacionesObligatorias = esc.vinculaciones.filter(
    (v) => v.obligatorio && v.activo,
  ).length;

  // Flexibilidad: comisiones de amortización bajas = más flexible
  const comParcial = Math.min(esc.comisiones.amortizacionParcial, 0.05) / 0.05;
  const comTotal = Math.min(esc.comisiones.amortizacionTotal, 0.05) / 0.05;
  const indiceFlexibilidad = 100 - (comParcial + comTotal) * 50;
  const cuotaBaseRelevante = cuotaRelevante(input, lineas);
  const inputAdverso = inputTensionado(input);
  const cuotaTensionada = cuotaRelevante(inputAdverso, construirFlujoDeCaja(inputAdverso));
  const incrementoCuota =
    cuotaBaseRelevante > ZERO
      ? Math.max(0, (cuotaTensionada - cuotaBaseRelevante) / cuotaBaseRelevante)
      : 0;
  const indiceResiliencia = Math.max(0, 100 - incrementoCuota * 200);
  const cuotaActualParaRatio = maxCents(cuotaInicial, cuotaPostFija ?? cuotaInicial);
  const ratioBancarioActual =
    contexto !== undefined && contexto.ingresoMensual > ZERO
      ? (cuotaActualParaRatio + contexto.otrasDeudasMensuales) / contexto.ingresoMensual
      : null;
  const ratioBancarioTensionado =
    contexto !== undefined && contexto.ingresoMensual > ZERO
      ? (cuotaTensionada + contexto.otrasDeudasMensuales) / contexto.ingresoMensual
      : null;
  const efectivoTotalNecesario =
    contexto?.gastosCompraNoFinanciados !== undefined
      ? addCents(desembolsoInicial, contexto.gastosCompraNoFinanciados)
      : null;
  const ahorroSuficiente =
    efectivoTotalNecesario !== null && contexto?.ahorrosDisponibles !== undefined
      ? contexto.ahorrosDisponibles >= efectivoTotalNecesario
      : null;

  return {
    ofertaId: oferta.id,
    taeEstimada,
    cuotaInicial,
    cuotaPostFija,
    costeRealTotal,
    desembolsoInicial,
    numVinculacionesObligatorias,
    indiceFlexibilidad,
    cuotaTensionada,
    indiceResiliencia,
    ratioBancarioActual,
    ratioBancarioTensionado,
    efectivoTotalNecesario,
    ahorroSuficiente,
  };
}

/**
 * Solo etiqueta una oferta como “mejor” cuando todas financian la misma compra.
 * El importe y el plazo sí pueden variar: forman parte de la decisión.
 */
export function sonOfertasComparables(ofertas: readonly OfertaBancaria[]): boolean {
  const precioBase = ofertas[0]?.escenario.precioCompra;
  return (
    precioBase === undefined ||
    ofertas.every((oferta) => oferta.escenario.precioCompra === precioBase)
  );
}

// ---------------------------------------------------------------------------
// Comparación
// ---------------------------------------------------------------------------

function puntuarRespectoAlMejor(valor: number, mejor: number, referenciaMinima: number): number {
  if (valor === mejor) return 100;
  if (valor <= 0) return 100;
  const referencia = Math.max(mejor, referenciaMinima);
  return Math.max(0, Math.min(100, 100 / (1 + (valor - mejor) / referencia)));
}

function mediaPonderada(
  puntuaciones: Record<keyof PesosComparacion, number>,
  pesos: PesosComparacion,
): number {
  const claves = Object.keys(pesos) as (keyof PesosComparacion)[];
  const sumaPesos = claves.reduce((total, clave) => total + Math.max(0, pesos[clave]), 0);
  const pesosAplicados = sumaPesos > 0 ? pesos : PESOS_POR_DEFECTO;
  const denominador = sumaPesos > 0 ? sumaPesos : 1;
  return (
    claves.reduce(
      (total, clave) => total + puntuaciones[clave] * Math.max(0, pesosAplicados[clave]),
      0,
    ) / denominador
  );
}

/**
 * Compara las ofertas y devuelve los resultados ordenados de mejor a peor
 * según la puntuación ponderada. Con una sola oferta recibe puntuación 100.
 */
export function compararOfertas(
  ofertas: readonly OfertaBancaria[],
  pesos: PesosComparacion = PESOS_POR_DEFECTO,
  contexto?: ContextoComparacionHipotecas,
): ResultadoComparacion[] {
  if (ofertas.length === 0) return [];

  const todos = ofertas.map((o) => ({
    oferta: o,
    metricas: calcularMetricasOferta(o, contexto),
  }));

  const minCuota = Math.min(...todos.map((m) => m.metricas.cuotaInicial));
  const minCoste = Math.min(...todos.map((m) => m.metricas.costeRealTotal));
  const minDesemb = Math.min(...todos.map((m) => m.metricas.desembolsoInicial));

  const resultados: ResultadoComparacion[] = todos.map(({ oferta, metricas }) => {
    const puntuaciones: Record<keyof PesosComparacion, number> = {
      costeReal: puntuarRespectoAlMejor(metricas.costeRealTotal, minCoste, toCents(10_000)),
      cuota: puntuarRespectoAlMejor(metricas.cuotaInicial, minCuota, toCents(100)),
      desembolsoInicial: puntuarRespectoAlMejor(
        metricas.desembolsoInicial,
        minDesemb,
        toCents(5_000),
      ),
      resiliencia: metricas.indiceResiliencia,
      flexibilidad: metricas.indiceFlexibilidad,
      vinculaciones: Math.max(0, 100 - metricas.numVinculacionesObligatorias * 20),
    };
    const ratioTensionado = metricas.ratioBancarioTensionado;
    const esAptaParaRecomendacion =
      oferta.estado !== 'rechazada' &&
      metricas.ahorroSuficiente !== false &&
      (ratioTensionado === null ||
        contexto === undefined ||
        ratioTensionado <= contexto.ratioBancarioMaximo);

    return {
      oferta,
      metricas,
      puntuacion: mediaPonderada(puntuaciones, pesos),
      desglosePuntuacion: puntuaciones,
      esLaMenorCuota: false,
      esLaMenorTaeOficial: false,
      esLaMenorTaeEstimada: false,
      esLaMenorCosteReal: false,
      esMenorDesembolso: false,
      esMenosVinculaciones: false,
      esAptaParaRecomendacion,
      esMejorGlobal: false,
    };
  });

  // Marcar los mejores de cada dimensión
  const candidatas = sonOfertasComparables(ofertas)
    ? resultados.filter((resultado) => resultado.esAptaParaRecomendacion)
    : [];
  const mejorPunt =
    candidatas.length > 0 ? Math.max(...candidatas.map((resultado) => resultado.puntuacion)) : null;
  const menorCuota = Math.min(...resultados.map((r) => r.metricas.cuotaInicial));
  const menorCoste = Math.min(...resultados.map((r) => r.metricas.costeRealTotal));
  const menorDesemb = Math.min(...resultados.map((r) => r.metricas.desembolsoInicial));
  const menosVinc = Math.min(...resultados.map((r) => r.metricas.numVinculacionesObligatorias));
  const menorTaeEstimada = Math.min(...resultados.map((r) => r.metricas.taeEstimada));
  const ofertasConTae = resultados.filter((r) => r.oferta.taeOficial !== undefined);
  const menorTaeOficial =
    ofertasConTae.length > 0
      ? Math.min(...ofertasConTae.map((r) => r.oferta.taeOficial as number))
      : Infinity;

  for (const r of resultados) {
    r.esLaMenorCuota = r.metricas.cuotaInicial === menorCuota;
    r.esLaMenorCosteReal = r.metricas.costeRealTotal === menorCoste;
    r.esMenorDesembolso = r.metricas.desembolsoInicial === menorDesemb;
    r.esMenosVinculaciones = r.metricas.numVinculacionesObligatorias === menosVinc;
    r.esLaMenorTaeEstimada = r.metricas.taeEstimada === menorTaeEstimada;
    r.esLaMenorTaeOficial =
      r.oferta.taeOficial !== undefined && r.oferta.taeOficial === menorTaeOficial;
    r.esMejorGlobal =
      r.esAptaParaRecomendacion && mejorPunt !== null && Math.abs(r.puntuacion - mejorPunt) < 0.01;
  }

  return resultados.sort(
    (a, b) =>
      Number(b.esAptaParaRecomendacion) - Number(a.esAptaParaRecomendacion) ||
      b.puntuacion - a.puntuacion,
  );
}
