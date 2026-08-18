import { useMemo } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useEstado } from '@/app/EstadoProvider';
import { Panel } from '@/components/Panel';
import {
  EncabezadoConUnidad,
  TablaResponsive,
  ValorEurosTabla,
} from '@/components/TablaResponsive';
import { addCents, type Cents, minCents, toCents } from '@/core/money';
import {
  buscarPrecioMaximo,
  evaluarPrecio,
  RANGO_BUSQUEDA_CAPACIDAD,
} from '@/finance/affordability';
import { construirContexto } from '@/finance/contexto';
import type { EvaluacionPrecio } from '@/domain/types';

function ValorMiles({ valor }: { readonly valor: Cents }) {
  const miles = valor / 100_000;
  const decimales = Math.abs(miles) < 10 ? 1 : 0;
  const cifra = new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimales }).format(miles);

  return <>{cifra} K</>;
}

export function EscalaPrecios() {
  const { estado } = useEstado();
  const navegar = useNavigate();
  const { preferencias, ajustes } = estado;
  const [mostrarTodaLaEscala, setMostrarTodaLaEscala] = useState(false);

  const precioMaximoPorIngresos = useMemo(
    () =>
      buscarPrecioMaximo(
        (evaluacion) => evaluacion.ratioBancario <= ajustes.ratioBancarioMaximo,
        (precio) => construirContexto(estado, precio),
        RANGO_BUSQUEDA_CAPACIDAD,
      ).precioMaximo,
    [estado, ajustes.ratioBancarioMaximo],
  );

  const filas: EvaluacionPrecio[] = useMemo(() => {
    const resultado: EvaluacionPrecio[] = [];
    const precioFinal = precioMaximoPorIngresos ?? preferencias.precioMaxExplorar;
    const precioInicial = minCents(preferencias.precioMinExplorar, precioFinal);
    const paso = toCents(preferencias.pasoEscala);

    for (let p = precioInicial; p <= precioFinal; p = addCents(p, paso)) {
      const ctx = construirContexto(estado, p);
      resultado.push(evaluarPrecio(p, ctx));
    }

    if (resultado.at(-1)?.precio !== precioFinal) {
      resultado.push(evaluarPrecio(precioFinal, construirContexto(estado, precioFinal)));
    }

    return resultado;
  }, [
    estado,
    precioMaximoPorIngresos,
    preferencias.precioMinExplorar,
    preferencias.precioMaxExplorar,
    preferencias.pasoEscala,
  ]);

  if (filas.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <button
          type="button"
          onClick={() => {
            void navegar(-1);
          }}
          className="inline-flex items-center gap-1.5 rounded-medio border border-linea bg-superficie px-3.5 py-2 text-sm font-medium text-tinta shadow-papel transition-colors hover:bg-superficie-2"
        >
          ← Volver
        </button>
        <Panel rotulo="Escala de precios" titulo="Sin rango configurado">
          <p className="text-sm text-tinta-media">
            Configura el rango de precios en Mi perfil para ver la escala.
          </p>
        </Panel>
      </div>
    );
  }

  const indicePrecioObjetivo = filas.reduce(
    (indiceMasCercano, fila, indice) =>
      Math.abs(fila.precio - preferencias.precioObjetivo) <
      Math.abs(filas[indiceMasCercano]!.precio - preferencias.precioObjetivo)
        ? indice
        : indiceMasCercano,
    0,
  );
  const filasVisibles = mostrarTodaLaEscala
    ? filas
    : filas.slice(Math.max(0, indicePrecioObjetivo - 5), indicePrecioObjetivo + 6);
  const hayMasFilas = filasVisibles.length < filas.length;

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-start gap-3">
      <button
        type="button"
        onClick={() => {
          void navegar(-1);
        }}
        className="inline-flex items-center gap-1.5 rounded-medio border border-linea bg-superficie px-3.5 py-2 text-sm font-medium text-tinta shadow-papel transition-colors hover:bg-superficie-2"
      >
        ← Volver
      </button>
      <section className="flex min-h-0 w-full flex-1 flex-col">
        <header className="shrink-0 border-b border-linea pb-4">
          <p className="rotulo mb-1 tracking-widest">Escala de precios</p>
          <p className="mt-3 text-sm leading-relaxed text-tinta-media">
            Esta escala se basa en lo que realmente podrías financiar con tus ingresos y deudas
            actuales.
          </p>
        </header>
        <TablaResponsive minWidth="480px" className="min-h-0 flex-1 overflow-auto">
          <thead className="sticky top-0 z-10 bg-superficie">
            <tr className="border-b border-linea text-left text-xs text-tinta-suave">
              <th className="py-2 pr-3 font-medium">
                <EncabezadoConUnidad titulo="Precio" unidad="€" />
              </th>
              <th className="py-2 pr-3 font-medium">
                <EncabezadoConUnidad titulo="Entrada" unidad="€" />
              </th>
              <th className="py-2 pr-3 font-medium">
                <EncabezadoConUnidad titulo="Mínimo" unidad="€" />
              </th>
              <th className="py-2 pr-3 font-medium">
                <EncabezadoConUnidad titulo="Faltante" unidad="€" />
              </th>
              <th className="py-2 pr-3 font-medium">
                <EncabezadoConUnidad titulo="Cuota" unidad="€" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filasVisibles.map((fila) => {
              const esObjetivo = fila.precio === preferencias.precioObjetivo;
              return (
                <tr
                  key={fila.precio}
                  className={[
                    'border-b border-linea last:border-b-0',
                    esObjetivo ? 'bg-acento-tenue font-semibold' : 'hover:bg-superficie-2',
                  ].join(' ')}
                >
                  <td
                    className={`py-2.5 pr-3 font-mono ${esObjetivo ? 'font-semibold' : 'font-medium'} text-tinta`}
                  >
                    <ValorMiles valor={fila.precio} />
                    {esObjetivo && (
                      <span
                        className="ml-1 text-acento"
                        aria-label="Precio objetivo"
                        title="Precio objetivo"
                      >
                        ◀
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-tinta-media">
                    <ValorMiles valor={fila.entrada} />
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-tinta">
                    <ValorEurosTabla valor={fila.dineroMinimo} />
                  </td>
                  <td
                    className={`py-2.5 pr-3 font-mono ${fila.faltante > 0 ? 'text-no-viable' : 'text-comodo'}`}
                  >
                    <ValorEurosTabla valor={fila.faltante} />
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-tinta-media">
                    <ValorEurosTabla valor={fila.cuota} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TablaResponsive>
        {hayMasFilas && (
          <button
            type="button"
            onClick={() => setMostrarTodaLaEscala(true)}
            className="mt-3 w-full shrink-0 rounded-medio border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-acento transition-colors hover:bg-acento-tenue"
          >
            Ver toda la escala →
          </button>
        )}
      </section>
    </div>
  );
}
