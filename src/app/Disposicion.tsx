import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Icono } from '@/components/Icono';
import { SECCIONES } from '@/app/secciones';
import { useEstado } from '@/app/EstadoProvider';

const AjustesPanel = lazy(async () => {
  const { Ajustes } = await import('@/pages/Ajustes');
  return { default: Ajustes };
});

const AyudaPanel = lazy(async () => {
  const { Ayuda } = await import('@/pages/Ayuda');
  return { default: Ayuda };
});

const COMUNIDADES_AUTONOMAS = [
  'Andalucía',
  'Aragón',
  'Asturias',
  'Islas Baleares',
  'Canarias',
  'Cantabria',
  'Castilla-La Mancha',
  'Castilla y León',
  'Cataluña',
  'Extremadura',
  'Galicia',
  'La Rioja',
  'Madrid',
  'Murcia',
  'Navarra',
  'País Vasco',
  'Comunitat Valenciana',
  'Ceuta',
  'Melilla',
] as const;

const CLAVE_TUTORIAL_INSTALACION = 'hipotecas-tutorial-instalacion-v1';

function tutorialInstalacionPendiente(): boolean {
  try {
    return localStorage.getItem(CLAVE_TUTORIAL_INSTALACION) !== 'completado';
  } catch {
    // Si el navegador bloquea el almacenamiento, no impedimos usar la aplicación.
    return false;
  }
}

function rutaDe(ruta: string): string {
  return ruta === '' ? '/' : `/${ruta}`;
}

