# Asistente de compra de vivienda

Aplicación web **privada y estática** que responde a «¿puedo comprar una vivienda, cuánto y
cuándo?» con cifras trazables. Todo el cálculo ocurre en el navegador: no hay backend ni base de
datos remota. La única petición externa permitida consulta una vez al día el TIN medio oficial de
las hipotecas sobre viviendas en la API del INE; no se envían datos personales.

Incluye perfil financiero, capacidad de compra, planificación del ahorro, comparación de viviendas
y ofertas, simulación de hipotecas fijas, variables y mixtas, y amortización anticipada.

**Fiscalidad:** Aragón tiene una configuración específica revisada. El resto de comunidades usa una
estimación genérica editable que la interfaz identifica expresamente y que debe verificarse antes de
tomar una decisión.

---

## Requisitos

|           |                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Node      | ≥ 22.12. Recomendado ≥ 24.15 (ESLint 10 lo pide en su campo `engines`; con 24.11 funciona, pero `npm install` avisa)        |
| Navegador | Uno con `light-dark()` en CSS: Safari ≥ 17.5, Chrome ≥ 123, Firefox ≥ 120. Los temas claro y oscuro dependen de esa función |

## Puesta en marcha

```bash
npm install
npm run dev
```

## Comandos

| Comando                  | Qué hace                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| `npm run dev`            | Servidor de desarrollo con recarga en caliente                    |
| `npm run build`          | Comprueba tipos (`tsc -b`) y compila a `dist/`                    |
| `npm run preview`        | Sirve el `dist/` ya compilado                                     |
| `npm test`               | Pruebas unitarias y de invariantes (Vitest)                       |
| `npm run test:ver`       | Las mismas, en modo vigilancia                                    |
| `npm run test:cobertura` | Cobertura del motor. Exige 90 % en `src/core` y `src/finance`     |
| `npm run e2e`            | Playwright sobre el `dist`, en perfiles de tableta (iPad, WebKit) |
| `npm run lint`           | ESLint con reglas que necesitan tipos                             |
| `npm run formato`        | Prettier                                                          |
| `npm run comprobar`      | Lint + tipos + pruebas, de una vez                                |

`npm run e2e` necesita los navegadores de Playwright una primera vez:

```bash
npx playwright install webkit chromium
```

## Despliegue

El destino previsto es una **tableta**, así que la aplicación se compila con `base: './'` y usa un
**router por hash**: se puede servir desde cualquier carpeta de cualquier hosting estático, sin
reglas de reescritura y sin configurar nada en el servidor.

```bash
npm run build      # deja todo en dist/
```

Copia el contenido de `dist/` donde quieras servirlo.

> **No basta abrir `dist/index.html` con doble clic.** Los módulos ES no se cargan desde `file://`,
> así que hace falta servir la carpeta por HTTP (un hosting estático, o un servidor local en la red
> de casa). Después de la primera carga, la PWA instalada puede abrir la interfaz sin conexión.

## Estructura

```text
src/
  app/          # router por hash, disposición y lista de secciones
  components/   # interfaz reutilizable
  pages/        # una por sección de §6 del plan
  styles/       # tokens de color y capa base de Tailwind
  core/         # dinero, fechas y formato — sin dominio
  domain/       # tipos y esquemas Zod
  config/       # fiscalidad fechada
  finance/      # motor de cálculo, funciones puras
  storage/      # localStorage versionado, recuperación y migraciones
tests/          # unitarias e invariantes (Vitest + fast-check)
e2e/            # Playwright, pocos y significativos
```

## Reglas que el proyecto se impone

Están todas en el plan, pero estas tres se hacen cumplir por herramientas y conviene conocerlas
antes de tocar código:

1. **Red limitada al INE.** `index.html` lleva una CSP restrictiva que solo permite consultar
   `servicios.ine.es`, y un test de Playwright falla si el `dist` pide cualquier otro recurso
   externo. Nada de fuentes de CDN: se usa el _font stack_ del sistema y los iconos son SVG inline.
2. **El motor financiero es puro.** ESLint prohíbe que `src/core`, `src/domain`, `src/config` y
   `src/finance` importen React, react-router, Recharts o cualquier cosa de la interfaz o del
   almacenamiento. La dependencia va siempre en el otro sentido.
3. **Prohibido `any`.** Y `as` solo con un comentario que lo justifique.

Sobre el desarrollo y la CSP: la CSP de producción bloquearía el websocket de recarga en caliente,
así que un plugin de Vite la relaja **solo** en `vite dev` (ver `vite.config.ts`). El artefacto
compilado sale con la CSP estricta intacta.

## Tema y color

Los colores viven en un único archivo, [`src/styles/tokens.css`](src/styles/tokens.css), y se
definen con `light-dark(claro, oscuro)`: los dos temas están en la misma línea, así que no pueden
desincronizarse. Cambiar de tema es cambiar `color-scheme`; por defecto se sigue la preferencia del
sistema, que es lo razonable en una tableta.

`tests/tokens.contraste.test.ts` verifica **21 pares de color en ambos temas** contra el nivel AA de
WCAG (4,5:1 para texto, 3:1 para bordes de control). Si cambias un color y rompes el contraste, el
test lo dice y con qué ratio.
