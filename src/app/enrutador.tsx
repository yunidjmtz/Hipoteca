import { createHashRouter } from 'react-router';
import { Disposicion } from '@/app/Disposicion';
import { DisposicionPortalInmobiliario } from '@/app/DisposicionPortalInmobiliario';
import { Navigate } from 'react-router';
import { RedireccionSimulador } from '@/app/RedireccionSimulador';

/**
 * Router por hash (§2.1): así el enlace profundo y el recargado funcionan en
 * cualquier hosting estático, sin reglas de reescritura en el servidor.
 */
export const enrutador = createHashRouter([
  {
    path: 'inmobiliaria',
    element: <DisposicionPortalInmobiliario />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { PanelInmobiliaria } = await import('@/pages/PanelInmobiliaria');
          return { Component: PanelInmobiliaria };
        },
      },
    ],
  },
  {
    path: 'administracion-inmobiliarias',
    element: <DisposicionPortalInmobiliario />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { AdministracionInmobiliarias } =
            await import('@/pages/AdministracionInmobiliarias');
          return { Component: AdministracionInmobiliarias };
        },
      },
    ],
  },
  {
    path: '/',
    element: <Disposicion />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { Perfil } = await import('@/pages/Perfil');
          return { Component: Perfil };
        },
      },
      {
        path: 'resumen',
        lazy: async () => {
          const { Resumen } = await import('@/pages/Resumen');
          return { Component: Resumen };
        },
      },
      {
        path: 'plan-hipotecario',
        lazy: async () => {
          const { Resumen } = await import('@/pages/Resumen');
          return { Component: () => <Resumen modo="plan" /> };
        },
      },
      { path: 'capacidad', element: <Navigate to="/plan-hipotecario" replace /> },
      { path: 'meta', element: <Navigate to="/plan-hipotecario" replace /> },
      {
        path: 'escala',
        lazy: async () => {
          const { EscalaPrecios } = await import('@/pages/EscalaPrecios');
          return { Component: EscalaPrecios };
        },
      },
      {
        path: 'ofertas',
        lazy: async () => {
          const { Ofertas } = await import('@/pages/Ofertas');
          return { Component: Ofertas };
        },
      },
      {
        path: 'ofertas/vivienda',
        lazy: async () => {
          const { EditorVivienda } = await import('@/pages/Ofertas');
          return { Component: EditorVivienda };
        },
      },
      {
        path: 'ofertas/simulador',
        element: <RedireccionSimulador />,
      },
      {
        path: 'hipoteca',
        lazy: async () => {
          const { Hipoteca } = await import('@/pages/Ofertas');
          return { Component: Hipoteca };
        },
      },
      {
        path: 'hipoteca/simulador',
        lazy: async () => {
          const { Simulador } = await import('@/pages/Simulador');
          return { Component: Simulador };
        },
      },
      // Conserva los enlaces antiguos al simulador, ahora integrado en Hipoteca.
      { path: 'simulador', element: <RedireccionSimulador /> },
      {
        path: 'amortizacion',
        lazy: async () => {
          const { Amortizacion } = await import('@/pages/Amortizacion');
          return { Component: Amortizacion };
        },
      },
      {
        path: 'ajustes',
        lazy: async () => {
          const { Ajustes } = await import('@/pages/Ajustes');
          return { Component: Ajustes };
        },
      },
      {
        path: '*',
        lazy: async () => {
          const { NoEncontrado } = await import('@/pages/NoEncontrado');
          return { Component: NoEncontrado };
        },
      },
    ],
  },
]);
