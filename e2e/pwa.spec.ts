import { expect, test } from './fixtures';

test('publica un manifiesto instalable con los iconos necesarios', async ({ page, request }) => {
  await page.goto('/');

  const enlaceManifiesto = page.locator('link[rel="manifest"]');
  await expect(enlaceManifiesto).toHaveCount(1);

  const href = await enlaceManifiesto.getAttribute('href');
  expect(href).toBeTruthy();

  const respuesta = await request.get(href!);
  expect(respuesta.ok()).toBe(true);

  const manifiesto = (await respuesta.json()) as {
    name: string;
    display: string;
    icons: { sizes: string; purpose?: string }[];
  };

  expect(manifiesto.name).toBe('Mi Hipoteca');
  expect(manifiesto.display).toBe('standalone');
  expect(manifiesto.icons.some((icono) => icono.sizes === '192x192')).toBe(true);
  expect(manifiesto.icons.some((icono) => icono.sizes === '512x512')).toBe(true);
  expect(manifiesto.icons.some((icono) => icono.purpose === 'maskable')).toBe(true);
});

test('registra la aplicación y prepara la interfaz para abrirla sin conexión', async ({ page }) => {
  await page.goto('/');

  const registro = await page.evaluate<{
    scope: string;
    estado: string | null;
    recursosGuardados: string[];
  } | null>(`
    (async () => {
      if (!('serviceWorker' in navigator)) return null;
      const listo = await navigator.serviceWorker.ready;
      const activo = listo.active;
      if (activo && activo.state !== 'activated') {
        await new Promise((resolver) => {
          activo.addEventListener('statechange', () => {
            if (activo.state === 'activated') resolver(undefined);
          });
        });
      }
      const nombresCache = await caches.keys();
      const recursosGuardados = (
        await Promise.all(
          nombresCache.map(async (nombre) => {
            const cache = await caches.open(nombre);
            return (await cache.keys()).map((peticion) => peticion.url);
          }),
        )
      ).flat();
      return {
        scope: listo.scope,
        estado: activo?.state ?? null,
        recursosGuardados,
      };
    })()
  `);

  expect(registro).not.toBeNull();
  expect(registro?.estado).toBe('activated');
  expect(registro?.scope).toMatch(/\/$/);
  expect(
    registro?.recursosGuardados.some((url) => new URL(url).pathname.endsWith('/index.html')),
  ).toBe(true);
  expect(registro?.recursosGuardados.some((url) => new URL(url).pathname.endsWith('.js'))).toBe(
    true,
  );
});
