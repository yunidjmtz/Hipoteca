import { describe, expect, it } from 'vitest';
import {
  ANIOS_FIJOS_MIXTO_POR_DEFECTO,
  TIN_FIJO_MIXTO_POR_DEFECTO,
  normalizarEscenarioHipoteca,
} from '@/domain/mortgageScenario';
import { ESTADO_INICIAL } from '@/storage/defaults';
import { flujoInputDesdeEscenario } from '@/finance/scenario';
import type { EscenarioHipoteca } from '@/domain/types';

function escenarioMixtoSinTramos(incluirPeriodicidad = true): EscenarioHipoteca {
  const base = ESTADO_INICIAL.escenarioSimulador;
  return {
    id: base.id,
    titulo: base.titulo,
    precioCompra: base.precioCompra,
    valorTasacion: base.valorTasacion,
    ltv: base.ltv,
    importeSolicitado: base.importeSolicitado,
    plazoAnios: base.plazoAnios,
    tipo: 'mixta',
    tinFijo: 0.035,
    euribor: 0.035,
    diferencial: 0.01,
    ...(incluirPeriodicidad ? { periodicidadRevision: 'anual' as const } : {}),
    sueloTin: base.sueloTin,
    comisiones: base.comisiones,
    vinculaciones: base.vinculaciones,
    fechaPrimeraCuota: base.fechaPrimeraCuota,
  };
}

describe('normalizarEscenarioHipoteca', () => {
  it('inicializa una mixta antigua sin tramos con los valores visibles por defecto', () => {
    const normalizado = normalizarEscenarioHipoteca(escenarioMixtoSinTramos());

    expect(normalizado.mixtaTinFijo).toBe(TIN_FIJO_MIXTO_POR_DEFECTO);
    expect(normalizado.mixtaAniosFijos).toBe(ANIOS_FIJOS_MIXTO_POR_DEFECTO);
    expect(flujoInputDesdeEscenario(normalizado).mixtaAniosFijos).toBe(
      ANIOS_FIJOS_MIXTO_POR_DEFECTO,
    );
  });

  it('garantiza al menos un año fijo y un año variable', () => {
    const normalizado = normalizarEscenarioHipoteca({
      ...escenarioMixtoSinTramos(),
      plazoAnios: 1,
      mixtaAniosFijos: 30,
    });

    expect(normalizado.plazoAnios).toBe(2);
    expect(normalizado.mixtaAniosFijos).toBe(1);
  });

  it('limita el tramo fijo a un año menos que el plazo total', () => {
    const normalizado = normalizarEscenarioHipoteca({
      ...escenarioMixtoSinTramos(),
      plazoAnios: 20,
      mixtaAniosFijos: 30,
    });

    expect(normalizado.mixtaAniosFijos).toBe(19);
  });

  it('ordena los períodos de Euríbor y conserva el último valor de un mes repetido', () => {
    const normalizado = normalizarEscenarioHipoteca({
      ...escenarioMixtoSinTramos(),
      euriborPorPeriodos: [
        { desdeMes: 13, valor: 0.04 },
        { desdeMes: 1, valor: 0.03 },
        { desdeMes: 13, valor: 0.045 },
      ],
    });

    expect(normalizado.euriborPorPeriodos).toEqual([
      { desdeMes: 1, valor: 0.03 },
      { desdeMes: 13, valor: 0.045 },
    ]);
  });

  it('aplica revisión anual por defecto a una variable importada sin periodicidad', () => {
    const normalizado = normalizarEscenarioHipoteca({
      ...escenarioMixtoSinTramos(false),
      tipo: 'variable',
    });

    expect(normalizado.periodicidadRevision).toBe('anual');
  });
});
