import * as path from 'path';
import * as os from 'os';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

function navegacionVisible(pagina: Page) {
  return pagina.locator('nav:visible').first();
}

async function abrirAjustes(pagina: Page) {
  await pagina
    .getByRole('button', { name: /ajustes/i })
    .first()
    .click();
  await expect(pagina.getByRole('dialog', { name: 'Panel de ajustes' })).toBeVisible();
}

/**
 * §9.4 Smoke test 1 — DoD #16.
 * Rellena un campo del perfil, recarga la página y verifica que el valor persiste.
 */
test('los datos del perfil persisten al recargar la página', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Titulares' }).click();
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
  await page.getByRole('tab', { name: 'Titulares' }).click();
  await expect(page.getByLabel('Ahorros actuales')).toBeVisible();

  // El valor debe mantenerse con el formato monetario español.
  await expect(page.getByLabel('Ahorros actuales')).toHaveValue(/50\.000,00/);
});

/**
 * §9.4 Smoke test 2.
 * El Resumen concentra la escala simplificada de capacidad de compra.
 */
test('el Resumen muestra la escala simplificada de capacidad', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Titulares' }).click();
  const ingreso = page.getByLabel('Neto por paga').first();
  await ingreso.fill('2500');
  await ingreso.press('Tab');
  await page.waitForTimeout(700);

  await navegacionVisible(page)
    .getByRole('link', { name: /Resumen/ })
    .click();

  await expect(page.getByText('Capacidad de compra estimada', { exact: true })).toBeVisible();
  await expect(page.getByText('Compra cómoda', { exact: true })).toBeVisible();
  await expect(page.getByText('Límite bancario', { exact: true })).toBeVisible();
  await expect(page.getByText('Mi plan hipotecario', { exact: true })).toHaveCount(0);
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
  await page.getByRole('button', { name: /copia de seguridad/ }).click();
  const descarga = await descargaPromesa;

  const rutaTmp = path.join(os.tmpdir(), 'hipotecas-smoke.json');
  await descarga.saveAs(rutaTmp);

  // Paso 3: restablecer los datos
  await page.getByRole('button', { name: 'Restablecer datos' }).click();
  await page.getByRole('button', { name: 'Sí, restablecer' }).click();
  const dialogoInicial = page.getByRole('dialog', { name: '¿Dónde quieres comprar?' });
  await dialogoInicial.getByLabel('Comunidad autónoma').selectOption('Aragón');
  await dialogoInicial.getByRole('button', { name: 'Continuar' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('hipotecas-v1');
        if (raw === null) return null;
        return (JSON.parse(raw) as { preferencias?: { ccaa?: string } }).preferencias?.ccaa;
      }),
    )
    .toBe('Aragón');
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
