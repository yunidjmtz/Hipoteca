import { describe, it, expect } from 'vitest';
import {
  toCents,
  fromCents,
  centsRoundHalfUp,
  addCents,
  subtractCents,
  multiplyCents,
  sumCents,
  maxCents,
  minCents,
  clampCents,
  ZERO,
} from '@/core/money';

describe('toCents', () => {
  it('convierte euros enteros', () => {
    expect(toCents(100)).toBe(10_000);
    expect(toCents(0)).toBe(0);
    expect(toCents(190_000)).toBe(19_000_000);
  });

  it('redondea half-up al céntimo', () => {
    // 1.005 * 100 = 100.49999... en IEEE 754 → 100 (comportamiento correcto de punto flotante)
    expect(toCents(1.004)).toBe(100); // 100.4 → 100
    expect(toCents(1.006)).toBe(101); // 100.6 → 101
    expect(toCents(0.995)).toBe(100); // 99.5 → 100 (representación más cercana a 99.5)
    expect(toCents(0.501)).toBe(50); // 50.1 → 50
    expect(toCents(1.995)).toBe(200); // 199.5 → 200 (exactamente mitad → sube)
  });

  it('fromCents es la inversa de toCents para enteros', () => {
    expect(fromCents(toCents(150_000))).toBe(150_000);
    expect(fromCents(toCents(0))).toBe(0);
  });
});

describe('centsRoundHalfUp', () => {
  it('redondea .5 hacia arriba', () => {
    expect(centsRoundHalfUp(100.5)).toBe(101);
    expect(centsRoundHalfUp(0.5)).toBe(1);
  });

  it('redondea .4 hacia abajo', () => {
    expect(centsRoundHalfUp(100.4)).toBe(100);
  });
});

describe('aritmética de Cents', () => {
  it('addCents', () => {
    expect(addCents(toCents(100), toCents(50))).toBe(toCents(150));
  });

  it('subtractCents', () => {
    expect(subtractCents(toCents(150), toCents(50))).toBe(toCents(100));
  });

  it('multiplyCents redondea half-up', () => {
    const c = toCents(100); // 10000
    expect(multiplyCents(c, 0.08)).toBe(800); // 800.0 exacto
    expect(multiplyCents(c, 0.085)).toBe(850); // 850.0 exacto
    expect(multiplyCents(toCents(1), 0.005)).toBe(1); // 0.5 → 1 (half-up)
  });

  it('sumCents', () => {
    const vals = [toCents(100), toCents(200), toCents(300)];
    expect(sumCents(vals)).toBe(toCents(600));
    expect(sumCents([])).toBe(ZERO);
  });

  it('maxCents y minCents', () => {
    expect(maxCents(toCents(100), toCents(200))).toBe(toCents(200));
    expect(minCents(toCents(100), toCents(200))).toBe(toCents(100));
  });

  it('clampCents', () => {
    expect(clampCents(toCents(150), toCents(100), toCents(200))).toBe(toCents(150));
    expect(clampCents(toCents(50), toCents(100), toCents(200))).toBe(toCents(100));
    expect(clampCents(toCents(250), toCents(100), toCents(200))).toBe(toCents(200));
  });
});
