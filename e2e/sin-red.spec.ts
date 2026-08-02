import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const ORIGEN_LOCAL = 'http://127.0.0.1:';
const ENDPOINT_INE = 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/24457?nult=1&tip=A';

/**
 * Solo hay una barra de navegación visible a la vez: el raíl lateral en
 * horizontal y la barra inferior en vertical. La otra está en `display:none`,
 * así que hay que quedarse con la visible.
 */
function navegacionVisible(pagina: Page) {
  return pagina.locator('nav:visible').first();
}

/**
 * La etiqueta corta de la barra inferior es siempre un fragmento de la larga
 * del raíl, así que una expresión regular sirve para las dos disposiciones.
 */
const SECCIONES = ['Resumen', 'Ofertas', 'Amortización'];

/**
 * El dist solo puede consultar el endpoint estadístico oficial del INE.
 * Cualquier otra petición externa seguiría siendo una fuga accidental.
 */
test('el artefacto compilado solo consulta el endpoint autorizado del INE', async ({ page }) => {
  const externas: string[] = [];
  page.on('request', (peticion) => {
    const url = peticion.url();
    const esPermitida =
      url.startsWith(ORIGEN_LOCAL) ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      url === ENDPOINT_INE;
    if (!esPermitida) externas.push(`${peticion.method()} ${url}`);
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Cuéntanos tu situación' }),
  ).toBeVisible();

  // Recorrer las secciones: si alguna trajera una fuente o un icono remoto,
  // aparecería al renderizarla, no en la carga inicial.
  for (const seccion of SECCIONES) {
    await navegacionVisible(page)
      .getByRole('link', { name: new RegExp(seccion, 'i') })
      .click();
    await expect(page.locator('main')).toBeVisible();
  }

  expect(externas, `Peticiones externas detectadas:\n${externas.join('\n')}`).toEqual([]);
});

test('el enlace profundo por hash sobrevive a un recargado', async ({ page }) => {
  await page.goto('/#/escala');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Comparativa por precio' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Comparativa por precio' }),
  ).toBeVisible();
});
