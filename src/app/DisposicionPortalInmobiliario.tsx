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
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
