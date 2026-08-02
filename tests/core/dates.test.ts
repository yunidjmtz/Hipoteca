import { describe, it, expect } from 'vitest';
import {
  fechaVencimiento,
  addMonthsAnchored,
  fechaLocalISO,
  primerDiaMesSiguienteLocal,
} from '@/core/dates';

describe('fechas locales', () => {
  it('acepta la fecha actual cuando no se proporciona una explícita', () => {
    expect(fechaLocalISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(primerDiaMesSiguienteLocal()).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('no retrocede de día al convertir una medianoche local', () => {
    expect(fechaLocalISO(new Date(2026, 8, 1, 0, 0, 0))).toBe('2026-09-01');
  });

  it('calcula el primer día del mes siguiente en hora local', () => {
    expect(primerDiaMesSiguienteLocal(new Date(2026, 7, 2, 23, 30))).toBe('2026-09-01');
  });
});

describe('addMonthsAnchored', () => {
  it('avanza meses sin cambiar el día cuando el mes lo permite', () => {
    expect(addMonthsAnchored('2024-01-15', 15, 3)).toBe('2024-04-15');
    expect(addMonthsAnchored('2024-01-31', 31, 1)).toBe('2024-02-29'); // feb 2024 bisiesto
    expect(addMonthsAnchored('2024-01-31', 31, 2)).toBe('2024-03-31');
  });

  it('ajusta al último día del mes cuando el día ancla no existe — R8', () => {
    expect(addMonthsAnchored('2024-01-31', 31, 1)).toBe('2024-02-29'); // feb bisiesto
    expect(addMonthsAnchored('2023-01-31', 31, 1)).toBe('2023-02-28'); // feb no bisiesto
    expect(addMonthsAnchored('2024-03-31', 31, 2)).toBe('2024-05-31');
    expect(addMonthsAnchored('2024-01-30', 30, 1)).toBe('2024-02-29'); // feb: cap a 29
  });

  it('cruza el umbral de año correctamente', () => {
    expect(addMonthsAnchored('2024-11-15', 15, 3)).toBe('2025-02-15');
    expect(addMonthsAnchored('2024-12-31', 31, 1)).toBe('2025-01-31');
  });
});

describe('fechaVencimiento — R8', () => {
  it('cuota 1 devuelve la propia fecha de inicio', () => {
    expect(fechaVencimiento('2024-02-01', 1)).toBe('2024-02-01');
  });

  it('nunca itera sobre el vencimiento anterior — ancla fija', () => {
    // Si arranca el 31/01, la cuota 2 debe ser 29/02 (bisiesto), no "02/03"
    expect(fechaVencimiento('2024-01-31', 2)).toBe('2024-02-29');
    expect(fechaVencimiento('2024-01-31', 3)).toBe('2024-03-31');
  });

  // §9.1 · caso 21: vencimientos en días 28, 29, 30, 31
  it('día 28 nunca salta de mes', () => {
    expect(fechaVencimiento('2024-01-28', 2)).toBe('2024-02-28');
    expect(fechaVencimiento('2024-01-28', 13)).toBe('2025-01-28');
  });

  it('día 29 ajusta en febrero no bisiesto', () => {
    expect(fechaVencimiento('2024-01-29', 2)).toBe('2024-02-29'); // 2024 bisiesto
    expect(fechaVencimiento('2025-01-29', 2)).toBe('2025-02-28'); // 2025 no bisiesto
  });

  // §9.1 · caso 22: año bisiesto
  it('año bisiesto 2024', () => {
    expect(fechaVencimiento('2024-01-31', 2)).toBe('2024-02-29');
  });

  it('año no bisiesto 2025', () => {
    expect(fechaVencimiento('2025-01-31', 2)).toBe('2025-02-28');
  });

  // Cubre la rama ?? '1' de partes[2] cuando la fecha no tiene día
  it('fecha sin parte de día usa día 1 como ancla', () => {
    expect(fechaVencimiento('2024-02', 1)).toBe('2024-02-01');
  });
});

describe('addMonthsAnchored — ramas defensivas', () => {
  // Cubre la rama ?? '1' de partes[1] cuando la cadena no tiene guión de mes
  it('cadena sin mes usa mes 1', () => {
    // '2024'.split('-') = ['2024'] → partes[1] = undefined → ?? '1' → mes enero
    expect(addMonthsAnchored('2024', 15, 3)).toBe('2024-04-15');
  });
});
