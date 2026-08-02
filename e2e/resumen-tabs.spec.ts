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

  await page.goto('/#/resumen');
  await expect(page.getByRole('heading', { name: 'Primero, completa Tus datos' })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);

  await completarDatosMinimos(page);
  await page.goto('/#/resumen');
  await expect(page.getByText('Resumen en tiempo real', { exact: true })).toBeVisible();
  await expect(
    page
      .locator('nav:visible')
      .first()
      .getByRole('link', { name: /Mi plan/i }),
  ).toBeVisible();
  const irAMiPlan = page.getByRole('link', { name: 'Ir a mi plan →' });
  await expect(irAMiPlan).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Qué precio puedes asumir hoy' }),
  ).toBeVisible();
  await irAMiPlan.click();
  await expect(page).toHaveURL(/#\/plan-hipotecario$/);
  await expect(page.getByText(/La cuota sería asumible/i)).toHaveCount(0);
});

test('Mi plan hipotecario reúne el desembolso y la meta de ahorro', async ({ page }) => {
  await completarDatosMinimos(page);
  await page.goto('/#/plan-hipotecario');

  const navegacion = page.locator('nav:visible').first();
  await expect(navegacion.getByRole('link', { name: /Capacidad/i })).toHaveCount(0);
  await expect(navegacion.getByRole('link', { name: /^Meta$/i })).toHaveCount(0);
  await expect(page.getByText('Precio a alcanzar', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Precio objetivo', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver escala completa →' })).toBeVisible();

  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { level: 3, name: 'Todo lo que necesitas para comprar' }),
  ).toBeVisible();
  await expect(page.getByText('Ahorro y progreso hacia el objetivo')).toBeVisible();
  await expect(page.getByText('Estado del objetivo')).toHaveCount(0);
  await expect(page.getByText('Ahorro utilizable')).toHaveCount(0);
  await expect(page.getByText('Factor limitante')).toHaveCount(0);
  await expect(page.getByText('Capacidad actual / mes', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Necesito', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Tengo', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Falta', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { level: 3, name: 'Qué precio puedes asumir hoy' }),
  ).toHaveCount(0);
  await expect(page.getByText('Cada barra se compara con')).toHaveCount(0);
  await expect(page.getByText(/Reparto mensual/i)).toHaveCount(0);
});

test('las rutas antiguas abren el Resumen unificado', async ({ page }) => {
  await completarDatosMinimos(page);
  await page.goto('/#/capacidad');
  await expect(page).toHaveURL(/#\/plan-hipotecario$/);
  await expect(page.getByText('Ahorro y progreso hacia el objetivo')).toBeVisible();

  await page.goto('/#/meta');
  await expect(page).toHaveURL(/#\/plan-hipotecario$/);
  await expect(page.getByText('Ahorro y progreso hacia el objetivo')).toBeVisible();
});
