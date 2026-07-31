import { expect, test } from '@playwright/test';

test('seleccionar Mixto inicializa y calcula el tramo fijo mostrado', async ({ page }) => {
  await page.goto('/#/simulador');

  const precio = page.getByLabel('Precio de compra');
  await precio.click();
  await precio.fill('250000');
  await page.keyboard.press('Tab');

  const aportacion = page.getByLabel('Cuánto aportarás');
  await aportacion.click();
  await aportacion.fill('50000');
  await page.keyboard.press('Tab');

  await page.getByRole('button', { name: 'Mixto', exact: true }).click();

  await expect(page.getByLabel('TIN período fijo')).toHaveValue(/2,50/);
  await expect(page.getByLabel('Años del período fijo')).toHaveValue('5');
  const bloqueFijo = page.getByText('Durante el período fijo pagarás').locator('..');
  await expect(bloqueFijo).toContainText('5 años al 2,50');
  await expect(bloqueFijo).toContainText('897,23');
});

test('una variable identifica la cuota como inicial hasta la revisión', async ({ page }) => {
  await page.goto('/#/simulador');
  await page.getByRole('button', { name: 'Variable', exact: true }).click();

  await expect(page.getByText('Cuota inicial hasta la próxima revisión')).toBeVisible();
  await expect(page.getByText(/La cuota se recalculará en cada revisión/)).toBeVisible();
});
