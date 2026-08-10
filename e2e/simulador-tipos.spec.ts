import { expect, test } from './fixtures';

test('añadir una oferta abre su simulador', async ({ page }) => {
  await page.goto('/#/ofertas/vivienda');
  await page.getByLabel('Nombre del inmueble').fill('Piso para financiar');
  await page.getByLabel('Dirección o referencia').fill('Calle Ejemplo, 1');
  await page.getByLabel('Precio de venta').fill('250000');
  await page.getByRole('button', { name: 'Guardar vivienda' }).click();
  await page.goto('/#/hipoteca');

  await page.getByRole('button', { name: '+ Añadir Oferta' }).click();

  await expect(page).toHaveURL(/#\/hipoteca\/simulador\?guardar=1&vivienda=/);
  await expect(page.getByText('Nueva oferta bancaria')).toBeVisible();
});

test('una vivienda compara el precio de venta con su reforma', async ({ page }) => {
  await page.goto('/#/ofertas');
  await page.getByRole('button', { name: /añadir vivienda/i }).click();
  await expect(page).toHaveURL(/#\/ofertas\/vivienda$/);

  await page.getByLabel('Nombre del inmueble').fill('Piso reformado');
  await page.getByLabel('Dirección o referencia').fill('Calle Ejemplo, 12');
  await page.getByLabel('Precio de venta').fill('170000');
  await page.getByLabel('Metros cuadrados').fill('85');
  await page.getByLabel('Exterior').check();
  await page.getByRole('button', { name: /agregar reforma/i }).click();
  const modalReformas = page.getByRole('dialog', { name: 'Añadir reforma' });
  await modalReformas.getByRole('textbox', { name: 'Reforma' }).fill('Reforma integral');
  await modalReformas.getByLabel('Coste aprox.').fill('70000');
  await modalReformas.getByRole('button', { name: 'Guardar reforma' }).click();
  await page.getByRole('button', { name: 'Guardar vivienda' }).click();

  const viviendaGuardada = page.getByRole('article').filter({ hasText: 'Piso reformado' });
  await expect(
    viviendaGuardada.getByRole('heading', { name: 'Piso reformado', exact: true }),
  ).toBeVisible();
  await expect(viviendaGuardada.getByText('Calle Ejemplo, 12')).toBeVisible();
  await expect(viviendaGuardada.getByText('240.000,00 €')).toBeVisible();
  await expect(viviendaGuardada.getByText('85 m²')).toBeVisible();
  await expect(viviendaGuardada.getByText('Exterior')).toBeVisible();
});

test('seleccionar Mixto inicializa y calcula el tramo fijo mostrado', async ({ page }) => {
  await page.goto('/#/hipoteca/simulador');

  const precio = page.getByLabel('Precio de compra');
  await precio.click();
  await precio.fill('250000');
  await page.keyboard.press('Tab');

  await page.getByRole('button', { name: 'Mixto', exact: true }).click();

  await expect(page.getByLabel('TIN período fijo')).toHaveValue(/2,50/);
  await expect(page.getByLabel('Años del período fijo')).toHaveValue('5');
  const bloqueFijo = page.getByText('Durante el período fijo pagarás').locator('..');
  await expect(bloqueFijo).toContainText('5 años al 2,50');
  await expect(bloqueFijo).toContainText('897,23');
});

test('una variable identifica la cuota como inicial hasta la revisión', async ({ page }) => {
  await page.goto('/#/hipoteca/simulador');
  await page.getByRole('button', { name: 'Variable', exact: true }).click();

  await expect(page.getByText('Cuota inicial hasta la próxima revisión')).toBeVisible();
  await expect(page.getByText(/La cuota se recalculará en cada revisión/)).toBeVisible();
});
