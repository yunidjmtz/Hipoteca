import { multiplyCents } from '@/core/money';
import type { EscenarioHipoteca, FlujoInput } from '@/domain/types';
import { normalizarEscenarioHipoteca } from '@/domain/mortgageScenario';

/**
 * Convierte el escenario que ve la persona usuaria en la entrada común del
 * motor. Centralizar esta conversión evita que Simulador, Ofertas y
 * Amortización calculen la misma hipoteca con supuestos distintos.
 */
export function flujoInputDesdeEscenario(
  escenario: EscenarioHipoteca,
  plazoAnios = escenario.plazoAnios,
): FlujoInput {
  const normalizado = normalizarEscenarioHipoteca({ ...escenario, plazoAnios });
  return {
    capital: normalizado.importeSolicitado,
    tinAnual: normalizado.tinFijo ?? 0,
    plazoMeses: normalizado.plazoAnios * 12,
    sueloTin: normalizado.sueloTin,
    fechaPrimeraCuota: normalizado.fechaPrimeraCuota,
    comisionApertura: multiplyCents(normalizado.importeSolicitado, normalizado.comisiones.apertura),
    vinculaciones: normalizado.vinculaciones,
    tipo: normalizado.tipo,
    ...(normalizado.euribor !== undefined ? { euribor: normalizado.euribor } : {}),
    ...(normalizado.diferencial !== undefined ? { diferencial: normalizado.diferencial } : {}),
    ...(normalizado.periodicidadRevision !== undefined
      ? { periodicidadRevision: normalizado.periodicidadRevision }
      : {}),
    ...(normalizado.euriborPorPeriodos !== undefined
      ? { euriborPorPeriodos: normalizado.euriborPorPeriodos }
      : {}),
    ...(normalizado.mixtaTinFijo !== undefined ? { mixtaTinFijo: normalizado.mixtaTinFijo } : {}),
    ...(normalizado.mixtaAniosFijos !== undefined
      ? { mixtaAniosFijos: normalizado.mixtaAniosFijos }
      : {}),
  };
}
