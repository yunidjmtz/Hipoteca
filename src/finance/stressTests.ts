import {
  type Cents,
  ZERO,
  subtractCents,
  multiplyCents,
  sumCents,
  centsRoundHalfUp,
} from '@/core/money';
import type { CostesRecurrentes, EstadoViabilidad, FlujoInput } from '@/domain/types';
import { construirFlujoDeCaja } from './mortgage';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface ResultadoEstres {
  clave: string;
  nombre: string;
  nuevaCuota: Cents;
  cuotaBase: Cents;
  diferenciaMensualCuota: Cents; // nuevaCuota − cuotaBase (positivo = más cara)
  diferenciaAnualCuota: Cents;
  nuevaRatioBancario: number;
  nuevaRatioPersonal: number;
  nuevoDineroLibre: Cents;
  estado: EstadoViabilidad;
  advertencia?: string | undefined; // exactOptionalPropertyTypes: explícita
  esAplicable: boolean;
}

// ---------------------------------------------------------------------------
// Escenarios predefinidos — §6.3
// ---------------------------------------------------------------------------

const ESCENARIOS = [
  { clave: 'base', nombre: 'Con las condiciones actuales', deltaEuribor: 0, perderBonif: false },
  { clave: 'mas1', nombre: 'Si el interés sube 1 punto', deltaEuribor: 0.01, perderBonif: false },
  { clave: 'mas2', nombre: 'Si el interés sube 2 puntos', deltaEuribor: 0.02, perderBonif: false },
  { clave: 'mas3', nombre: 'Si el interés sube 3 puntos', deltaEuribor: 0.03, perderBonif: false },
  {
    clave: 'sinBonif',
    nombre: 'Si pierdes los descuentos del banco',
    deltaEuribor: 0,
    perderBonif: true,
  },
  {
    clave: 'peorCaso',
    nombre: 'Interés +3 puntos y sin descuentos',
    deltaEuribor: 0.03,
    perderBonif: true,
  },
] as const;

// ---------------------------------------------------------------------------
// Construcción del input modificado por el escenario
// ---------------------------------------------------------------------------

function aplicarEscenario(
  inputBase: FlujoInput,
  deltaEuribor: number,
  perderBonif: boolean,
): FlujoInput {
  let input = inputBase;

  if (perderBonif) {
    input = {
      ...input,
      vinculaciones: input.vinculaciones.map((v) => ({ ...v, activo: false })),
    };
  }

  if (deltaEuribor !== 0) {
    if (input.tipo === 'fija') {
      // Para fija: simula una subida equivalente del TIN (valor hipotético)
      input = { ...input, tinAnual: input.tinAnual + deltaEuribor };
    } else {
      // Variable/mixta: sube el Euríbor de cada periodo.
      // exactOptionalPropertyTypes: omitir la propiedad cuando no hay periodos.
      const periodosMod = input.euriborPorPeriodos?.map((p) => ({
        ...p,
        valor: p.valor + deltaEuribor,
      }));
      input = {
        ...input,
        euribor: (input.euribor ?? 0) + deltaEuribor,
        ...(periodosMod !== undefined ? { euriborPorPeriodos: periodosMod } : {}),
      };
    }
  }

  return input;
}

// ---------------------------------------------------------------------------
// Estado de viabilidad simplificado para stress tests
// ---------------------------------------------------------------------------

function estadoDesdeRatio(ratio: number, ratioMax: number): EstadoViabilidad {
  if (ratio > ratioMax + 0.1) return 'no_viable';
  if (ratio > ratioMax) return 'cuota_excesiva';
  if (ratio > ratioMax - 0.05) return 'ajustado';
  return 'viable';
}

// ---------------------------------------------------------------------------
// Función principal — §6.3
// ---------------------------------------------------------------------------

export interface InputPruebasEstres {
  inputBase: FlujoInput;
  ingresoMensual: Cents;
  otrasDeudas: Cents;
  costesRecurrentes: CostesRecurrentes;
  otrosGastosMensuales?: Cents;
  ratioMax: number; // ajustes.ratioBancarioMaximo
}

function cuotaRelevante(input: FlujoInput, flujo: ReturnType<typeof construirFlujoDeCaja>): Cents {
  if (input.tipo !== 'mixta') return flujo[1]?.cuota ?? ZERO;

  const mesesFijos = Math.min((input.mixtaAniosFijos ?? 0) * 12, input.plazoMeses - 1);
  return flujo[mesesFijos + 1]?.cuota ?? flujo[1]?.cuota ?? ZERO;
}

export function calcularPruebasEstres(params: InputPruebasEstres): ResultadoEstres[] {
  const {
    inputBase,
    ingresoMensual,
    otrasDeudas,
    costesRecurrentes,
    otrosGastosMensuales = ZERO,
    ratioMax,
  } = params;

  const flujoBase = construirFlujoDeCaja(inputBase);
  const cuotaBase = cuotaRelevante(inputBase, flujoBase);

  const esFija = inputBase.tipo === 'fija';

  return ESCENARIOS.map((escenario) => {
    const esAplicable = escenario.clave === 'base' || escenario.clave === 'sinBonif' || !esFija;

    const inputEstres = aplicarEscenario(inputBase, escenario.deltaEuribor, escenario.perderBonif);
    const flujoEstres = construirFlujoDeCaja(inputEstres);
    const nuevaCuota = cuotaRelevante(inputEstres, flujoEstres);

    const diferenciaMensualCuota = subtractCents(nuevaCuota, cuotaBase);
    const diferenciaAnualCuota = multiplyCents(diferenciaMensualCuota, 12);

    const nuevaRatioBancario =
      ingresoMensual > 0 ? (nuevaCuota + otrasDeudas) / ingresoMensual : Infinity;

    const costeMensualVivienda = sumCents([
      nuevaCuota,
      costesRecurrentes.comunidadMensual,
      centsRoundHalfUp(costesRecurrentes.ibiAnual / 12),
      centsRoundHalfUp(costesRecurrentes.seguroHogarAnual / 12),
      centsRoundHalfUp(costesRecurrentes.seguroVidaAnual / 12),
      costesRecurrentes.mantenimientoMensual,
      costesRecurrentes.garajeMensual,
      costesRecurrentes.suministrosMensuales,
      costesRecurrentes.otrosMensuales,
      otrosGastosMensuales,
    ]);

    const nuevaRatioPersonal =
      ingresoMensual > 0 ? (costeMensualVivienda + otrasDeudas) / ingresoMensual : Infinity;

    const nuevoDineroLibre = subtractCents(
      subtractCents(ingresoMensual, costeMensualVivienda),
      otrasDeudas,
    );

    const estado = estadoDesdeRatio(nuevaRatioBancario, ratioMax);

    const advertencia =
      esFija && escenario.deltaEuribor !== 0
        ? 'Esta hipoteca es fija; los valores se muestran a título informativo.'
        : undefined;

    return {
      clave: escenario.clave,
      nombre: escenario.nombre,
      nuevaCuota,
      cuotaBase,
      diferenciaMensualCuota,
      diferenciaAnualCuota,
      nuevaRatioBancario,
      nuevaRatioPersonal,
      nuevoDineroLibre,
      estado,
      // exactOptionalPropertyTypes: solo incluir si tiene valor
      ...(advertencia !== undefined ? { advertencia } : {}),
      esAplicable,
    };
  });
}
