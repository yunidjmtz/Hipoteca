import { fileURLToPath } from 'node:url';
import type { IncomingMessage } from 'node:http';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
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
          "connect-src 'self' https://servicios.ine.es",
          "connect-src 'self' https://servicios.ine.es ws: wss:",
        )
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
    },
  };
}

/** Incluye únicamente el origen de la API configurada en el CSP de ese build. */
function cspApiHipotecas(apiUrl: string | undefined): Plugin {
  if (apiUrl === undefined || apiUrl === '') return { name: 'csp-api-hipotecas' };
  let origen: string;
  try {
    origen = new URL(apiUrl).origin;
  } catch {
    throw new Error('VITE_HIPOTECAS_API_URL debe ser una URL válida.');
  }
  return {
    name: 'csp-api-hipotecas',
    transformIndexHtml(html) {
      return html.replace(
        "connect-src 'self' https://servicios.ine.es",
        `connect-src 'self' https://servicios.ine.es ${origen}`,
      );
    },
  };
}

function leerCuerpo(peticion: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const partes: Uint8Array[] = [];
    peticion.on('data', (parte: unknown) => {
      if (typeof parte === 'string') {
        partes.push(Buffer.from(parte));
      } else if (parte instanceof Uint8Array) {
        partes.push(parte);
      } else {
        reject(new TypeError('El cuerpo de la petición local no es válido.'));
      }
    });
    peticion.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    peticion.on('error', reject);
  });
}

function importadorAnunciosDesarrollo(apiKey: string | undefined): Plugin {
  return {
    name: 'importador-anuncios-desarrollo',
    apply: 'serve',
    configureServer(servidor) {
      servidor.middlewares.use((peticion, respuesta, siguiente) => {
        const ruta = peticion.url?.split('?')[0];
        if (ruta !== '/.netlify/functions/importar-anuncio') {
          siguiente();
          return;
        }

        void (async () => {
          try {
            const cuerpo = await leerCuerpo(peticion);
            const headers = new Headers();
            for (const [nombre, valor] of Object.entries(peticion.headers)) {
              if (Array.isArray(valor)) {
                for (const item of valor) headers.append(nombre, item);
              } else if (valor !== undefined) {
                headers.set(nombre, valor);
              }
            }
            const metodo = peticion.method ?? 'GET';
            const requestInit: RequestInit = { method: metodo, headers };
            if (metodo !== 'GET' && metodo !== 'HEAD') requestInit.body = cuerpo;

            const moduloImportador = (await import(
              // @ts-expect-error Netlify loads this JavaScript function at runtime.
              './netlify/functions/importar-anuncio.mjs'
            )) as unknown as {
              default: (request: Request, apiKeyConfigurada?: string) => Promise<Response>;
            };
            const { default: importarAnuncio } = moduloImportador;
            const resultado = await importarAnuncio(
              new Request(
                `http://${peticion.headers.host ?? 'localhost'}/.netlify/functions/importar-anuncio`,
                requestInit,
              ),
              apiKey,
            );

            respuesta.statusCode = resultado.status;
            resultado.headers.forEach((valor, nombre) => respuesta.setHeader(nombre, valor));
            respuesta.end(Buffer.from(await resultado.arrayBuffer()));
          } catch {
            respuesta.statusCode = 500;
            respuesta.setHeader('Content-Type', 'application/json; charset=utf-8');
            respuesta.end(JSON.stringify({ error: 'Falló el importador local.' }));
          }
        })();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Hosting estático cualquiera: rutas relativas + router por hash (§2.1).
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      cspApiHipotecas(env.VITE_HIPOTECAS_API_URL),
      cspDesarrollo(),
      importadorAnunciosDesarrollo(env.FIRECRAWL_API_KEY),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script-defer',
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: 'index.html',
          globPatterns: ['**/*.{html,js,css,ico,png,wasm,gz}'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        manifest: {
          id: './',
          name: 'Mi Hipoteca',
          short_name: 'Mi Hipoteca',
          description:
            'Asistente privado para calcular, comparar y planificar la compra de una vivienda.',
          lang: 'es',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'any',
          background_color: '#f5efe3',
          theme_color: '#8c5a00',
          categories: ['finance', 'utilities'],
          icons: [
            {
              src: 'pwa-64x64.png',
              sizes: '64x64',
              type: 'image/png',
            },
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
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
  };
});
