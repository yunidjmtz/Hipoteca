import { expect, test } from './fixtures';

test.use({ serviceWorkers: 'block' });

test('la vivienda solo ofrece importación desde captura', async ({ page }) => {
  await page.goto('/#/ofertas/vivienda');
  await expect(page.getByRole('button', { name: 'Importar captura' })).toBeVisible();
  await expect(page.getByText(/capturas de anuncios de Fotocasa o Idealista/i)).toBeVisible();
  await page.getByRole('button', { name: 'Ver ejemplos' }).click();
  await expect(page.getByRole('dialog', { name: 'Fotocasa e Idealista' })).toBeVisible();
  await expect(page.getByAltText(/Idealista con datos borrosos/i)).toBeVisible();
  await expect(page.getByAltText(/Fotocasa con datos borrosos/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pegar enlace' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pegar datos' })).toHaveCount(0);
});

test('el guardado manual sigue disponible', async ({ page }) => {
  await page.goto('/#/ofertas/vivienda');
  await page.getByLabel('Nombre del inmueble').fill('Piso manual');
  await page.getByLabel('Dirección o referencia').fill('Calle Mayor, 1');
  await page.getByLabel('Precio de venta').fill('180000');
  await page.getByRole('button', { name: 'Guardar vivienda' }).click();
  await expect(page).toHaveURL(/#\/ofertas$/);
  await expect(page.getByRole('heading', { name: 'Piso manual', exact: true })).toBeVisible();
});

test('el OCR local rellena una captura sin API', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/#/ofertas/vivienda');
  const captura = await page.evaluate<string>(`(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1500;
    canvas.height = 900;
    const contexto = canvas.getContext('2d');
    if (contexto === null) throw new Error('Canvas no disponible');
    contexto.fillStyle = 'white';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.fillStyle = 'black';
    contexto.font = '72px Arial';
    ['199.900 €', '75 m²', '3 habitaciones', 'Exterior con ascensor'].forEach((linea, indice) =>
      contexto.fillText(linea, 80, 150 + indice * 130),
    );
    return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'anuncio.png', mimeType: 'image/png', buffer: Buffer.from(captura, 'base64'),
  });
  await expect(page.getByLabel('Precio de venta')).toHaveValue(/199\.900,00/, { timeout: 60_000 });
  await expect(page.getByLabel('Metros cuadrados')).toHaveValue('75');
  await expect(page.getByLabel('Habitaciones')).toHaveValue('3');
  await expect(page.getByLabel('Exterior')).toBeChecked();
});
