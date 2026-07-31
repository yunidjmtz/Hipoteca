import { describe, it, expect } from 'vitest';
import { calcularTaeEstimada } from '@/finance/apr';
import { construirFlujoDeCaja } from '@/finance/mortgage';
import { toCents, ZERO } from '@/core/money';
import type { FlujoInput, ProductoVinculado } from '@/domain/types';

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

function vincObligatorio(id: string, costeAnual = 300): ProductoVinculado {
  return {
    id,
    nombre: `Seguro ${id}`,
    activo: true,
    bonificacionTin: 0,
    costeInicial: ZERO,
    costeAnual: toCents(costeAnual),
    incrementoAnual: 0,
    aniosExigidos: null,
    obligatorio: true,
    observaciones: '',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calcularTaeEstimada', () => {
  it('sin comisiones ni vinculaciones: TAE ≈ (1 + TIN/12)^12 − 1', () => {
    const input = flujoFijo(150_000, 0.03, 20);
    const lineas = construirFlujoDeCaja(input);
    const tae = calcularTaeEstimada(lineas, toCents(150_000), []);
    // TAE teórica para TIN 3 % mensualizado: (1+0.0025)^12 − 1 ≈ 3.0416 %
    expect(tae).toBeCloseTo(0.030416, 3);
  });

  it('con comisión de apertura: TAE > TAE sin comisión', () => {
    const inputSin = flujoFijo(150_000, 0.03, 20);
    const inputCon = flujoFijo(150_000, 0.03, 20, 1500);
    const taeSin = calcularTaeEstimada(construirFlujoDeCaja(inputSin), toCents(150_000), []);
    const taeCon = calcularTaeEstimada(construirFlujoDeCaja(inputCon), toCents(150_000), []);
    expect(taeCon).toBeGreaterThan(taeSin);
  });

  it('incluye el coste de un producto activo que bonifica el interés aunque no sea obligatorio', () => {
    const vincOpcional: ProductoVinculado = {
      ...vincObligatorio('v1', 300),
      obligatorio: false,
      bonificacionTin: 0.003,
    };
    const input = { ...flujoFijo(150_000, 0.03, 20), vinculaciones: [vincOpcional] };
    const lineas = construirFlujoDeCaja(input);

    const taeConCoste = calcularTaeEstimada(lineas, toCents(150_000), [vincOpcional]);
    const taeSinCoste = calcularTaeEstimada(lineas, toCents(150_000), []);
    expect(taeConCoste).toBeGreaterThan(taeSinCoste);
  });

  it('devuelve 0 si capital es 0', () => {
    const input = flujoFijo(0, 0.03, 20);
    const lineas = construirFlujoDeCaja(input);
    expect(calcularTaeEstimada(lineas, ZERO, [])).toBe(0);
  });

  it('devuelve 0 si el flujo tiene menos de 2 líneas', () => {
    expect(calcularTaeEstimada([], toCents(100_000), [])).toBe(0);
  });

  it('TAE mayor para plazo corto con mismos costes (mayor impacto de comisión)', () => {
    const corto = flujoFijo(100_000, 0.03, 5, 1000);
    const largo = flujoFijo(100_000, 0.03, 25, 1000);
    const taeCorto = calcularTaeEstimada(construirFlujoDeCaja(corto), toCents(100_000), []);
    const taeLargo = calcularTaeEstimada(construirFlujoDeCaja(largo), toCents(100_000), []);
    // Comisión de 1.000 € diluida en menos meses → mayor impacto en TAE
    expect(taeCorto).toBeGreaterThan(taeLargo);
  });

  it('devuelve 0 si la comisión consume todo el capital neto', () => {
    const input = flujoFijo(1_000, 0.03, 1, 1_000);
    expect(calcularTaeEstimada(construirFlujoDeCaja(input), toCents(1_000), [])).toBe(0);
  });

  it('devuelve 0 para un préstamo al 0 % sin costes', () => {
    const input = flujoFijo(12_000, 0, 1);
    expect(calcularTaeEstimada(construirFlujoDeCaja(input), toCents(12_000), [])).toBe(0);
  });
});
