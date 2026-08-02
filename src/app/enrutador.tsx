import { createHashRouter } from 'react-router';
import { Disposicion } from '@/app/Disposicion';
import { Navigate, useLocation } from 'react-router';
import { Ajustes } from '@/pages/Ajustes';
import { Amortizacion } from '@/pages/Amortizacion';
import { EscalaPrecios } from '@/pages/EscalaPrecios';
import { NoEncontrado } from '@/pages/NoEncontrado';
import { EditorVivienda, Ofertas } from '@/pages/Ofertas';
import { Perfil } from '@/pages/Perfil';
import { Resumen } from '@/pages/Resumen';
import { Simulador } from '@/pages/Simulador';

/**
 * Router por hash (§2.1): así el enlace profundo y el recargado funcionan en
 * cualquier hosting estático, sin reglas de reescritura en el servidor.
 */
function RedireccionSimulador() {
  const { search } = useLocation();
  return <Navigate to={`/ofertas/simulador${search}`} replace />;
}

export const enrutador = createHashRouter([
  {
    path: '/',
    element: <Disposicion />,
    children: [
      { index: true, element: <Perfil /> },
      { path: 'resumen', element: <Resumen /> },
      { path: 'plan-hipotecario', element: <Resumen modo="plan" /> },
      { path: 'capacidad', element: <Navigate to="/plan-hipotecario" replace /> },
      { path: 'meta', element: <Navigate to="/plan-hipotecario" replace /> },
      { path: 'escala', element: <EscalaPrecios /> },
      { path: 'ofertas', element: <Ofertas /> },
      { path: 'ofertas/vivienda', element: <EditorVivienda /> },
      { path: 'ofertas/simulador', element: <Simulador /> },
      // Conserva los enlaces antiguos al simulador, ahora integrado en Ofertas.
      { path: 'simulador', element: <RedireccionSimulador /> },
      { path: 'amortizacion', element: <Amortizacion /> },
      { path: 'ajustes', element: <Ajustes /> },
      { path: '*', element: <NoEncontrado /> },
    ],
  },
]);
