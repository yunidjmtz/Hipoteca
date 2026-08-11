import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';

/**
 * Contenedor aislado para los espacios de trabajo inmobiliarios.
 *
 * No comparte la navegación, los ajustes ni el estado visual de la aplicación
 * de planificación hipotecaria: se comporta como una consola independiente.
 */
export function DisposicionPortalInmobiliario() {
  const { pathname } = useLocation();
  const esAdministracion = pathname === '/administracion-inmobiliarias';

  useEffect(() => {
    const tituloAnterior = document.title;
    document.title =
      pathname === '/administracion-inmobiliarias'
        ? 'Administración de inmobiliarias'
        : 'Panel inmobiliario';
    return () => {
      document.title = tituloAnterior;
    };
  }, [pathname]);

  return (
    <div data-product-area="real-estate" className="min-h-dvh bg-superficie-2">
      <header className="border-b border-linea bg-superficie shadow-[0_1px_0_rgb(0_0_0_/_0.03)]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-chico bg-acento font-cifra text-xs font-bold text-sobre-acento shadow-papel"
            >
              GI
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-tinta">Gestión inmobiliaria</p>
              <p className="truncate text-xs text-tinta-suave">
                {esAdministracion ? 'Administración y accesos' : 'Catálogo y clientes'}
              </p>
            </div>
          </div>
          <span className="hidden rounded-full bg-acento-tenue px-3 py-1 text-xs font-semibold text-acento sm:block">
            Entorno seguro
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-9">
        <Outlet />
      </main>
    </div>
  );
}
