import { describe, expect, it } from 'vitest';
import { toCents, ZERO } from '@/core/money';
import { compararViviendas, PESOS_VIVIENDA } from '@/finance/housingComparison';
import type { ViviendaGuardada } from '@/domain/types';

function crearVivienda(
  id: string,
  precio: number,
  superficieM2: number,
  opciones: Partial<
    Pick<ViviendaGuardada, 'esExterior' | 'tieneGaraje' | 'tieneTrastero' | 'reformas'>
  > = {},
): ViviendaGuardada {
  return {
    id,
    nombre: `Vivienda ${id}`,
    fecha: '2026-08-02',
    direccion: `Calle ${id}`,
    anuncioUrl: '',
    precioVenta: toCents(precio),
    presupuestoReforma: ZERO,
    reforma: '',
    superficieM2,
    habitaciones: 0,
    esExterior: false,
    tieneTrastero: false,
    tieneGaraje: false,
    reformas: [],
    notas: '',
    ...opciones,
  };
}

describe('compararViviendas', () => {
  it('ordena primero la vivienda con mejor relación entre coste y prestaciones', () => {
    const cara = crearVivienda('cara', 240_000, 80);
    const inteligente = crearVivienda('inteligente', 180_000, 80, {
      esExterior: true,
      tieneGaraje: true,
    });

    const resultados = compararViviendas([cara, inteligente]);

    expect(resultados[0]?.vivienda.id).toBe('inteligente');
  });

  it('suma las reformas al coste total y al coste por m²', () => {
    const vivienda = crearVivienda('reforma', 180_000, 100, {
      reformas: [{ id: 'cocina', concepto: 'Cocina', costeEstimado: toCents(20_000) }],
    });

    const resultado = compararViviendas([vivienda])[0];

    expect(resultado?.costeTotal).toBe(toCents(200_000));
    expect(resultado?.costePorM2).toBe(2_000);
  });

  it('aplica de forma explícita los puntos de las características', () => {
    const completa = crearVivienda('completa', 200_000, 100, {
      esExterior: true,
      tieneGaraje: true,
      tieneTrastero: true,
    });

    const resultado = compararViviendas([completa])[0];

    expect(resultado?.desglose.exterior).toBe(PESOS_VIVIENDA.exterior);
    expect(resultado?.desglose.garaje).toBe(PESOS_VIVIENDA.garaje);
    expect(resultado?.desglose.trastero).toBe(PESOS_VIVIENDA.trastero);
    expect(resultado?.puntuacion).toBe(100);
  });

  it('no compara viviendas sin superficie porque no puede calcular su valor por m²', () => {
    const incompleta = crearVivienda('incompleta', 180_000, 0);
    const completa = crearVivienda('completa', 200_000, 100);

    const resultados = compararViviendas([incompleta, completa]);

    expect(resultados).toHaveLength(1);
    expect(resultados[0]?.vivienda.id).toBe('completa');
  });

  it('desempata a favor del menor coste total', () => {
    const pequena = crearVivienda('pequena', 100_000, 50);
    const grande = crearVivienda('grande', 200_000, 100);

    const resultados = compararViviendas([grande, pequena]);

    expect(resultados[0]?.vivienda.id).toBe('pequena');
  });
});
