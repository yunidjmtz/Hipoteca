import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { EstadoProvider } from '@/app/EstadoProvider';
import { enrutador } from '@/app/enrutador';
import '@/styles/index.css';

const raiz = document.getElementById('raiz');
if (raiz === null) throw new Error('No se encuentra el nodo #raiz en index.html');

createRoot(raiz).render(
  <StrictMode>
    <EstadoProvider>
      <RouterProvider router={enrutador} />
    </EstadoProvider>
  </StrictMode>,
);
