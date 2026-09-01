import type { ConsoleMessage, Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function prepararAlternativas(page: Page) {
  await page.evaluate(() => {
    const raw = localStorage.getItem('hipotecas-v1');
    if (raw === null) throw new Error('No existe estado inicial');
    const estado = JSON.parse(raw) as Record<string, unknown> & {
      perfil: {
        titulares: Array<{ netoPorPaga: number }>;
        ahorrosActuales: number;
        ahorroMensualPrevisto: number;
      };
      viviendas: unknown[];
      ofertas: unknown[];
      escenarioSimulador: Record<string, unknown>;
    };

    estado.perfil.titulares[0]!.netoPorPaga = 320_000;
    estado.perfil.ahorrosActuales = 8_000_000;
    estado.perfil.ahorroMensualPrevisto = 80_000;
    estado.viviendas = [
      {
        id: 'vivienda-centro',
        nombre: 'Piso Centro',
        fecha: '2026-08-01',
        direccion: 'Calle Mayor, 12',
        anuncioUrl: '',
        telefono: '',
        sourceUrl: '',
        sourceListingId: '',
        rawListingText: '',
        priceHistory: [],
        precioVenta: 20_000_000,
        presupuestoReforma: 0,
        reforma: '',
        superficieM2: 82,
        habitaciones: 3,
        banos: 2,
        ibiAnual: 52_000,
        comunidadMensual: 8_000,
        estadoVivienda: 'usada',
        destino: 'habitual',
        esVpoEspecial: false,
        esExterior: true,
        tieneTrastero: false,
        tieneGaraje: false,
        reformas: [{ id: 'reforma-1', concepto: 'Cocina', costeEstimado: 1_200_000 }],
        notas: '',
      },
      {
        id: 'vivienda-parque',
        nombre: 'Ático del Parque',
        fecha: '2026-08-02',
        direccion: 'Paseo del Parque, 4',
        anuncioUrl: '',
        telefono: '',
        sourceUrl: '',
        sourceListingId: '',
        rawListingText: '',
        priceHistory: [],
        precioVenta: 23_500_000,
        presupuestoReforma: 0,
        reforma: '',
        superficieM2: 96,
        habitaciones: 3,
        banos: 2,
        ibiAnual: 64_000,
        comunidadMensual: 11_000,
        estadoVivienda: 'usada',
        destino: 'habitual',
        esVpoEspecial: false,
        esExterior: true,
        tieneTrastero: true,
        tieneGaraje: true,
        reformas: [],
        notas: '',
      },
      {
        id: 'vivienda-rio',
        nombre: 'Vivienda del Río',
        fecha: '2026-08-03',
        direccion: 'Avenida del Río, 8',
        anuncioUrl: '',
        telefono: '',
        sourceUrl: '',
        sourceListingId: '',
        rawListingText: '',
        priceHistory: [],
        precioVenta: 18_500_000,
        presupuestoReforma: 0,
        reforma: '',
        superficieM2: 74,
        habitaciones: 2,
        banos: 1,
        ibiAnual: 45_000,
        comunidadMensual: 6_500,
        estadoVivienda: 'usada',
        destino: 'habitual',
        esVpoEspecial: false,
        esExterior: false,
        tieneTrastero: true,
        tieneGaraje: false,
        reformas: [{ id: 'reforma-2', concepto: 'Baño', costeEstimado: 700_000 }],
        notas: '',
      },
    ];

    const escenarioBase = estado.escenarioSimulador;
    estado.ofertas = [
      {
        id: 'oferta-norte',
        viviendaId: 'vivienda-centro',
        banco: 'Banco Norte',
        nombre: 'Fija Premium',
        fecha: '2026-08-20',
        estado: 'fein_recibida',
        taeOficial: 0.032,
        notas: '',
        escenario: {
          ...escenarioBase,
          id: 'escenario-norte',
          titulo: 'Fija Premium',
          precioCompra: 20_000_000,
          valorTasacion: 20_000_000,
          importeSolicitado: 16_000_000,
          plazoAnios: 25,
          tipo: 'fija',
          tinFijo: 0.028,
          taeOficial: 0.032,
        },
      },
      {
        id: 'oferta-sur',
        viviendaId: 'vivienda-centro',
        banco: 'Banco Sur',
        nombre: 'Mixta Flexible',
        fecha: '2026-08-21',
        estado: 'preaprobada',
        taeOficial: 0.034,
        notas: '',
        escenario: {
          ...escenarioBase,
          id: 'escenario-sur',
          titulo: 'Mixta Flexible',
          precioCompra: 20_000_000,
          valorTasacion: 21_000_000,
          importeSolicitado: 16_000_000,
          plazoAnios: 30,
          tipo: 'mixta',
          mixtaTinFijo: 0.024,
          mixtaAniosFijos: 5,
          euribor: 0.021,
          diferencial: 0.0075,
          taeOficial: 0.034,
        },
      },
      {
        id: 'oferta-oeste',
        viviendaId: 'vivienda-centro',
        banco: 'Banco Oeste',
        nombre: 'Variable Bonificada',
        fecha: '2026-08-22',
        estado: 'estudio',
        taeOficial: 0.036,
        notas: '',
        escenario: {
          ...escenarioBase,
          id: 'escenario-oeste',
          titulo: 'Variable Bonificada',
          precioCompra: 20_000_000,
          valorTasacion: 20_500_000,
          importeSolicitado: 16_000_000,
          plazoAnios: 25,
          tipo: 'variable',
          euribor: 0.021,
          diferencial: 0.008,
          taeOficial: 0.036,
        },
      },
    ];
    localStorage.setItem('hipotecas-v1', JSON.stringify(estado));
  });
}

test('compara tres viviendas e hipotecas sin errores en móvil y tableta', async ({
  page,
}, testInfo) => {
  const errores: string[] = [];
  page.on('console', (mensaje: ConsoleMessage) => {
    if (mensaje.type() === 'error') errores.push(mensaje.text());
  });

  await prepararAlternativas(page);
  await page.goto('/#/comparador');
  // El cambio de hash mantiene la SPA viva; recargamos para que el proveedor
  // reconstruya su estado desde los datos de prueba recién guardados.
  await page.reload();

  const navegacion = page.locator('nav:visible').first();
  await expect(navegacion.getByRole('link', { name: /Comparador/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Viviendas/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Aún no has añadido ninguna alternativa.')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Comparación de viviendas' })).toHaveCount(0);

  for (const vivienda of ['Piso Centro', 'Ático del Parque', 'Vivienda del Río']) {
    await page.getByRole('button', { name: /Añadir vivienda/ }).click();
    const dialogo = page.getByRole('dialog', { name: 'Selecciona una vivienda' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: new RegExp(vivienda) }).click();
  }

  const tablaViviendas = page.getByRole('table', { name: 'Comparación de viviendas' });
  await expect(tablaViviendas).toBeVisible();
  await expect(tablaViviendas.getByRole('columnheader', { name: /Piso Centro/ })).toBeVisible();
  await expect(tablaViviendas.getByRole('rowheader', { name: /Precio por m²/ })).toBeVisible();
  await expect(
    tablaViviendas.getByRole('rowheader', { name: /^Coste completo Precio/ }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('comparador-viviendas.png'), fullPage: true });

  await page.getByRole('tab', { name: /Hipotecas/ }).click();
  await expect(page).toHaveURL(/tipo=hipotecas/);
  await expect(page.getByRole('table', { name: 'Comparación de hipotecas' })).toHaveCount(0);
  for (const hipoteca of ['Banco Norte', 'Banco Sur', 'Banco Oeste']) {
    await page.getByRole('button', { name: /Añadir hipoteca/ }).click();
    const dialogo = page.getByRole('dialog', { name: 'Selecciona una hipoteca' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: new RegExp(hipoteca) }).click();
  }
  const tablaHipotecas = page.getByRole('table', { name: 'Comparación de hipotecas' });
  await expect(tablaHipotecas).toBeVisible();
  await expect(tablaHipotecas.getByRole('columnheader', { name: /Banco Norte/ })).toBeVisible();
  await expect(
    tablaHipotecas.getByRole('rowheader', { name: /Cuota en escenario adverso/ }),
  ).toBeVisible();
  await expect(tablaHipotecas.getByRole('rowheader', { name: /Coste real total/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('comparador-hipotecas.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
  const geometriaMovil = await page.evaluate<string>(`(() => {
    const tabla = document.querySelector('table[aria-label="Comparación de hipotecas"]');
    const contenedor = tabla?.parentElement;
    const primeraCabecera = tabla?.querySelector('tbody th[scope="row"]');
    const desplaza = contenedor != null && contenedor.scrollWidth > contenedor.clientWidth;
    const fija = primeraCabecera != null && getComputedStyle(primeraCabecera).position === 'sticky';
    return desplaza && fija ? 'OK' : 'ERROR';
  })()`);
  expect(geometriaMovil).toBe('OK');
  await page.screenshot({ path: testInfo.outputPath('comparador-movil.png'), fullPage: true });

  expect(errores).toEqual([]);
});
