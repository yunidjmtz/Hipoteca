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

  // Navegar al Resumen.
  await navegacionVisible(page)
    .getByRole('link', { name: /Resumen/ })
    .click();

  // La fila compacta del Resumen muestra el precio objetivo.
  await expect(page.getByRole('cell', { name: '200.000,00 €', exact: true }).first()).toBeVisible();

  // Abrir el plan y, desde él, la Escala de precios.
  await navegacionVisible(page)
    .getByRole('link', { name: /Mi plan/i })
    .click();
  await page.getByRole('link', { name: /Ver escala de precios/i }).click();

  // La fila del precio objetivo lleva el marcador ◀
  await expect(page.getByText('◀')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Precio €' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Mínimo €' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Impuestos €' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Ratio %' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Estado' })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: /^200 K/ })).toBeVisible();
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