function elementosEnfocables(contenedor: HTMLElement): HTMLElement[] {
  return [
    ...contenedor.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((elemento) => !elemento.hasAttribute('inert'));
}

function Marca({
  compacta = false,
  titulo = 'Mi Hipoteca',
}: {
  readonly compacta?: boolean;
  readonly titulo?: string;
}) {
  return (
    <div className={compacta ? 'flex items-center gap-3' : 'block'}>
      <div
        className={[
          'flex shrink-0 items-center justify-center rounded-medio bg-acento text-sobre-acento font-display font-semibold shadow-papel',
          compacta ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-base',
        ].join(' ')}
        aria-hidden="true"
      >
        <Icono nombre="casa" tamano={compacta ? 17 : 22} />
      </div>
      <div className={compacta ? '' : 'mt-3'}>
        <p
          className={`font-display font-semibold tracking-tight leading-tight text-tinta ${compacta ? 'text-base' : 'text-xl'}`}
        >
          {titulo}
        </p>
      </div>
    </div>
  );
}

export function Disposicion() {
  const { pathname } = useLocation();
  const { estado, actualizarPreferencias, estadoPersistencia } = useEstado();
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [ccaaInicial, setCcaaInicial] = useState('');
  const [mostrarTutorialInstalacion, setMostrarTutorialInstalacion] = useState(
    tutorialInstalacionPendiente,
  );
  const ajustesRef = useRef<HTMLElement>(null);
  const ayudaRef = useRef<HTMLElement>(null);
  const dialogoCcaaRef = useRef<HTMLDivElement>(null);
  const dialogoTutorialRef = useRef<HTMLDivElement>(null);
  const focoAnteriorRef = useRef<HTMLElement | null>(null);
  const necesitaElegirCcaa = estado.preferencias.ccaa === '';
  const tutorialInstalacionVisible = !necesitaElegirCcaa && mostrarTutorialInstalacion;
  const hayDialogoInicialAbierto = necesitaElegirCcaa || tutorialInstalacionVisible;
  const tituloSeccionActual =
    SECCIONES.find(
      (seccion) =>
        pathname === rutaDe(seccion.ruta) || pathname.startsWith(`${rutaDe(seccion.ruta)}/`),
    )?.etiqueta ?? 'Mi Hipoteca';

  function abrirAjustes() {
    focoAnteriorRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAyudaAbierta(false);
    setAjustesAbiertos(true);
  }
  function cerrarAjustes() {
    setAjustesAbiertos(false);
    window.requestAnimationFrame(() => focoAnteriorRef.current?.focus());
  }
  function abrirAyuda() {
    focoAnteriorRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAjustesAbiertos(false);
    setAyudaAbierta(true);
  }
  function cerrarAyuda() {
    setAyudaAbierta(false);
    window.requestAnimationFrame(() => focoAnteriorRef.current?.focus());
  }
  function cerrarTutorialInstalacion() {
    try {
      localStorage.setItem(CLAVE_TUTORIAL_INSTALACION, 'completado');
    } catch {
      // El tutorial ya puede cerrarse aunque el navegador no permita persistirlo.
    }
    setMostrarTutorialInstalacion(false);
  }

  useEffect(() => {
    const contenedor = necesitaElegirCcaa
      ? dialogoCcaaRef.current
      : tutorialInstalacionVisible
        ? dialogoTutorialRef.current
      : ajustesAbiertos
        ? ajustesRef.current
        : ayudaAbierta
          ? ayudaRef.current
          : null;
    if (contenedor === null) return;

    const frame = window.requestAnimationFrame(() => {
      const preferido = contenedor.querySelector<HTMLElement>('[data-autofocus]');
      (preferido ?? elementosEnfocables(contenedor)[0])?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hayDialogoInicialAbierto) {
        setAjustesAbiertos(false);
        setAyudaAbierta(false);
        window.requestAnimationFrame(() => focoAnteriorRef.current?.focus());
        return;
      }
      if (e.key === 'Tab') {
        const enfocables = elementosEnfocables(contenedor);
        const primero = enfocables[0];
        const ultimo = enfocables.at(-1);
        if (primero === undefined || ultimo === undefined) return;
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
    };
  }, [
    ajustesAbiertos,
    ayudaAbierta,
    hayDialogoInicialAbierto,
    necesitaElegirCcaa,
    tutorialInstalacionVisible,
  ]);

  return (
    <div className="relative z-10 min-h-svh lg:grid lg:min-h-dvh lg:grid-cols-[17rem_1fr]">
      {/* Raíl lateral: tableta horizontal y escritorio */}
      <aside
        inert={hayDialogoInicialAbierto}
        className="sticky top-0 hidden h-dvh flex-col border-r border-linea bg-superficie px-5 py-7 lg:flex"
      >
        <div className="px-1">
          <Marca titulo={tituloSeccionActual} />
        </div>

        <nav aria-label="Secciones" className="mt-8 flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-0.5">
            {SECCIONES.map((seccion, i) => (
              <li key={seccion.id}>
                <NavLink
                  to={rutaDe(seccion.ruta)}
                  end={seccion.ruta === ''}
                  className={({ isActive }) =>
                    [
                      'group flex min-h-toque items-center gap-3 rounded-medio px-3 text-sm transition-all duration-150',
                      isActive
                        ? 'bg-acento-tenue font-semibold text-acento'
                        : 'text-tinta-media hover:bg-superficie-2 hover:text-tinta',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={[
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-chico text-[0.625rem] font-semibold font-cifra tabular-nums',
                          isActive
                            ? 'bg-acento text-sobre-acento'
                            : 'bg-superficie-2 text-tinta-suave group-hover:bg-linea',
                        ].join(' ')}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="flex-1 leading-tight">{seccion.etiqueta}</span>
                      <Icono
                        nombre={seccion.icono}
                        tamano={15}
                        className={
                          isActive
                            ? 'text-acento'
                            : 'text-tinta-suave opacity-60 group-hover:opacity-100'
                        }
                      />
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={abrirAyuda}
            className="flex min-h-toque items-center gap-3 rounded-medio px-3 text-sm text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-chico bg-superficie-2 text-tinta-suave">
              <Icono nombre="ayuda" tamano={16} />
            </span>
            <span className="flex-1 leading-tight">Ayuda</span>
          </button>
          {/* Botón ajustes en sidebar */}
          <button
            type="button"
            onClick={abrirAjustes}
            className="flex min-h-toque items-center gap-3 rounded-medio px-3 text-sm text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-chico bg-superficie-2 text-[0.625rem] font-semibold font-cifra tabular-nums text-tinta-suave">
              ⚙
            </span>
            <span className="flex-1 leading-tight">Ajustes</span>
          </button>
        </div>
      </aside>

      {/* Cabecera compacta: tableta vertical y móvil */}
      <header
        inert={hayDialogoInicialAbierto}
        className="cabecera-movil sticky top-0 z-20 border-b border-linea bg-superficie/80 px-4 backdrop-blur-xl lg:hidden"
      >
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Marca compacta titulo={tituloSeccionActual} />
          </div>
          <button
            type="button"
            onClick={abrirAyuda}
            aria-label="Abrir ayuda"
            className="flex h-9 w-9 items-center justify-center rounded-medio border border-linea text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
          >
            <Icono nombre="ayuda" tamano={18} />
          </button>
          <button
            type="button"
            onClick={abrirAjustes}
            aria-label="Abrir ajustes"
            className="flex h-9 w-9 items-center justify-center rounded-medio border border-linea text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
          >
            <Icono nombre="controles" tamano={18} />
          </button>
        </div>
      </header>

      <main
        inert={hayDialogoInicialAbierto}
        className={[
          'mx-auto w-full max-w-5xl px-2 sm:px-3 lg:px-5',
          pathname === '/escala'
            ? 'flex h-[calc(100svh-3.75rem)] overflow-hidden pt-4 pb-20 lg:h-dvh lg:pt-8 lg:pb-8'
            : 'pt-6 pb-32 lg:pt-8 lg:pb-12',
        ].join(' ')}
      >
        {estadoPersistencia === 'error' && (
          <div
            role="alert"
            className="mb-4 rounded-medio border border-no-viable bg-no-viable-tenue px-4 py-3 text-sm text-tinta"
          >
            No se han podido guardar los últimos cambios. Abre Ajustes y descarga una copia de
            seguridad.
          </div>
        )}
        <Outlet key={pathname} context={{ abrirAjustes }} />
      </main>

      {/* Navegación inferior: móvil y tableta vertical */}
      <nav
        inert={hayDialogoInicialAbierto}
        aria-label="Secciones"
        className="navegacion-movil fixed inset-x-0 bottom-0 z-20 overflow-x-auto border-t border-linea bg-superficie/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${SECCIONES.length}, minmax(0, 1fr))` }}
        >
          {SECCIONES.map((seccion) => (
            <li key={seccion.id}>
              <NavLink
                to={rutaDe(seccion.ruta)}
                end={seccion.ruta === ''}
                className={({ isActive }) =>
                  [
                    'flex min-h-toque flex-col items-center justify-center gap-1 px-0.5 py-2 text-center transition-colors',
                    isActive ? 'font-semibold text-acento' : 'text-tinta-suave hover:text-tinta',
                  ].join(' ')
                }
              >
                <Icono nombre={seccion.icono} tamano={20} />
                <span className="w-full truncate text-xs leading-none">
                  {seccion.etiquetaCorta}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Drawer de ajustes ──────────────────────────────────────────── */}

      {/* Backdrop */}
      <div
        className={[
          'fixed inset-0 z-40 bg-tinta/20 backdrop-blur-sm transition-opacity duration-300',
          ajustesAbiertos || ayudaAbierta ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={() => {
          cerrarAjustes();
          cerrarAyuda();
        }}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        ref={ajustesRef}
        className={[
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col',
          'border-l border-linea bg-superficie shadow-elevado',
          'transition-transform duration-300',
          ajustesAbiertos ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        aria-label="Panel de ajustes"
        aria-hidden={!ajustesAbiertos}
        aria-modal={ajustesAbiertos}
        role="dialog"
        inert={!ajustesAbiertos || hayDialogoInicialAbierto}
      >
        {/* Header del drawer */}
        <div className="flex items-center justify-between border-b border-linea bg-superficie px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Icono nombre="ajustes" tamano={18} className="text-acento" />
            <h2 className="font-display text-lg text-tinta">Ajustes</h2>
          </div>
          <button
            type="button"
            data-autofocus
            onClick={cerrarAjustes}
            aria-label="Cerrar ajustes"
            className="flex h-8 w-8 items-center justify-center rounded-medio border border-linea text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {ajustesAbiertos && (
            <Suspense fallback={<p className="text-sm text-tinta-suave">Cargando ajustes…</p>}>
              <AjustesPanel />
            </Suspense>
          )}
        </div>
      </aside>

      <aside
        ref={ayudaRef}
        className={[
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col',
          'border-l border-linea bg-superficie shadow-elevado',
          'transition-transform duration-300',
          ayudaAbierta ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        aria-label="Manual de ayuda"
        aria-hidden={!ayudaAbierta}
        aria-modal={ayudaAbierta}
        role="dialog"
        inert={!ayudaAbierta || hayDialogoInicialAbierto}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-linea bg-superficie px-6 py-4">
          <div className="flex items-center gap-3">
            <Icono nombre="ayuda" tamano={18} className="text-acento" />
            <h2 className="font-display text-lg text-tinta">Ayuda</h2>
          </div>
          <button
            type="button"
            data-autofocus
            onClick={cerrarAyuda}
            aria-label="Cerrar ayuda"
            className="flex h-8 w-8 items-center justify-center rounded-medio border border-linea text-lg leading-none text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {ayudaAbierta && (
            <Suspense fallback={<p className="text-sm text-tinta-suave">Cargando ayuda…</p>}>
              <AyudaPanel onNavegar={cerrarAyuda} />
            </Suspense>
          )}
        </div>
      </aside>

      {necesitaElegirCcaa && (
        <div
          ref={dialogoCcaaRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-ccaa-inicial"
          className="fixed inset-0 z-[60] flex items-end bg-tinta/30 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
        >
          <section className="w-full max-w-md rounded-grande border border-linea bg-superficie p-6 shadow-elevado">
            <p className="rotulo mb-1">Configuración inicial</p>
            <h2 id="titulo-ccaa-inicial" className="font-display text-2xl text-tinta">
              ¿Dónde quieres comprar?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-tinta-media">
              Selecciona tu comunidad autónoma. Aragón tiene una configuración revisada; para las
              demás se usará una estimación genérica editable que deberás confirmar.
            </p>
            <label
              htmlFor="ccaa-inicial"
              className="mt-5 flex flex-col gap-1 text-sm font-medium text-tinta"
            >
              Comunidad autónoma
              <select
                autoFocus
                data-autofocus
                id="ccaa-inicial"
                value={ccaaInicial}
                onChange={(e) => setCcaaInicial(e.target.value)}
                className="rounded-medio border border-linea bg-superficie px-3 py-2 text-base font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              >
                <option value="">Selecciona una comunidad</option>
                {COMUNIDADES_AUTONOMAS.map((ccaa) => (
                  <option key={ccaa} value={ccaa}>
                    {ccaa}
                    {ccaa === 'Aragón' ? ' · revisada' : ' · estimación genérica'}
                  </option>
                ))}
              </select>
            </label>
            {ccaaInicial !== '' && ccaaInicial !== 'Aragón' && (
              <p role="status" className="mt-3 text-xs leading-relaxed text-revisar">
                Se usará una estimación genérica: no se aplicarán automáticamente los tipos ni las
                bonificaciones específicas de {ccaaInicial}. Revisa la fiscalidad en Ajustes antes
                de tomar una decisión.
              </p>
            )}
            <button
              type="button"
              disabled={ccaaInicial === ''}
              onClick={() => actualizarPreferencias({ ccaa: ccaaInicial })}
              className="mt-5 w-full rounded-medio bg-acento px-4 py-2.5 text-sm font-medium text-sobre-acento hover:bg-acento/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ccaaInicial !== '' && ccaaInicial !== 'Aragón'
                ? 'Continuar con estimación genérica'
                : 'Continuar'}
            </button>
          </section>
        </div>
      )}

      {tutorialInstalacionVisible && (
        <div
          ref={dialogoTutorialRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-tutorial-instalacion"
          className="fixed inset-0 z-[60] flex items-end bg-tinta/30 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
        >
          <section
            data-autofocus
            tabIndex={-1}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-grande border border-linea bg-superficie p-6 shadow-elevado"
          >
            <h2 id="titulo-tutorial-instalacion" className="text-center font-display text-2xl text-tinta">
              Añade Mi Hipoteca a tu pantalla de inicio
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-tinta-media">
              Ábrela desde su propio icono, como una aplicación.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <section className="rounded-medio border border-linea bg-superficie-2 p-4">
                <h3 className="font-display text-lg text-tinta">Android</h3>
                <p className="mt-1 text-xs text-tinta-suave">En Chrome</p>
                <img
                  src={`${import.meta.env.BASE_URL}tutorial-instalar-android.png`}
                  alt="Ilustración de un móvil Android: abre el menú de tres puntos y añade la aplicación a la pantalla de inicio."
                  className="mx-auto mt-3 h-48 w-full max-w-48 rounded-chico object-contain shadow-papel"
                />
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-tinta-media">
                  <li>
                    Toca el menú <strong className="font-semibold text-tinta">⋮</strong> de la
                    esquina superior derecha.
                  </li>
                  <li>
                    Elige <strong className="font-semibold text-tinta">Instalar aplicación</strong>{' '}
                    o <strong className="font-semibold text-tinta">Añadir a pantalla de inicio</strong>.
                  </li>
                  <li>Confirma con “Instalar” o “Añadir”.</li>
                </ol>
              </section>

              <section className="rounded-medio border border-linea bg-superficie-2 p-4">
                <h3 className="font-display text-lg text-tinta">iPhone y iPad</h3>
                <p className="mt-1 text-xs text-tinta-suave">En Safari</p>
                <img
                  src={`${import.meta.env.BASE_URL}tutorial-instalar-ios.png`}
                  alt="Ilustración de un iPhone: usa Compartir y añade la aplicación a la pantalla de inicio."
                  className="mx-auto mt-3 h-48 w-full max-w-48 rounded-chico object-contain shadow-papel"
                />
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-tinta-media">
                  <li>
                    Toca <strong className="font-semibold text-tinta">Compartir</strong> (el icono
                    del cuadrado con una flecha hacia arriba).
                  </li>
                  <li>
                    Desplázate y pulsa{' '}
                    <strong className="font-semibold text-tinta">Añadir a pantalla de inicio</strong>.
                  </li>
                  <li>Confirma con “Añadir”.</li>
                </ol>
              </section>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-tinta-suave">
              Si no ves esa opción, abre esta web desde Chrome en Android o Safari en iPhone y iPad.
            </p>
            <button
              type="button"
              onClick={cerrarTutorialInstalacion}
              className="mt-5 w-full rounded-medio bg-acento px-4 py-2.5 text-sm font-medium text-sobre-acento hover:bg-acento/90"
            >
              Entendido, empezar a usarla
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
