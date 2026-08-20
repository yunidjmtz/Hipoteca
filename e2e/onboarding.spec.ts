import { expect, test } from '@playwright/test';

test('la configuración inicial explica cuándo la fiscalidad es genérica', async ({ page }) => {
  await page.goto('/');

  const dialogo = page.getByRole('dialog', { name: '¿Dónde quieres comprar?' });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByLabel('Comunidad autónoma')).toBeFocused();

  await dialogo.getByLabel('Comunidad autónoma').selectOption('Madrid');
  await expect(dialogo.getByRole('status')).toContainText('estimación genérica');
  await dialogo.getByRole('button', { name: 'Continuar con estimación genérica' }).click();

  await expect(dialogo).toBeHidden();
  const tutorial = page.getByRole('dialog', {
    name: 'Añade Mi Hipoteca a tu pantalla de inicio',
  });
  await expect(tutorial).toBeVisible();
  await expect(tutorial.getByRole('heading', { name: 'Android' })).toBeVisible();
  await expect(tutorial.getByRole('heading', { name: 'iPhone y iPad' })).toBeVisible();
  await tutorial.getByRole('button', { name: 'Entendido, empezar a usarla' }).click();
  await expect(tutorial).toBeHidden();
  await expect(page.getByText(/ITP del 8 % y un AJD del 1,5 %/)).toBeVisible();
});
