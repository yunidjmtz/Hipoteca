import { describe, expect, it, vi } from 'vitest';
import { fetchAverageMortgageTin, parseAverageMortgageTin } from '@/services/ineMortgageRate';

const PAYLOAD_INE = [
  {
    COD: 'HPT64407',
    Nombre: 'Viviendas. Tipo de interés medio. Total Nacional. Base nueva. Mensual. Fijo.',
    Data: [{ Fecha: '2026-05-01T00:00:00.000+02:00', Valor: 2.96 }],
  },
  {
    COD: 'HPT64406',
    Nombre: 'Viviendas. Tipo de interés medio. Total Nacional. Base nueva. Mensual. Variable.',
    Data: [{ Fecha: '2026-05-01T00:00:00.000+02:00', Valor: 3 }],
  },
  {
    COD: 'HPT64408',
    Nombre: 'Viviendas. Tipo de interés medio. Total Nacional. Base nueva. Mensual. Total.',
    Data: [{ Fecha: '2026-05-01T00:00:00.000+02:00', Valor: 2.98 }],
  },
];

function crearAlmacenamiento() {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
  };
}

describe('referencia hipotecaria del INE', () => {
  it('selecciona la serie total exacta y convierte el porcentaje a decimal', () => {
    const resultado = parseAverageMortgageTin(PAYLOAD_INE, '2026-07-31T12:00:00.000Z');

    expect(resultado.rate).toBe(0.0298);
    expect(resultado.period).toBe('2026-05');
    expect(resultado.source).toBe('INE');
  });

  it('no confunde Total Nacional con el tipo fijo o variable', () => {
    const resultado = parseAverageMortgageTin(
      [...PAYLOAD_INE].reverse(),
      '2026-07-31T12:00:00.000Z',
    );

    expect(resultado.rate).toBe(0.0298);
  });

  it('rechaza observaciones con fecha o mes inválidos', () => {
    const fechaNoTexto = [{ ...PAYLOAD_INE[2], Data: [{ Fecha: 20260501, Valor: 2.98 }] }];
    const mesInexistente = [
      { ...PAYLOAD_INE[2], Data: [{ Fecha: '2026-99-01T00:00:00Z', Valor: 2.98 }] },
    ];

    expect(() => parseAverageMortgageTin(fechaNoTexto, '2026-08-16T00:00:00Z')).toThrow(
      /tipo medio/i,
    );
    expect(() => parseAverageMortgageTin(mesInexistente, '2026-08-16T00:00:00Z')).toThrow(
      /tipo medio/i,
    );
  });

  it('reutiliza durante 24 horas el dato guardado en caché', async () => {
    const storage = crearAlmacenamiento();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(PAYLOAD_INE), { status: 200 }));

    const primera = await fetchAverageMortgageTin({
      now: new Date('2026-07-31T12:00:00.000Z'),
      fetchFn,
      storage,
    });
    const segunda = await fetchAverageMortgageTin({
      now: new Date('2026-07-31T13:00:00.000Z'),
      fetchFn,
      storage,
    });

    expect(primera.fromCache).toBe(false);
    expect(segunda.fromCache).toBe(true);
    expect(segunda.rate).toBe(0.0298);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('conserva una caché antigua si el INE no responde', async () => {
    const storage = crearAlmacenamiento();
    const respuestaCorrecta = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(PAYLOAD_INE), { status: 200 }));
    await fetchAverageMortgageTin({
      now: new Date('2026-07-29T12:00:00.000Z'),
      fetchFn: respuestaCorrecta,
      storage,
    });

    const respuestaFallida = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const resultado = await fetchAverageMortgageTin({
      now: new Date('2026-07-31T12:00:00.000Z'),
      fetchFn: respuestaFallida,
      storage,
    });

    expect(resultado.rate).toBe(0.0298);
    expect(resultado.fromCache).toBe(true);
    expect(resultado.stale).toBe(true);
  });

  it('no usa como respaldo una caché con tipo o periodo corruptos', async () => {
    const storage = crearAlmacenamiento();
    storage.setItem(
      'hipotecas-ine-tin-v1',
      JSON.stringify({
        rate: -0.5,
        period: '2026-99',
        source: 'INE',
        consultedAt: 'fecha-invalida',
      }),
    );
    const respuestaFallida = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      fetchAverageMortgageTin({
        now: new Date('2026-08-16T12:00:00.000Z'),
        fetchFn: respuestaFallida,
        storage,
      }),
    ).rejects.toThrow(/503/);
  });
});
