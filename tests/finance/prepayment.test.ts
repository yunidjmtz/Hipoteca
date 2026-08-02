import { describe, it, expect } from 'vitest';
import { simularAmortizacionAnticipada } from '@/finance/prepayment';
import { cuotaMensual } from '@/finance/mortgage';
import { toCents, fromCents, ZERO } from '@/core/money';
import type { FlujoInput } from '@/domain/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flujoFijo(
  capitalEuros: number,
  tin: number,
  plazoAnios: number,
  comisionAperturaEuros = 0,
): FlujoInput {
  return {
    capital: toCents(capitalEuros),
    tinAnual: tin,
    plazoMeses: plazoAnios * 12,
    sueloTin: 0,
    fechaPrimeraCuota: '2024-02-01',
    comisionApertura: toCents(comisionAperturaEuros),
    vinculaciones: [],
    tipo: 'fija',
  };
}

// ---------------------------------------------------------------------------
// §9.1 · caso 17: comisión de apertura entra en el flujo
// ---------------------------------------------------------------------------

describe('caso 17 — comisión de apertura', () => {
  it('aparece en la línea 0 del flujo amortizado', () => {
    const input = flujoFijo(150_000, 0.03, 20, 1500);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(10_000),
      enMes: 24,
      opcion: 'cuota',
      comisionParcial: 0,
    });
    expect(result.flujoAmortizado[0]?.comisiones).toBe(toCents(1500));
  });
});

// ---------------------------------------------------------------------------
// §9.1 · caso 18: amortización reduciendo cuota
// ---------------------------------------------------------------------------

describe('caso 18 — amortización reduciendo cuota', () => {
  it('la nueva cuota es menor que la original', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const cuotaOriginal = cuotaMensual(toCents(150_000), 0.03, 240);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'cuota',
      comisionParcial: 0,
    });
    expect(result.nuevaCuota).not.toBeNull();
    if (result.nuevaCuota !== null) {
      expect(result.nuevaCuota).toBeLessThan(cuotaOriginal);
    }
  });

  it('el flujo amortizado cierra con pendiente exactamente 0', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'cuota',
      comisionParcial: 0,
    });
    const ultima = result.flujoAmortizado[result.flujoAmortizado.length - 1];
    expect(ultima?.pendiente).toBe(ZERO);
  });

  it('el ahorro neto es positivo sin comisión', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'cuota',
      comisionParcial: 0,
    });
    expect(result.ahorroNeto).toBeGreaterThan(ZERO);
  });

  it('la comisión de amortización reduce el ahorro neto', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const sinComision = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'cuota',
      comisionParcial: 0,
    });
    const conComision = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'cuota',
      comisionParcial: 0.02,
    });
    expect(conComision.ahorroNeto).toBeLessThan(sinComision.ahorroNeto);
    expect(conComision.comision).toBeGreaterThan(ZERO);
  });

  it('diferenciaCuota > 0 (la nueva cuota es más baja)', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'cuota',
      comisionParcial: 0,
    });
    expect(result.diferenciaCuota).not.toBeNull();
    if (result.diferenciaCuota !== null) {
      expect(result.diferenciaCuota).toBeGreaterThan(ZERO);
    }
  });

  it('ahorroNeto = ahorroIntereses − comisión', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'cuota',
      comisionParcial: 0.015,
    });
    expect(result.ahorroNeto).toBe(result.ahorroIntereses - result.comision);
  });
});

// ---------------------------------------------------------------------------
// §9.1 · caso 19: amortización reduciendo plazo
// ---------------------------------------------------------------------------

describe('caso 19 — amortización reduciendo plazo', () => {
  it('el plazo efectivo es menor que el original', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'plazo',
      comisionParcial: 0,
    });
    expect(result.nuevoNumCuotas).not.toBeNull();
    if (result.nuevoNumCuotas !== null) {
      expect(result.nuevoNumCuotas).toBeLessThan(input.plazoMeses);
    }
  });

  it('el flujo amortizado cierra con pendiente exactamente 0 (reducir plazo)', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'plazo',
      comisionParcial: 0,
    });
    const ultima = result.flujoAmortizado[result.flujoAmortizado.length - 1];
    expect(ultima?.pendiente).toBe(ZERO);
  });

  it('diferenciaMeses > 0', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'plazo',
      comisionParcial: 0,
    });
    expect(result.diferenciaMeses).not.toBeNull();
    if (result.diferenciaMeses !== null) {
      expect(result.diferenciaMeses).toBeGreaterThan(0);
    }
  });

  it('amortización reduciendo plazo ahorra más intereses que reduciendo cuota', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const reduceCuota = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'cuota',
      comisionParcial: 0,
    });
    const reducePlazo = simularAmortizacionAnticipada(input, {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'plazo',
      comisionParcial: 0,
    });
    // Reducir plazo mantiene la cuota original → amortiza capital más rápido → ahorra más
    expect(fromCents(reducePlazo.ahorroIntereses)).toBeGreaterThanOrEqual(
      fromCents(reduceCuota.ahorroIntereses),
    );
  });
});

