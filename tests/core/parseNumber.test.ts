import { describe, it, expect } from 'vitest';
import { parseEuros, parseDecimalPorcentaje } from '@/core/parseNumber';
import { toCents } from '@/core/money';

describe('parseEuros', () => {
  it('parsea enteros sin separadores', () => {
    expect(parseEuros('1800')).toBe(toCents(1_800));
  });

  it('parsea con punto de miles (3 dígitos tras el punto)', () => {
    expect(parseEuros('1.800')).toBe(toCents(1_800));
    expect(parseEuros('150.000')).toBe(toCents(150_000));
  });

  it('parsea con coma decimal', () => {
    expect(parseEuros('1800,5')).toBe(toCents(1_800.5));
    expect(parseEuros('1800,50')).toBe(toCents(1_800.5));
  });

  it('parsea con punto de miles y coma decimal', () => {
    expect(parseEuros('1.800,50')).toBe(toCents(1_800.5));
    expect(parseEuros('150.000,99')).toBe(toCents(150_000.99));
  });

  it('parsea con símbolo € y espacios', () => {
    expect(parseEuros('1.800,50 €')).toBe(toCents(1_800.5));
    expect(parseEuros('  200.000 €  ')).toBe(toCents(200_000));
  });

  it('parsea punto decimal (1 dígito tras el punto)', () => {
    expect(parseEuros('1.5')).toBe(toCents(1.5));
  });

  it('parsea cero', () => {
    expect(parseEuros('0')).toBe(toCents(0));
  });

  it('devuelve null para entrada vacía', () => {
    expect(parseEuros('')).toBeNull();
    expect(parseEuros('   ')).toBeNull();
  });

  it('devuelve null para texto no numérico', () => {
    expect(parseEuros('abc')).toBeNull();
    expect(parseEuros('xyz123')).toBeNull();
    expect(parseEuros('123abc')).toBeNull();
    expect(parseEuros('1,2,3')).toBeNull();
    expect(parseEuros('1.2345')).toBeNull();
  });

  it('devuelve null para valores negativos', () => {
    expect(parseEuros('-100')).toBeNull();
  });
});

describe('parseDecimalPorcentaje', () => {
  it('parsea porcentaje con coma decimal', () => {
    expect(parseDecimalPorcentaje('3,25')).toBeCloseTo(0.0325, 6);
    expect(parseDecimalPorcentaje('3,25 %')).toBeCloseTo(0.0325, 6);
  });

  it('parsea porcentaje con punto decimal', () => {
    expect(parseDecimalPorcentaje('3.25')).toBeCloseTo(0.0325, 6);
  });

  it('parsea 0 %', () => {
    expect(parseDecimalPorcentaje('0')).toBe(0);
  });

  it('parsea 100 %', () => {
    expect(parseDecimalPorcentaje('100')).toBeCloseTo(1, 6);
  });

  it('devuelve null para porcentaje mayor de 100', () => {
    expect(parseDecimalPorcentaje('110')).toBeNull();
    expect(parseDecimalPorcentaje('100.01')).toBeNull();
  });

  it('devuelve null para valores negativos', () => {
    expect(parseDecimalPorcentaje('-1')).toBeNull();
  });

  it('devuelve null para texto no numérico', () => {
    expect(parseDecimalPorcentaje('abc')).toBeNull();
    expect(parseDecimalPorcentaje('')).toBeNull();
    expect(parseDecimalPorcentaje('3,2,1')).toBeNull();
    expect(parseDecimalPorcentaje('3.5abc')).toBeNull();
  });
});
