import { describe, it, expect } from 'vitest';
import {
  calcularImpuestoPorTramos,
  calcularBonificacionAplicable,
  calcularImpuestoCompraventa,
  calcularGastosCompra,
} from '@/finance/purchaseCosts';
import { FISCAL_ARAGON } from '@/config/fiscal';
import { toCents } from '@/core/money';
import type { ContextoReduccion } from '@/domain/types';
import { ESTADO_INICIAL } from '@/storage/defaults';

const CTX_SIN_REDUCCION: ContextoReduccion = {
  edadMaximaTitular: 40,
  discapacidadPorcentaje: 0,
  victimaViolenciaGenero: false,
  familiaNumerosa: false,
  esViviendaHabitual: true,
};

const CTX_JOVEN: ContextoReduccion = {
  edadMaximaTitular: 30,
  discapacidadPorcentaje: 0,
  victimaViolenciaGenero: false,
  familiaNumerosa: false,
  esViviendaHabitual: true,
};

// §9.1 · caso 25: impuesto por tramos con Aragón — R2
describe('calcularImpuestoPorTramos — Aragón', () => {
  const tramos = FISCAL_ARAGON.itpTramos;

  it('tramo 1: precio ≤ 400.000 € → 8 %', () => {
    expect(calcularImpuestoPorTramos(200_000, tramos)).toBeCloseTo(16_000, 2);
    expect(calcularImpuestoPorTramos(400_000, tramos)).toBeCloseTo(32_000, 2);
  });

  it('tramo 2: precio 420.000 € — parte en tramo 1 al 8 %, exceso al 8,5 %', () => {
    // 400.000 × 8 % + 20.000 × 8,5 % = 32.000 + 1.700 = 33.700 €
    expect(calcularImpuestoPorTramos(420_000, tramos)).toBeCloseTo(33_700, 2);
  });

  it('tramo 3: precio 480.000 €', () => {
    // 32.000 + 4.250 + 30.000 × 9 % = 32.000 + 4.250 + 2.700 = 38.950 €
    expect(calcularImpuestoPorTramos(480_000, tramos)).toBeCloseTo(38_950, 2);
  });

  it('tramo 4: precio 600.000 €', () => {
    // 32.000 + 4.250 + 4.500 + 100.000 × 9,5 % = 32.000 + 4.250 + 4.500 + 9.500 = 50.250 €
    expect(calcularImpuestoPorTramos(600_000, tramos)).toBeCloseTo(50_250, 2);
  });

  it('tramo 5 (sin tope): precio 800.000 €', () => {
    // 32.000 + 4.250 + 4.500 + 23.750 + 50.000 × 10 % = 69.500 €
    expect(calcularImpuestoPorTramos(800_000, tramos)).toBeCloseTo(69_500, 2);
  });

  it('el impuesto es creciente con el precio', () => {
    const precios = [100_000, 300_000, 500_000, 700_000, 1_000_000];
    for (let i = 1; i < precios.length; i++) {
      const p = precios[i] as number;
      const pAnterior = precios[i - 1] as number;
      expect(calcularImpuestoPorTramos(p, tramos)).toBeGreaterThan(
        calcularImpuestoPorTramos(pAnterior, tramos),
      );
    }
  });

  // §9.1 · caso 28: umbral fiscal que rompe la monotonía del tipo efectivo
  it('el tipo efectivo medio aumenta con el precio (convexidad)', () => {
    const t1 = calcularImpuestoPorTramos(400_000, tramos) / 400_000;
    const t2 = calcularImpuestoPorTramos(500_000, tramos) / 500_000;
    expect(t2).toBeGreaterThan(t1);
  });
});

describe('calcularBonificacionAplicable — Aragón', () => {
  it('sin condiciones: no aplica bonificación', () => {
    expect(
      calcularBonificacionAplicable(CTX_SIN_REDUCCION, FISCAL_ARAGON.itpReducciones, 80_000),
    ).toBe(0);
  });

  it('joven <35 con inmueble ≤100.000 €: bonif 12,5 %', () => {
    expect(calcularBonificacionAplicable(CTX_JOVEN, FISCAL_ARAGON.itpReducciones, 90_000)).toBe(
      0.125,
    );
  });

  it('joven <35 con inmueble >100.000 €: NO aplica la bonificación', () => {
    expect(calcularBonificacionAplicable(CTX_JOVEN, FISCAL_ARAGON.itpReducciones, 150_000)).toBe(0);
  });

  it('no aplica bonificación si no es vivienda habitual', () => {
    expect(
      calcularBonificacionAplicable(
        { ...CTX_JOVEN, esViviendaHabitual: false },
        FISCAL_ARAGON.itpReducciones,
        90_000,
      ),
    ).toBe(0);
  });

  it('víctima violencia de género con inmueble ≤100.000 €: bonif 12,5 %', () => {
    const ctx: ContextoReduccion = { ...CTX_SIN_REDUCCION, victimaViolenciaGenero: true };
    expect(calcularBonificacionAplicable(ctx, FISCAL_ARAGON.itpReducciones, 80_000)).toBe(0.125);
  });

  it('joven + discapacidad: bonificaciones acumuladas 25 %', () => {
    const ctx: ContextoReduccion = { ...CTX_JOVEN, discapacidadPorcentaje: 65 };
    expect(calcularBonificacionAplicable(ctx, FISCAL_ARAGON.itpReducciones, 80_000)).toBe(0.25);
  });
});

