import { describe, it, expect } from 'vitest';
import { proyectarAhorro, mesesHastaObjetivo } from '@/finance/savingsGoal';
import { toCents, ZERO } from '@/core/money';
import type { InputProyeccion } from '@/domain/types';

function inputBase(opciones?: Partial<InputProyeccion>): InputProyeccion {
  return {
    ahorroInicial: toCents(20_000),
    ahorroMensual: toCents(500),
    extraordinarios: [],
    fechaInicio: '2024-01-01',
    precioObjetivo: toCents(40_000),
    crecimientoAnualPrecio: 0,
    rentabilidadAnualAhorro: 0,
    mesesMaximos: 120,
    ...opciones,
  };
}

describe('proyectarAhorro', () => {
  it('el primer punto tiene mes=0 y ahorroAcumulado=ahorroInicial', () => {
    const p = proyectarAhorro(inputBase());
    expect(p[0]?.mes).toBe(0);
    expect(p[0]?.ahorroAcumulado).toBe(toCents(20_000));
  });

  it('tiene mesesMaximos+1 puntos', () => {
    const p = proyectarAhorro(inputBase({ mesesMaximos: 24 }));
    expect(p).toHaveLength(25); // mes 0..24
  });

  it('ahorro aumenta monotónicamente con ahorro mensual positivo sin rentabilidad', () => {
    const p = proyectarAhorro(inputBase());
    for (let i = 1; i < p.length; i++) {
      expect(p[i]!.ahorroAcumulado).toBeGreaterThanOrEqual(p[i - 1]!.ahorroAcumulado);
    }
  });

  // §9.1 · caso 14: proyección con ingresos extraordinarios
  it('caso 14 — ingreso extraordinario se suma en el mes correcto', () => {
    const p = proyectarAhorro(
      inputBase({
        ahorroInicial: toCents(20_000),
        ahorroMensual: ZERO,
        extraordinarios: [
          {
            id: '1',
            concepto: 'Bonus',
            importe: toCents(5_000),
            fecha: '2024-03-01',
          },
        ],
        mesesMaximos: 6,
      }),
    );
    // Mes 0: 20.000; mes 1: 20.000; mes 2: 20.000; mes 3 (2024-03): 25.000
    const mes2 = p[2]; // 2024-03 starts at mes=2 (0=ene, 1=feb, 2=mar)
    const mes3 = p[3];
    expect(mes3!.ahorroAcumulado).toBeGreaterThan(mes2!.ahorroAcumulado);
    expect(mes3!.ahorroAcumulado - mes2!.ahorroAcumulado).toBe(toCents(5_000));
  });
});

describe('mesesHastaObjetivo', () => {
  // §9.1 · caso 12: meta ya alcanzada
  it('caso 12 — meta ya alcanzada: devuelve 0', () => {
    const resultado = mesesHastaObjetivo(
      inputBase({
        ahorroInicial: toCents(50_000),
        precioObjetivo: toCents(40_000),
      }),
    );
    expect(resultado).toBe(0);
  });

  // §9.1 · caso 13: meta con ahorro mensual cero
  it('caso 13 — ahorro mensual cero sin objetivo alcanzado: devuelve null', () => {
    const resultado = mesesHastaObjetivo(
      inputBase({
        ahorroInicial: toCents(10_000),
        ahorroMensual: ZERO,
        precioObjetivo: toCents(40_000),
        mesesMaximos: 12,
      }),
    );
    expect(resultado).toBeNull();
  });

  it('calcula los meses correctamente sin crecimiento', () => {
    // Ahorro inicial 20.000, mensual 500, objetivo 40.000
    // Faltan 20.000 / 500 = 40 meses
    const resultado = mesesHastaObjetivo(
      inputBase({
        ahorroInicial: toCents(20_000),
        ahorroMensual: toCents(500),
        precioObjetivo: toCents(40_000),
        mesesMaximos: 60,
      }),
    );
    expect(resultado).toBe(40);
  });

  it('con crecimiento del precio, tarda más que sin crecimiento', () => {
    const sinCrecimiento = mesesHastaObjetivo(inputBase({ mesesMaximos: 120 }));
    const conCrecimiento = mesesHastaObjetivo(
      inputBase({
        crecimientoAnualPrecio: 0.05,
        mesesMaximos: 120,
      }),
    );
    // conCrecimiento puede ser null si no llega en el horizonte, o mayor
    if (sinCrecimiento !== null && conCrecimiento !== null) {
      expect(conCrecimiento).toBeGreaterThanOrEqual(sinCrecimiento);
    }
  });
});
