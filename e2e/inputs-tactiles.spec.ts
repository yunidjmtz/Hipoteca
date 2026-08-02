import { expect, test } from '@playwright/test';

test('los importes y las edades se sustituyen al editarlos en una tableta', async ({ page }) => {
  await page.goto('/');

  const precio = page.getByLabel('Precio objetivo');
  await precio.click();
  await expect(precio).toHaveValue('');
  await page.keyboard.type('180000');
  await page.keyboard.press('Tab');
  await expect(precio).toHaveValue(/180\.000,00/);

  await page.getByRole('button', { name: 'Titulares' }).click();
  const edad = page.getByLabel('Edad').first();
  await edad.click();
  await expect(edad).toHaveValue('');
  await page.keyboard.type('42');
  await page.keyboard.press('Tab');
  await expect(edad).toHaveValue('42');
});

test('los campos editables no provocan el zoom automático de Safari en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const precio = page.getByLabel('Precio objetivo');
  await expect(precio).toHaveCSS('font-size', '16px');
});
