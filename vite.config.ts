import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * La CSP de §2.1 vive literalmente en `index.html` y es la que viaja en el `dist`.
 * El servidor de desarrollo, en cambio, necesita el websocket de HMR
 * (`connect-src`) y el preámbulo inline de React Refresh (`script-src`).
 * Solo en `vite dev` se relaja; el artefacto compilado queda estricto.
 */
function cspDesarrollo(): Plugin {
  return {
    name: 'csp-desarrollo',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace(
          'connect-src https://servicios.ine.es',
          "connect-src 'self' https://servicios.ine.es ws: wss:",
        )
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
    },
  };
}

export default defineConfig({
  // Hosting estático cualquiera: rutas relativas + router por hash (§2.1).
  base: './',
  plugins: [react(), tailwindcss(), cspDesarrollo()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // Cualquier activo debe acabar dentro del dist: nada de referencias externas.
    assetsInlineLimit: 4096,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // El umbral del 90 % del DoD de la Fase 1a aplica al motor, no a la UI.
      include: ['src/core/**/*.ts', 'src/finance/**/*.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
