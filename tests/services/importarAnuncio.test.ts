import { describe, expect, it, vi } from 'vitest';
import {
  esUrlIdealistaValida,
  importarAnuncioIdealista,
  normalizarAnuncioImportado,
  normalizarUrlIdealista,
} from '@/services/importarAnuncio';

const DATOS_IMPORTADOS = {
  fuente: 'idealista',
  url: 'https://www.idealista.com/inmueble/111994685/',
  titulo: 'Piso en venta en Vía Hispanidad',
  direccion: 'Vía Hispanidad, Bombarda - Monsalud, Zaragoza',
  precioEuros: 215_000,
  superficieM2: 105,
  habitaciones: 3,
  esExterior: true,
  tieneTrastero: false,
  tieneGaraje: false,
} as const;

describe('importación de anuncios', () => {
  it('solo acepta enlaces de fichas de Idealista por HTTPS', () => {
    expect(esUrlIdealistaValida(DATOS_IMPORTADOS.url)).toBe(true);
    expect(esUrlIdealistaValida('https://idealista.com/inmueble/123')).toBe(true);
    expect(esUrlIdealistaValida('https://idealista.com/venta-viviendas/zaragoza/')).toBe(false);
    expect(esUrlIdealistaValida('https://idealista.example/inmueble/123/')).toBe(false);
    expect(esUrlIdealistaValida('https://usuario@idealista.com/inmueble/123/')).toBe(false);
    expect(esUrlIdealistaValida('https://idealista.com:444/inmueble/123/')).toBe(false);
    expect(esUrlIdealistaValida('javascript:alert(1)')).toBe(false);
  });

  it('elimina parámetros y fragmentos antes de enviar o atribuir la procedencia', () => {
    expect(
      normalizarUrlIdealista(' https://www.idealista.com/inmueble/123/?utm_source=x#fotos '),
    ).toBe('https://www.idealista.com/inmueble/123/');
  });

  it('envía el enlace al endpoint propio y valida sus datos', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(DATOS_IMPORTADOS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(importarAnuncioIdealista(DATOS_IMPORTADOS.url, fetcher)).resolves.toEqual(
      DATOS_IMPORTADOS,
    );
    expect(fetcher).toHaveBeenCalledWith(
      '/.netlify/functions/importar-anuncio',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: DATOS_IMPORTADOS.url }),
      }),
    );
  });

  it('muestra el error explicativo del servidor', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Falta configurar el proveedor.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(importarAnuncioIdealista(DATOS_IMPORTADOS.url, fetcher)).rejects.toThrow(
      'Falta configurar el proveedor.',
    );
  });

  it('rechaza una respuesta atribuida a otro anuncio', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ ...DATOS_IMPORTADOS, url: 'https://idealista.com/inmueble/2/' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await expect(importarAnuncioIdealista(DATOS_IMPORTADOS.url, fetcher)).rejects.toThrow(
      'datos de otro anuncio',
    );
  });

  it('limita el tamaño de la respuesta y valida cotas antes del mapeo', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...DATOS_IMPORTADOS, habitaciones: 101 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Content-Length': '70000' },
      }),
    );

    await expect(importarAnuncioIdealista(DATOS_IMPORTADOS.url, fetcher)).rejects.toThrow(
      'respuesta no válida',
    );
  });

  it('conserva como desconocidas las características que el anuncio no acredita', () => {
    const datos = {
      fuente: DATOS_IMPORTADOS.fuente,
      url: DATOS_IMPORTADOS.url,
      titulo: DATOS_IMPORTADOS.titulo,
      direccion: DATOS_IMPORTADOS.direccion,
      precioEuros: DATOS_IMPORTADOS.precioEuros,
      superficieM2: DATOS_IMPORTADOS.superficieM2,
      habitaciones: DATOS_IMPORTADOS.habitaciones,
    };

    expect(normalizarAnuncioImportado(datos)).toEqual({
      sourcePortal: 'idealista',
      title: datos.titulo,
      address: datos.direccion,
      price: datos.precioEuros,
      builtArea: datos.superficieM2,
      rooms: datos.habitaciones,
    });
  });

  it('explica cómo activar la función cuando Vite devuelve un 404', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<!doctype html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );

    await expect(importarAnuncioIdealista(DATOS_IMPORTADOS.url, fetcher)).rejects.toThrow(
      'inicia la app con npm run dev:netlify',
    );
  });
});
