import { expect, test as base } from '@playwright/test';

interface Fixtures {
  configuracionInicial: void;
}

export const test = base.extend<Fixtures>({
  configuracionInicial: [
    async ({ page }, use) => {
      await page.goto('/');
      const dialogo = page.getByRole('dialog', { name: '¿Dónde quieres comprar?' });
      await expect(dialogo).toBeVisible();
      await dialogo.getByLabel('Comunidad autónoma').selectOption('Aragón');
      await dialogo.getByRole('button', { name: 'Continuar' }).click();
      await expect(dialogo).toBeHidden();
      const tutorial = page.getByRole('dialog', {
        name: 'Añade Mi Hipoteca a tu pantalla de inicio',
      });
      await expect(tutorial).toBeVisible();
      await tutorial.getByRole('button', { name: 'Entendido, empezar a usarla' }).click();
      await expect(tutorial).toBeHidden();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const raw = localStorage.getItem('hipotecas-v1');
            if (raw === null) return null;
            return (JSON.parse(raw) as { preferencias?: { ccaa?: string } }).preferencias?.ccaa;
          }),
        )
        .toBe('Aragón');
      await use();
    },
    { auto: true },
  ],
});

export { expect };
