import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Icono } from '@/components/Icono';
import { SECCIONES } from '@/app/secciones';
import { Ajustes } from '@/pages/Ajustes';

function rutaDe(ruta: string): string {
  return ruta === '' ? '/' : `/${ruta}`;
}

function Marca({ compacta = false }: { readonly compacta?: boolean }) {
  return (
    <div className={compacta ? 'flex items-center gap-3' : 'block'}>
      <div
        className={[
          'flex shrink-0 items-center justify-center rounded-medio bg-acento text-sobre-acento font-display font-semibold',
          compacta ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-base',
        ].join(' ')}
        aria-hidden="true"
      >
        <Icono nombre="casa" tamano={compacta ? 17 : 22} />
      </div>
      <div className={compacta ? '' : 'mt-3'}>
        <p
          className={`font-display leading-tight text-tinta ${compacta ? 'text-base' : 'text-xl'}`}
        >
          Mi Hipoteca
        </p>
      </div>
    </div>
  );
}

export function Disposicion() {
  const { pathname } = useLocation();
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);

  function abrirAjustes() {
    setAjustesAbiertos(true);
  }
  function cerrarAjustes() {
    setAjustesAbiertos(false);
  }

  useEffect(() => {
    if (!ajustesAbiertos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarAjustes();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ajustesAbiertos]);

  return (
    <div className="relative z-10 min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Raíl lateral: tableta horizontal y escritorio */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-linea bg-superficie px-5 py-7 lg:flex">
        <div className="px-1">
          <Marca />
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
      <header className="sticky top-0 z-20 border-b border-linea bg-superficie/95 px-4 py-3 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Marca compacta />
          </div>
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

      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-32 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
        <Outlet key={pathname} />
      </main>

      {/* Navegación inferior: móvil y tableta vertical */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 overflow-x-auto border-t border-linea bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {SECCIONES.map((seccion) => (
            <li key={seccion.id}>
              <NavLink
                to={rutaDe(seccion.ruta)}
                end={seccion.ruta === ''}
                className={({ isActive }) =>
                  [
                    'flex min-h-toque flex-col items-center justify-center gap-1 px-0.5 py-2 text-center transition-colors',
                    isActive
                      ? 'text-acento shadow-[inset_0_2px_0_0_var(--c-acento)]'
                      : 'text-tinta-suave hover:text-tinta',
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
          ajustesAbiertos ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={cerrarAjustes}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={[
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col',
          'border-l border-linea bg-superficie shadow-elevado',
          'transition-transform duration-300',
          ajustesAbiertos ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        aria-label="Panel de ajustes"
        aria-hidden={!ajustesAbiertos}
      >
        {/* Header del drawer */}
        <div className="flex items-center justify-between border-b border-linea bg-superficie px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Icono nombre="ajustes" tamano={18} className="text-acento" />
            <h2 className="font-display text-lg text-tinta">Ajustes</h2>
          </div>
          <button
            type="button"
            onClick={cerrarAjustes}
            aria-label="Cerrar ajustes"
            className="flex h-8 w-8 items-center justify-center rounded-medio border border-linea text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto p-6">{ajustesAbiertos && <Ajustes />}</div>
      </aside>
    </div>
  );
}
