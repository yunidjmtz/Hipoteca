import { defineConfig, devices } from '@playwright/test';

const PUERTO = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const BASE = `http://127.0.0.1:${PUERTO}/`;

/**
 * Los E2E se ejecutan siempre contra el `dist` servido por `vite preview`,
 * no contra el servidor de desarrollo: la comprobación de «cero peticiones de
 * red» del DoD de la Fase 0 solo tiene sentido sobre el artefacto compilado.
 *
 * El dispositivo por defecto es una tableta, que es el destino real de la app.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  },
  projects: [
    { name: 'tableta-horizontal', use: { ...devices['iPad (gen 7) landscape'] } },
    { name: 'tableta-vertical', use: { ...devices['iPad (gen 7)'] } },
  ],
  webServer: {
    // `--host 127.0.0.1` es necesario: por defecto `vite preview` escucha en
    // localhost, que en Windows resuelve a ::1, y Playwright sondea la IPv4.
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PUERTO} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
