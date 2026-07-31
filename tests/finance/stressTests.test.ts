import { describe, expect, it } from 'vitest';
import { calcularPruebasEstres } from '@/finance/stressTests';
import { toCents, ZERO } from '@/core/money';
import type { CostesRecurrentes, FlujoInput, ProductoVinculado } from '@/domain/types';

const COSTES_CERO: CostesRecurrentes = {
  comunidadMensual: ZERO,
  ibiAnual: ZERO,
  seguroHogarAnual: ZERO,
  seguroVidaAnual: ZERO,
  mantenimientoMensual: ZERO,
  garajeMensual: ZERO,
  suministrosMensuales: ZERO,
  otrosMensuales: ZERO,
};

const BONIFICACION: ProductoVinculado = {
  id: 'nomina',
  nombre: 'Nómina',
  activo: true,
  bonificacionTin: 0.005,
  costeInicial: ZERO,
  costeAnual: toCents(120),
  incrementoAnual: 0,
  aniosExigidos: null,
  obligatorio: true,
  observaciones: '',
};

function mixta(): FlujoInput {
  return {
    capital: toCents(150_000),
    tinAnual: 0,
    plazoMeses: 300,
    sueloTin: 0,
    fechaPrimeraCuota: '2026-01-01',
    comisionApertura: ZERO,
    vinculaciones: [BONIFICACION],
    tipo: 'mixta',
    mixtaTinFijo: 0.025,
    mixtaAniosFijos: 5,
    euribor: 0.03,
    diferencial: 0.01,
    periodicidadRevision: 'anual',
  };
}

describe('calcularPruebasEstres', () => {
  it('en una mixta compara la primera cuota variable y refleja las subidas del Euríbor', () => {
    const resultados = calcularPruebasEstres({
      inputBase: mixta(),
      ingresoMensual: toCents(4_000),
      otrasDeudas: ZERO,
      costesRecurrentes: COSTES_CERO,
      ratioMax: 0.35,
    });

    const base = resultados.find((r) => r.clave === 'base');
    const mas1 = resultados.find((r) => r.clave === 'mas1');
    const mas3 = resultados.find((r) => r.clave === 'mas3');
    const peor = resultados.find((r) => r.clave === 'peorCaso');

    expect(mas1?.diferenciaMensualCuota).toBeGreaterThan(0);
    expect(mas3?.nuevaCuota).toBeGreaterThan(mas1?.nuevaCuota ?? ZERO);
    expect(peor?.nuevaCuota).toBeGreaterThan(mas3?.nuevaCuota ?? ZERO);
    expect(base?.esAplicable).toBe(true);
  });

  it('sube todos los períodos de Euríbor de una variable y calcula ratios y dinero libre', () => {
    const input: FlujoInput = {
      ...mixta(),
      tipo: 'variable',
      euriborPorPeriodos: [
        { desdeMes: 1, valor: 0.03 },
        { desdeMes: 13, valor: 0.04 },
      ],
    };
    const resultados = calcularPruebasEstres({
      inputBase: input,
      ingresoMensual: toCents(3_000),
      otrasDeudas: toCents(250),
      costesRecurrentes: {
        ...COSTES_CERO,
        comunidadMensual: toCents(100),
        ibiAnual: toCents(600),
        seguroHogarAnual: toCents(240),
      },
      otrosGastosMensuales: toCents(50),
      ratioMax: 0.35,
    });

    expect(resultados).toHaveLength(6);
    expect(resultados.every((r) => Number.isFinite(r.nuevaRatioPersonal))).toBe(true);
    expect(resultados.find((r) => r.clave === 'mas2')?.diferenciaAnualCuota).toBeGreaterThan(0);
  });

  it('marca las subidas como no aplicables a una fija y maneja ingresos cero', () => {
    const input: FlujoInput = {
      ...mixta(),
      tipo: 'fija',
      tinAnual: 0.03,
    };
    const resultados = calcularPruebasEstres({
      inputBase: input,
      ingresoMensual: ZERO,
      otrasDeudas: ZERO,
      costesRecurrentes: COSTES_CERO,
      ratioMax: 0.35,
    });

    const mas1 = resultados.find((r) => r.clave === 'mas1');
    expect(mas1?.esAplicable).toBe(false);
    expect(mas1?.advertencia).toMatch(/fija/i);
    expect(mas1?.nuevaRatioBancario).toBe(Infinity);
    expect(mas1?.estado).toBe('no_viable');
  });
});
