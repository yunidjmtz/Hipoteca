import { describe, it, expect } from 'vitest';
import { analizarVinculacion, tinEfectivoConVinculaciones } from '@/finance/linkedProducts';
import { toCents, ZERO } from '@/core/money';
import type { FlujoInput, ProductoVinculado } from '@/domain/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flujoFijoBase(capitalEuros: number, tinAnual: number, plazoAnios: number): FlujoInput {
  return {
    capital: toCents(capitalEuros),
    tinAnual,
    plazoMeses: plazoAnios * 12,
    sueloTin: 0,
    fechaPrimeraCuota: '2024-01-01',
    comisionApertura: ZERO,
    vinculaciones: [],
    tipo: 'fija',
  };
}

function vinculacionBase(overrides: Partial<ProductoVinculado> = {}): ProductoVinculado {
  return {
    id: 'v1',
    nombre: 'Seguro de vida',
    activo: true,
    bonificacionTin: 0.005, // 0,5 %
    costeInicial: ZERO,
    costeAnual: toCents(400),
    incrementoAnual: 0,
    aniosExigidos: null,
    obligatorio: true,
    observaciones: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// §9.1 · caso 15: vinculación que compensa (R13)
// ---------------------------------------------------------------------------

describe('analizarVinculacion', () => {
  it('caso 15 — vinculación que compensa: beneficioNeto > 0', () => {
    // TIN base = 3.5 %. Con bonificación de 0.5 % → TIN = 3 %.
    // Ahorro en intereses > coste del producto.
    const v = vinculacionBase({
      bonificacionTin: 0.005, // 0,5 %
      costeAnual: toCents(300), // 300 €/año
    });
    const input: FlujoInput = {
      ...flujoFijoBase(120_000, 0.035, 25),
      vinculaciones: [v],
    };

    const analisis = analizarVinculacion(v, input);

    expect(analisis.recomendacion).toBe('compensa');
    expect(analisis.beneficioNeto).toBeGreaterThan(0);
    expect(analisis.puntoEquilibrioMeses).not.toBeNull();
  });

  // §9.1 · caso 16: vinculación que no compensa (R13)
  it('caso 16 — vinculación que no compensa: beneficioNeto < 0', () => {
    // TIN base = 3.5 %. Bonificación muy pequeña (0.01 %) pero coste alto.
    const v = vinculacionBase({
      bonificacionTin: 0.0001, // 0,01 % — prácticamente ningún ahorro
      costeAnual: toCents(1_200), // 1.200 €/año — coste alto
    });
    const input: FlujoInput = {
      ...flujoFijoBase(100_000, 0.035, 20),
      vinculaciones: [v],
    };

    const analisis = analizarVinculacion(v, input);

    expect(analisis.recomendacion).toBe('no_compensa');
    expect(analisis.beneficioNeto).toBeLessThan(0);
    expect(analisis.puntoEquilibrioMeses).toBeNull();
  });

  it('bonificacionEfectiva se topa con bonificacionMaxima', () => {
    const v = vinculacionBase({
      bonificacionTin: 0.01, // 1 %
      bonificacionMaxima: 0.005, // tope 0,5 %
      costeAnual: toCents(200),
    });
    const input: FlujoInput = {
      ...flujoFijoBase(80_000, 0.04, 20),
      vinculaciones: [v],
    };

    const analisis = analizarVinculacion(v, input);

    // La bonificación efectiva no puede superar bonificacionMaxima
    expect(analisis.bonificacionEfectiva).toBeCloseTo(0.005);
  });

  it('vinculación con bonificacionTin = 0 y coste alto: no compensa', () => {
    // Sin reducción de TIN el ahorro en intereses es cero; el coste es puro coste.
    const v = vinculacionBase({
      bonificacionTin: 0, // sin bonificación: no reduce el TIN
      costeAnual: toCents(800), // pero tiene coste anual alto
    });
    const input: FlujoInput = {
      ...flujoFijoBase(80_000, 0.04, 20),
      vinculaciones: [v],
    };

    const analisis = analizarVinculacion(v, input);

    // Sin reducción de TIN no hay ahorro de intereses → beneficioNeto = -costeTotalCents
    expect(analisis.beneficioNeto).toBeLessThan(0);
    expect(analisis.recomendacion).toBe('no_compensa');
    expect(analisis.puntoEquilibrioMeses).toBeNull();
  });

  it('sin bonificación ni coste devuelve recomendación indeterminada', () => {
    const v = vinculacionBase({
      bonificacionTin: 0,
      costeInicial: ZERO,
      costeAnual: ZERO,
    });
    const input: FlujoInput = {
      ...flujoFijoBase(80_000, 0.04, 20),
      vinculaciones: [v],
    };

    const analisis = analizarVinculacion(v, input);
    expect(analisis.beneficioNeto).toBe(0);
    expect(analisis.recomendacion).toBe('indeterminado');
  });

  it('aniosExigidos limita el coste periódico', () => {
    // El coste solo aplica durante los años exigidos; el ahorro en intereses aplica
    // mientras la vinculación está activa (con activo = true).
    const v = vinculacionBase({
      bonificacionTin: 0.005,
      costeAnual: toCents(600),
      aniosExigidos: 5, // solo 5 años de coste
    });
    const input: FlujoInput = {
      ...flujoFijoBase(100_000, 0.035, 25),
      vinculaciones: [v],
    };

    const analisis = analizarVinculacion(v, input);

    // Coste total máximo = 5 años * 600 €/año = 3.000 €
    expect(analisis.costeTotalCents).toBeLessThanOrEqual(toCents(3_000) + 1);
  });

  it('tinEfectivoConVinculaciones aplica bonificaciones correctamente', () => {
    const vincs: ProductoVinculado[] = [
      vinculacionBase({ bonificacionTin: 0.005 }),
      vinculacionBase({ id: 'v2', nombre: 'Tarjeta', bonificacionTin: 0.003, activo: true }),
    ];

    const tinBase = 0.035;
    const tin = tinEfectivoConVinculaciones(tinBase, 0, vincs);

    // 3.5 % − 0.5 % − 0.3 % = 2.7 %
    expect(tin).toBeCloseTo(0.027);
  });

  it('tinEfectivoConVinculaciones no baja del suelo', () => {
    const vincs: ProductoVinculado[] = [
      vinculacionBase({ bonificacionTin: 0.05 }), // bonificación enorme
    ];

    const tinBase = 0.02;
    const sueloTin = 0.01;
    const tin = tinEfectivoConVinculaciones(tinBase, sueloTin, vincs);

    expect(tin).toBeGreaterThanOrEqual(sueloTin);
  });
});
