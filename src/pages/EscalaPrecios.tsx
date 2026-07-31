import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useEstado } from '@/app/EstadoProvider';
import { EstadoBadge } from '@/components/EstadoBadge';
import { Panel } from '@/components/Panel';
import {
  EncabezadoConUnidad,
  TablaResponsive,
  ValorEurosTabla,
  ValorPorcentajeTabla,
} from '@/components/TablaResponsive';
import { addCents, toCents } from '@/core/money';
import { evaluarPrecio } from '@/finance/affordability';
import { construirContexto } from '@/finance/contexto';
import { generarCSVEscala, descargarCSV } from '@/storage/exportar';
import type { EvaluacionPrecio } from '@/domain/types';

export function EscalaPrecios() {
  const { estado } = useEstado();
  const navegar = useNavigate();
  const { preferencias } = estado;

  const filas: EvaluacionPrecio[] = useMemo(() => {
    const resultado: EvaluacionPrecio[] = [];
    for (
      let p = preferencias.precioMinExplorar;
      p <= preferencias.precioMaxExplorar;
      p = addCents(p, toCents(preferencias.pasoEscala))
    ) {
      const ctx = construirContexto(estado, p);
      resultado.push(evaluarPrecio(p, ctx));
    }
    return resultado;
  }, [
    estado,
    preferencias.precioMinExplorar,
    preferencias.precioMaxExplorar,
    preferencias.pasoEscala,
  ]);

  function exportarCSV() {
    const contenido = generarCSVEscala(filas);
    const fecha = new Date().toISOString().slice(0, 10);
    descargarCSV(contenido, `escala-precios-${fecha}.csv`);
  }

  if (filas.length === 0) {
    return (
      <Panel rotulo="Escala de precios" titulo="Sin rango configurado">
        <p className="text-sm text-tinta-media">
          Configura el rango de precios en Mi perfil para ver la escala.
        </p>
      </Panel>
    );
  }

  return (
    <Panel rotulo="Escala de precios" titulo="Comparativa por precio">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            void navegar(-1);
          }}
          className="flex items-center gap-1.5 text-sm text-tinta-media hover:text-tinta"
        >
          ← Volver
        </button>
        <button
          type="button"
          onClick={exportarCSV}
          className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
        >
          Exportar CSV
        </button>
      </div>
      <TablaResponsive minWidth="760px">
        <thead>
          <tr className="border-b border-linea text-left text-xs text-tinta-suave">
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Precio" unidad="€" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Entrada" unidad="€" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Impuestos" unidad="€" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Notaría y otros" unidad="€" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Inmobiliaria" unidad="€" />
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
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Ratio" unidad="%" />
            </th>
            <th className="py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const esObjetivo = fila.precio === preferencias.precioObjetivo;
            return (
              <tr
                key={fila.precio}
                className={[
                  'border-b border-linea last:border-b-0',
                  esObjetivo ? 'bg-acento-tenue' : 'hover:bg-superficie-2',
                ].join(' ')}
              >
                <td className="py-2.5 pr-3 font-mono font-medium text-tinta">
                  <ValorEurosTabla valor={fila.precio} />
                  {esObjetivo && <span className="ml-1.5 text-xs text-acento">◀</span>}
                </td>
                <td className="py-2.5 pr-3 font-mono text-tinta-media">
                  <ValorEurosTabla valor={fila.entrada} />
                </td>
                <td className="py-2.5 pr-3 font-mono text-tinta-media">
                  <ValorEurosTabla valor={fila.impuestos} />
                </td>
                <td className="py-2.5 pr-3 font-mono text-tinta-media">
                  <ValorEurosTabla valor={fila.gastosObligatorios} />
                </td>
                <td className="py-2.5 pr-3 font-mono text-tinta-media">
                  <ValorEurosTabla valor={addCents(fila.gastosInmobiliaria, fila.gastosBroker)} />
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
                <td className="py-2.5 pr-3 font-mono text-tinta-media">
                  <ValorPorcentajeTabla valor={fila.ratioBancario} />
                </td>
                <td className="py-2.5">
                  <EstadoBadge estado={fila.estado} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </TablaResponsive>
    </Panel>
  );
}
