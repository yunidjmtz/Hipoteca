import * as path from 'path';
import * as os from 'os';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

function navegacionVisible(pagina: Page) {
  return pagina.locator('nav:visible').first();
}

async function abrirAjustes(pagina: Page) {
  await pagina
    .getByRole('button', { name: /ajustes/i })
    .first()
    .click();
  await expect(pagina.getByRole('complementary', { name: 'Panel de ajustes' })).toBeVisible();
}

/**
 * §9.4 Smoke test 1 — DoD #16.
 * Rellena un campo del perfil, recarga la página y verifica que el valor persiste.
 */
test('los datos del perfil persisten al recargar la página', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Titulares' }).click();
  await expect(page.getByLabel('Ahorros actuales')).toBeVisible();

  // Cambiar ahorros a 50.000 €
  const inputAhorros = page.getByLabel('Ahorros actuales');
  await inputAhorros.click();
  await inputAhorros.fill('50000');
  await page.keyboard.press('Tab');

  // Esperar al debounce de 500 ms
  await page.waitForTimeout(700);

  // Recargar la página desde el mismo hash
  await page.reload();
  await page.getByRole('button', { name: 'Titulares' }).click();
  await expect(page.getByLabel('Ahorros actuales')).toBeVisible();

  // El valor debe mantenerse con el formato monetario español.
  await expect(page.getByLabel('Ahorros actuales')).toHaveValue(/50\.000,00/);
});

/**
 * §9.4 Smoke test 2.
 * Cambiar el precio objetivo actualiza el Resumen y la Escala de forma coherente.
 */
test('cambiar el precio objetivo actualiza el Resumen y la Escala', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Precio objetivo')).toBeVisible();

  // Cambiar precio objetivo a 200.000 €
  const inputPrecio = page.getByLabel('Precio objetivo');
  await inputPrecio.click();
  await inputPrecio.fill('200000');
  await page.keyboard.press('Tab');

  // Navegar al Resumen
  await navegacionVisible(page)
    .getByRole('link', { name: /Resumen/ })
    .click();

  // La fila compacta del Resumen muestra el precio objetivo.
  await expect(page.getByRole('cell', { name: '200.000,00 €', exact: true }).first()).toBeVisible();

  // Abrir la Escala de precios desde el resumen
  await page.getByRole('link', { name: /Ver completa/i }).click();

  // La fila del precio objetivo lleva el marcador ◀
  await expect(page.getByText('◀')).toBeVisible();
});

/**
 * §9.4 Smoke test 3 — DoD #17.
 * Exportar → restablecer → importar restaura exactamente el estado guardado.
 */
test('exportar → restablecer → importar restaura el estado', async ({ page }) => {
  // Paso 1: establecer un precio objetivo distintivo
  await page.goto('/');
  await expect(page.getByLabel('Precio objetivo')).toBeVisible();

  const inputPrecio = page.getByLabel('Precio objetivo');
  await inputPrecio.click();
  await inputPrecio.fill('175000');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(700);

  // Paso 2: exportar los datos desde Ajustes
  await abrirAjustes(page);

  const descargaPromesa = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exportar datos/ }).click();
  const descarga = await descargaPromesa;

  const rutaTmp = path.join(os.tmpdir(), 'hipotecas-smoke.json');
  await descarga.saveAs(rutaTmp);

  // Paso 3: restablecer los datos
  await page.getByRole('button', { name: 'Restablecer datos' }).click();
  await page.getByRole('button', { name: 'Sí, restablecer' }).click();
  await page.getByRole('button', { name: 'Cerrar ajustes' }).click();

  // Verificar que el estado volvió limpio (sin precio de demostración)
  await page.goto('/');
  await expect(page.getByLabel('Precio objetivo')).toHaveValue(/0,00/);

  // Paso 4: importar el archivo exportado
  await abrirAjustes(page);
  const inputFile = page.locator('input[type="file"][accept=".json"]');
  await inputFile.setInputFiles(rutaTmp);

  // Mensaje de éxito de la importación
  await expect(page.getByText('Datos importados correctamente.')).toBeVisible();

  // Verificar que el estado se restauró (precio = 175.000 €)
  await page.goto('/');
  await expect(page.getByLabel('Precio objetivo')).toHaveValue(/175\.000,00/);
});
