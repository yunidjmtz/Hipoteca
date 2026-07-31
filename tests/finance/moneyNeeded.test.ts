import { describe, it, expect } from 'vitest';
import { calcularDineroNecesario } from '@/finance/moneyNeeded';
import { toCents, ZERO } from '@/core/money';

describe('calcularDineroNecesario — §4.3', () => {
  it('dineroMinimo = entrada + impuestos + obligatorios + comerciales', () => {
    const r = calcularDineroNecesario({
      entrada: toCents(30_000),
      impuestos: toCents(10_000),
      gastosObligatorios: toCents(2_500),
      gastosComerciales: toCents(1_000),
      reforma: ZERO,
      muebles: ZERO,
      mudanza: ZERO,
      imprevistos: ZERO,
      otrosTransicion: ZERO,
      ahorrosActuales: toCents(55_000),
    });
    expect(r.dineroMinimo).toBe(toCents(43_500));
  });

  it('dineroRecomendado = mínimo + gastos de transición', () => {
    const r = calcularDineroNecesario({
      entrada: toCents(20_000),
      impuestos: toCents(8_000),
      gastosObligatorios: toCents(2_000),
      gastosComerciales: ZERO,
      reforma: toCents(5_000),
      muebles: toCents(3_000),
      mudanza: toCents(500),
      imprevistos: toCents(1_000),
      otrosTransicion: ZERO,
      ahorrosActuales: toCents(50_000),
    });
    expect(r.dineroMinimo).toBe(toCents(30_000));
    expect(r.dineroRecomendado).toBe(toCents(39_500));
  });

  it('dineroComodo coincide con el recomendado', () => {
    const r = calcularDineroNecesario({
      entrada: toCents(20_000),
      impuestos: toCents(8_000),
      gastosObligatorios: toCents(2_000),
      gastosComerciales: ZERO,
      reforma: ZERO,
      muebles: ZERO,
      mudanza: ZERO,
      imprevistos: ZERO,
      otrosTransicion: ZERO,
      ahorrosActuales: toCents(50_000),
    });
    expect(r.dineroComodo).toBe(toCents(30_000));
  });

  it('todos los ahorros son utilizables', () => {
    const r = calcularDineroNecesario({
      entrada: ZERO,
      impuestos: ZERO,
      gastosObligatorios: ZERO,
      gastosComerciales: ZERO,
      reforma: ZERO,
      muebles: ZERO,
      mudanza: ZERO,
      imprevistos: ZERO,
      otrosTransicion: ZERO,
      ahorrosActuales: toCents(35_000),
    });
    expect(r.ahorroUtilizable).toBe(toCents(35_000));
  });

  it('faltanteMinimo > 0 cuando ahorro insuficiente', () => {
    const r = calcularDineroNecesario({
      entrada: toCents(30_000),
      impuestos: toCents(8_000),
      gastosObligatorios: toCents(2_500),
      gastosComerciales: ZERO,
      reforma: ZERO,
      muebles: ZERO,
      mudanza: ZERO,
      imprevistos: ZERO,
      otrosTransicion: ZERO,
      ahorrosActuales: toCents(25_000),
    });
    // dineroMinimo = 40.500, ahorroUtilizable = 25.000 → falta 15.500
    expect(r.faltanteMinimo).toBe(toCents(15_500));
  });

  it('faltantes = 0 cuando ahorro cubre todos los niveles', () => {
    const r = calcularDineroNecesario({
      entrada: toCents(20_000),
      impuestos: toCents(5_000),
      gastosObligatorios: toCents(2_000),
      gastosComerciales: ZERO,
      reforma: toCents(3_000),
      muebles: ZERO,
      mudanza: ZERO,
      imprevistos: ZERO,
      otrosTransicion: ZERO,
      ahorrosActuales: toCents(50_000),
    });
    expect(r.faltanteMinimo).toBe(ZERO);
    expect(r.faltanteRecomendado).toBe(ZERO);
    expect(r.faltanteComodo).toBe(ZERO);
  });

  it('remanenteTrasMinimo puede ser negativo', () => {
    const r = calcularDineroNecesario({
      entrada: toCents(30_000),
      impuestos: toCents(10_000),
      gastosObligatorios: toCents(2_000),
      gastosComerciales: ZERO,
      reforma: ZERO,
      muebles: ZERO,
      mudanza: ZERO,
      imprevistos: ZERO,
      otrosTransicion: ZERO,
      ahorrosActuales: toCents(20_000),
    });
    // ahorros 20k - dineroMinimo 42k = -22k
    expect(r.remanenteTrasMinimo).toBe(toCents(-22_000));
  });
});
