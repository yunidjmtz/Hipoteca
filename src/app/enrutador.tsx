import { createHashRouter } from 'react-router';
import { Disposicion } from '@/app/Disposicion';
import { Navigate } from 'react-router';
import { Ajustes } from '@/pages/Ajustes';
import { Amortizacion } from '@/pages/Amortizacion';
import { EscalaPrecios } from '@/pages/EscalaPrecios';
import { NoEncontrado } from '@/pages/NoEncontrado';
import { Ofertas } from '@/pages/Ofertas';
import { Perfil } from '@/pages/Perfil';
import { Resumen } from '@/pages/Resumen';
import { Simulador } from '@/pages/Simulador';

/**
 * Router por hash (§2.1): así el enlace profundo y el recargado funcionan en
 * cualquier hosting estático, sin reglas de reescritura en el servidor.
 */
export const enrutador = createHashRouter([
  {
    path: '/',
    element: <Disposicion />,
    children: [
      { index: true, element: <Perfil /> },
      { path: 'resumen', element: <Resumen /> },
      { path: 'capacidad', element: <Navigate to="/resumen" replace /> },
      { path: 'meta', element: <Navigate to="/resumen" replace /> },
      { path: 'escala', element: <EscalaPrecios /> },
      { path: 'simulador', element: <Simulador /> },
      { path: 'ofertas', element: <Ofertas /> },
      { path: 'amortizacion', element: <Amortizacion /> },
      { path: 'ajustes', element: <Ajustes /> },
      { path: '*', element: <NoEncontrado /> },
    ],
  },
]);
