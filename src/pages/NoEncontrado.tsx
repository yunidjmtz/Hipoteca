import { Link } from 'react-router';
import { Panel } from '@/components/Panel';

export function NoEncontrado() {
  return (
    <div className="flex flex-col gap-6">
      <header className="aparece-0">
        <p className="rotulo">Sin expediente</p>
        <h1 className="mt-2 text-3xl text-tinta">Esta página no existe</h1>
      </header>
      <Panel className="aparece-1">
        <p className="text-sm text-tinta-media">
          La dirección no corresponde a ninguna sección de la aplicación.
        </p>
        <p className="mt-4">
          <Link
            to="/"
            className="inline-flex min-h-toque items-center rounded-medio bg-acento px-4 text-sm font-medium text-sobre-acento"
          >
            Volver al resumen
          </Link>
        </p>
      </Panel>
    </div>
  );
}
