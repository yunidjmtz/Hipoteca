import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function completarDatosMinimos(page: Page) {
  await page.goto('/');

  const precio = page.getByLabel('Precio objetivo');
  await precio.click();
  await precio.fill('200000');
  await precio.press('Tab');
  await expect(precio).toHaveValue(/200\.000,00/);

  await page.getByRole('button', { name: 'Titulares' }).click();
  const ingreso = page.getByLabel('Neto por paga').first();
  await ingreso.click();
  await ingreso.fill('2500');
  await ingreso.press('Tab');
  await expect(ingreso).toHaveValue(/2500,00/);

  // El estado se guarda con debounce; las pruebas posteriores recargan la ruta.
  await page.waitForTimeout(700);
}

test('el resumen centraliza la información mensual y el precio objetivo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Resumen en tiempo real', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Tu precio objetivo', { exact: true })).toHaveCount(0);

  await page.goto('/#/resumen');
  await expect(page.getByRole('heading', { name: 'Primero, completa Tus datos' })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);

  await completarDatosMinimos(page);
  await page.goto('/#/resumen');
  await expect(page.getByText('Resumen en tiempo real', { exact: true })).toBeVisible();
  await expect(page.getByText('Tu precio objetivo', { exact: true })).toBeVisible();
});

test('Resumen muestra Meta, Capacidad y Escala en una sola lectura vertical', async ({ page }) => {
  await completarDatosMinimos(page);
  await page.goto('/#/resumen');

  const navegacion = page.locator('nav:visible').first();
  await expect(navegacion.getByRole('link', { name: /Capacidad/i })).toHaveCount(0);
  await expect(navegacion.getByRole('link', { name: /^Meta$/i })).toHaveCount(0);

  const meta = page.getByRole('heading', {
    level: 2,
    name: 'Ahorro y progreso hacia el objetivo',
  });
  const capacidad = page.getByRole('heading', {
    level: 3,
    name: 'Qué precio puedes asumir hoy',
  });
  const escala = page.getByRole('heading', {
    level: 3,
    name: 'Alrededor del objetivo',
  });

  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(meta).toBeVisible();
  await expect(page.getByText('Estado del objetivo')).toHaveCount(0);
  await expect(page.getByText('Ahorro utilizable')).toHaveCount(0);
  await expect(page.getByText('Factor limitante')).toHaveCount(0);
  await expect(page.getByText('Tu techo real hoy')).toBeVisible();
  await expect(page.getByText('Cada barra se compara con')).toBeVisible();
  await expect(page.getByText('35 %', { exact: true })).toBeVisible();
  await expect(page.getByText('30 %', { exact: true })).toBeVisible();
  await expect(capacidad).toBeVisible();
  await expect(escala).toBeVisible();

  const cajaMeta = await meta.boundingBox();
  const cajaCapacidad = await capacidad.boundingBox();
  const cajaEscala = await escala.boundingBox();
  expect(cajaMeta?.y).toBeLessThan(cajaCapacidad?.y ?? 0);
  expect(cajaCapacidad?.y).toBeLessThan(cajaEscala?.y ?? 0);
});

test('las rutas antiguas abren el Resumen unificado', async ({ page }) => {
  await completarDatosMinimos(page);
  await page.goto('/#/capacidad');
  await expect(page).toHaveURL(/#\/resumen$/);
  await expect(page.getByText('Tu techo real hoy')).toBeVisible();

  await page.goto('/#/meta');
  await expect(page).toHaveURL(/#\/resumen$/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Ahorro y progreso hacia el objetivo' }),
  ).toBeVisible();
});
