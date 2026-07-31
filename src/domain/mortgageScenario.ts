import type { EscenarioHipoteca } from './types';

export const TIN_FIJO_MIXTO_POR_DEFECTO = 0.025;
export const ANIOS_FIJOS_MIXTO_POR_DEFECTO = 5;

function enteroAcotado(valor: number, minimo: number, maximo: number, fallback: number): number {
  const entero = Number.isFinite(valor) ? Math.trunc(valor) : fallback;
  return Math.min(maximo, Math.max(minimo, entero));
}

function normalizarPeriodosEuribor(
  periodos: EscenarioHipoteca['euriborPorPeriodos'],
): EscenarioHipoteca['euriborPorPeriodos'] {
  if (periodos === undefined) return undefined;

  // Un único valor por mes. Si una importación repite el mes, prevalece
  // el último valor declarado, y el resultado siempre queda ordenado.
  const porMes = new Map<number, number>();
  for (const periodo of periodos) {
    if (!Number.isFinite(periodo.desdeMes) || !Number.isFinite(periodo.valor)) continue;
    porMes.set(Math.max(1, Math.trunc(periodo.desdeMes)), periodo.valor);
  }

  return [...porMes.entries()]
    .sort(([mesA], [mesB]) => mesA - mesB)
    .map(([desdeMes, valor]) => ({ desdeMes, valor }));
}

/**
 * Garantiza que cualquier escenario —incluidos los importados de versiones
 * anteriores— tenga una combinación de tipo, plazo y tramos calculable.
 */
export function normalizarEscenarioHipoteca(escenario: EscenarioHipoteca): EscenarioHipoteca {
  let plazoAnios = enteroAcotado(escenario.plazoAnios, 1, 40, 25);
  if (escenario.tipo === 'mixta' && plazoAnios < 2) plazoAnios = 2;

  const euriborPorPeriodos = normalizarPeriodosEuribor(escenario.euriborPorPeriodos);
  const base: EscenarioHipoteca = {
    ...escenario,
    plazoAnios,
    ...(euriborPorPeriodos !== undefined ? { euriborPorPeriodos } : {}),
  };

  if (escenario.tipo === 'mixta') {
    const maximoAniosFijos = plazoAnios - 1;
    const aniosFijosPorDefecto = Math.min(ANIOS_FIJOS_MIXTO_POR_DEFECTO, maximoAniosFijos);
    return {
      ...base,
      mixtaTinFijo: escenario.mixtaTinFijo ?? TIN_FIJO_MIXTO_POR_DEFECTO,
      mixtaAniosFijos: enteroAcotado(
        escenario.mixtaAniosFijos ?? aniosFijosPorDefecto,
        1,
        maximoAniosFijos,
        aniosFijosPorDefecto,
      ),
      periodicidadRevision: escenario.periodicidadRevision ?? 'anual',
    };
  }

  if (escenario.tipo === 'variable') {
    return {
      ...base,
      periodicidadRevision: escenario.periodicidadRevision ?? 'anual',
    };
  }

  return base;
}
