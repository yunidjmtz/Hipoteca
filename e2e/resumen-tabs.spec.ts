import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function completarDatosMinimos(page: Page) {
  await page.goto('/');

  const precio = page.getByLabel('Precio objetivo');
  await precio.click();
  await precio.fill('200000');
  await precio.press('Tab');
  await expect(precio).toHaveValue(/200\.000,00/);

  await page.getByRole('tab', { name: 'Titulares' }).click();
  const ingreso = page.getByLabel('Neto por paga').first();
  await ingreso.click();
  await ingreso.fill('2500');
  await ingreso.press('Tab');
  await expect(ingreso).toHaveValue(/2500,00/);

  // El estado se guarda con debounce; las pruebas posteriores recargan la ruta.
  await page.waitForTimeout(700);
}

test('el resumen centraliza las finanzas y la capacidad de compra', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Mis finanzas', { exact: true })).toHaveCount(0);

  await page.goto('/#/resumen');
  await expect(page.getByRole('heading', { name: 'Primero, completa Mis finanzas' })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);

  await completarDatosMinimos(page);
  await page.goto('/#/resumen');
  await expect(page.getByText('Mis finanzas', { exact: true })).toBeVisible();
  await expect(page.locator('nav:visible').first().getByRole('link', { name: /Mi plan/i })).toHaveCount(0);
  await expect(page.getByText('Mi plan hipotecario', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Capacidad de compra estimada', { exact: true })).toBeVisible();
  await expect(page.getByText('Compra cómoda', { exact: true })).toBeVisible();
  await expect(page.getByText('Límite bancario', { exact: true })).toBeVisible();
});

test('las rutas retiradas abren el Resumen unificado', async ({ page }) => {
  await completarDatosMinimos(page);
  for (const ruta of ['plan-hipotecario', 'capacidad', 'meta', 'escala']) {
    await page.goto(`/#/${ruta}`);
    await expect(page).toHaveURL(/#\/resumen$/);
    await expect(page.getByText('Capacidad de compra estimada', { exact: true })).toBeVisible();
  }
});