describe('calcularImpuestoCompraventa', () => {
  it('segunda mano: ITP progresivo sin reducción', () => {
    const resultado = calcularImpuestoCompraventa(
      toCents(200_000),
      FISCAL_ARAGON,
      'usada',
      false,
      CTX_SIN_REDUCCION,
    );
    expect(resultado.iva).toBe(0);
    expect(resultado.ajd).toBe(0);
    // ITP = 200.000 × 8 % = 16.000 € = 1.600.000 céntimos
    expect(resultado.itp).toBe(toCents(16_000));
    expect(resultado.total).toBe(toCents(16_000));
  });

  it('segunda mano: ITP con bonificación joven 12,5 %', () => {
    const resultado = calcularImpuestoCompraventa(
      toCents(80_000),
      FISCAL_ARAGON,
      'usada',
      false,
      CTX_JOVEN,
    );
    // ITP bruto = 80.000 × 8 % = 6.400 €. Con bonif 12,5 %: 6.400 × 0.875 = 5.600 €
    expect(resultado.itp).toBe(toCents(5_600));
  });

  it('respeta el tipo ITP manual configurado', () => {
    const resultado = calcularImpuestoCompraventa(
      toCents(200_000),
      { ...FISCAL_ARAGON, tipoManualOverride: 0.06 },
      'usada',
      false,
      CTX_SIN_REDUCCION,
    );
    expect(resultado.itp).toBe(toCents(12_000));
  });

  it('usa el valor de referencia fiscal cuando supera el precio', () => {
    const resultado = calcularImpuestoCompraventa(
      toCents(150_000),
      FISCAL_ARAGON,
      'usada',
      false,
      CTX_SIN_REDUCCION,
      toCents(180_000),
    );
    expect(resultado.itp).toBe(toCents(14_400));
  });

  it('nueva vivienda libre: IVA 10 % + AJD 1,5 %', () => {
    const resultado = calcularImpuestoCompraventa(
      toCents(200_000),
      FISCAL_ARAGON,
      'nueva',
      false,
      CTX_SIN_REDUCCION,
    );
    expect(resultado.itp).toBe(0);
    expect(resultado.iva).toBe(toCents(20_000)); // 10 % de 200.000
    expect(resultado.ajd).toBe(toCents(3_000)); // 1,5 % de 200.000
    expect(resultado.total).toBe(toCents(23_000));
  });

  it('nueva vivienda VPO especial: IVA 4 %', () => {
    const resultado = calcularImpuestoCompraventa(
      toCents(200_000),
      FISCAL_ARAGON,
      'nueva',
      true, // esVpoEspecial
      CTX_SIN_REDUCCION,
    );
    expect(resultado.iva).toBe(toCents(8_000)); // 4 % de 200.000
  });
});

describe('calcularGastosCompra', () => {
  it('incluye inmobiliaria, IVA, notaría y tasación en el total', () => {
    const resultado = calcularGastosCompra(
      toCents(200_000),
      FISCAL_ARAGON,
      'usada',
      false,
      CTX_SIN_REDUCCION,
      ESTADO_INICIAL.gastos,
    );

    // Inmobiliaria: 200.000 × 3 % × 1,21 = 7.260 €
    expect(resultado.inmobiliaria).toBe(toCents(7_260));
    // Notaría 1.000 + registro 500 + gestoría 500 + tasación 600 + nota simple 10
    expect(resultado.gastosObligatorios).toBe(toCents(2_610));
    expect(resultado.gastosComerciales).toBe(toCents(7_260));
    // ITP 16.000 + formalización 2.610 + inmobiliaria 7.260
    expect(resultado.total).toBe(toCents(25_870));
  });

  it('suma la parte fija de inmobiliaria antes de aplicar el IVA', () => {
    const resultado = calcularGastosCompra(
      toCents(100_000),
      FISCAL_ARAGON,
      'usada',
      false,
      CTX_SIN_REDUCCION,
      {
        ...ESTADO_INICIAL.gastos,
        inmobiliariaFijo: toCents(1_000),
        inmobiliariaPorcentaje: 0.02,
      },
    );

    // (1.000 + 100.000 × 2 %) × 1,21 = 3.630 €
    expect(resultado.inmobiliaria).toBe(toCents(3_630));
  });
});
