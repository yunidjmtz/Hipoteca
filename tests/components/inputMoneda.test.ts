import { describe, expect, it } from 'vitest';
import { formatEurosMientrasSeEscribe } from '@/core/format';

describe('formato de moneda durante la edición', () => {
  it('agrupa los miles desde que se escribe el importe', () => {
    expect(formatEurosMientrasSeEscribe('1000')).toBe('1.000');
    expect(formatEurosMientrasSeEscribe('10000')).toBe('10.000');
    expect(formatEurosMientrasSeEscribe('1250000')).toBe('1.250.000');
  });

  it('mantiene los decimales con coma mientras se escribe', () => {
    expect(formatEurosMientrasSeEscribe('1250,5')).toBe('1.250,5');
    expect(formatEurosMientrasSeEscribe('1250,50')).toBe('1.250,50');
    expect(formatEurosMientrasSeEscribe('1.250,50 €')).toBe('1.250,50');
  });

  it('acepta el punto como decimal cuando no representa miles', () => {
    expect(formatEurosMientrasSeEscribe('1.5')).toBe('1,5');
  });
});