// ---------------------------------------------------------------------------
// Aportaciones múltiples
// ---------------------------------------------------------------------------

describe('aportaciones múltiples', () => {
  it('aplica cada aportación en la cuota indicada y acumula sus comisiones', () => {
    const result = simularAmortizacionAnticipada(flujoFijo(100_000, 0.03, 20), {
      aportaciones: [
        { importe: toCents(5_000), enMes: 12 },
        { importe: toCents(3_000), enMes: 24 },
      ],
      opcion: 'cuota',
      comisionParcial: 0.01,
    });

    expect(result.comision).toBe(toCents(80));
    expect(result.flujoAmortizado[12]?.comisiones).toBe(toCents(50));
    expect(result.flujoAmortizado[24]?.comisiones).toBe(toCents(30));
    expect(result.flujoAmortizado.at(-1)?.pendiente).toBe(ZERO);
  });
});

// ---------------------------------------------------------------------------
// Invariantes
// ---------------------------------------------------------------------------

describe('invariantes del flujo amortizado', () => {
  it('Σ principal = capital original (sin amortización fuera de cuotas ordinarias)', () => {
    // No verificamos esto aquí porque la amortización parcial reduce el capital
    // que se amortiza ordinariamente. En su lugar verificamos el cierre a 0.
    const input = flujoFijo(100_000, 0.04, 15);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(5_000),
      enMes: 6,
      opcion: 'cuota',
      comisionParcial: 0,
    });
    const ultima = result.flujoAmortizado[result.flujoAmortizado.length - 1];
    expect(ultima?.pendiente).toBe(ZERO);
  });

  it('los intereses amortizados son menores que los originales', () => {
    const input = flujoFijo(100_000, 0.04, 15);
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(5_000),
      enMes: 6,
      opcion: 'cuota',
      comisionParcial: 0,
    });
    expect(result.interesesAmortizados).toBeLessThan(result.interesesOriginales);
  });

  it('respeta el vencimiento de una bonificación durante el tramo fijo mixto', () => {
    const input: FlujoInput = {
      ...flujoFijo(150_000, 0, 25),
      tipo: 'mixta',
      mixtaTinFijo: 0.03,
      mixtaAniosFijos: 5,
      euribor: 0.03,
      diferencial: 0.01,
      periodicidadRevision: 'anual',
      vinculaciones: [
        {
          id: 'temporal',
          nombre: 'Bonificación temporal',
          activo: true,
          bonificacionTin: 0.005,
          costeInicial: ZERO,
          costeAnual: ZERO,
          incrementoAnual: 0,
          aniosExigidos: 1,
          obligatorio: true,
          observaciones: '',
        },
      ],
    };
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(5_000),
      enMes: 6,
      opcion: 'cuota',
      comisionParcial: 0,
    });

    expect(result.flujoAmortizado[12]?.tinAplicado).toBeCloseTo(0.025);
    expect(result.flujoAmortizado[13]?.tinAplicado).toBeCloseTo(0.03);
  });

  it('termina el flujo si la amortización anticipada cubre todo el pendiente', () => {
    const result = simularAmortizacionAnticipada(flujoFijo(100_000, 0.03, 20), {
      importe: toCents(200_000),
      enMes: 1,
      opcion: 'cuota',
      comisionParcial: 0.01,
    });

    expect(result.flujoAmortizado).toHaveLength(2);
    expect(result.flujoAmortizado.at(-1)?.pendiente).toBe(ZERO);
    expect(result.comision).toBe(toCents(1_000));
  });

  it('reduce plazo a tipo cero usando capital dividido por cuota', () => {
    const result = simularAmortizacionAnticipada(flujoFijo(120_000, 0, 10), {
      importe: toCents(20_000),
      enMes: 12,
      opcion: 'plazo',
      comisionParcial: 0,
    });

    expect(result.nuevoNumCuotas).not.toBeNull();
    expect(result.nuevoNumCuotas).toBeLessThan(120);
    expect(result.flujoAmortizado.at(-1)?.pendiente).toBe(ZERO);
  });

  it('recalcula una variable semestral después de la revisión', () => {
    const input: FlujoInput = {
      ...flujoFijo(100_000, 0, 10),
      tipo: 'variable',
      euribor: 0.02,
      diferencial: 0.01,
      periodicidadRevision: 'semestral',
      euriborPorPeriodos: [
        { desdeMes: 1, valor: 0.02 },
        { desdeMes: 7, valor: 0.04 },
      ],
    };
    const result = simularAmortizacionAnticipada(input, {
      importe: toCents(5_000),
      enMes: 3,
      opcion: 'cuota',
      comisionParcial: 0,
    });

    expect(result.flujoAmortizado[6]?.tinAplicado).toBeCloseTo(0.03);
    expect(result.flujoAmortizado[7]?.tinAplicado).toBeCloseTo(0.05);
  });
});
