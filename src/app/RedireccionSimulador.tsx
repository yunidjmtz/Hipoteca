import { Navigate, useLocation } from 'react-router';

/** Conserva los parámetros de los enlaces antiguos al simulador. */
export function RedireccionSimulador() {
  const { search } = useLocation();
  return <Navigate to={`/hipoteca/simulador${search}`} replace />;
}
