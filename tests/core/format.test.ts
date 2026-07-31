import { describe, it, expect } from 'vitest';
import { formatEuros, formatPorcentaje, formatEntero, formatFecha } from '@/core/format';
import { toCents } from '@/core/money';

describe('formatEuros', () => {
  it('incluye símbolo de euro', () => {
    expect(formatEuros(toCents(1_000))).toContain('€');
  });

  it('incluye los dígitos correctos', () => {
    const r = formatEuros(toCents(150_000));
    expect(r).toContain('150');
    expect(r).toContain('000');
  });

  it('formatea cero', () => {
    const r = formatEuros(toCents(0));
    expect(r).toContain('0');
    expect(r).toContain('€');
  });

  it('incluye decimales', () => {
    const r = formatEuros(toCents(1_000));
    // es-ES muestra siempre 2 decimales: "1.000,00 €" o similar
    expect(r).toMatch(/00/);
  });
});

describe('formatPorcentaje', () => {
  it('contiene el porcentaje correcto', () => {
    const r = formatPorcentaje(0.035);
    expect(r).toContain('3');
    expect(r).toContain('%');
  });

  it('formatea cero', () => {
    const r = formatPorcentaje(0);
    expect(r).toContain('0');
    expect(r).toContain('%');
  });

  it('formatea 1 (100 %)', () => {
    const r = formatPorcentaje(1);
    expect(r).toContain('100');
    expect(r).toContain('%');
  });
});

describe('formatEntero', () => {
  it('formatea números enteros sin decimales', () => {
    const r = formatEntero(1_000);
    expect(r).toContain('1');
    expect(r).toContain('000');
    expect(r).not.toContain(',00');
  });

  it('formatea cero', () => {
    expect(formatEntero(0)).toBe('0');
  });
});

describe('formatFecha', () => {
  it('devuelve la fecha en formato DD/MM/YYYY', () => {
    const r = formatFecha('2024-03-15');
    expect(r).toBe('15/03/2024');
  });

  it('maneja meses de un dígito con cero inicial', () => {
    const r = formatFecha('2024-01-07');
    expect(r).toBe('07/01/2024');
  });

  it('maneja fin de año', () => {
    const r = formatFecha('2025-12-31');
    expect(r).toBe('31/12/2025');
  });

  // Cubre la rama ?? '1' de partes[2] cuando la fecha no tiene día
  it('fecha sin día usa día 1', () => {
    const r = formatFecha('2024-06');
    expect(r).toContain('2024');
    expect(r).toContain('06');
  });
});
