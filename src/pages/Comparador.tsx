import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useEstado } from '@/app/EstadoProvider';
import { formatEntero, formatEuros, formatFecha, formatPorcentaje } from '@/core/format';
import {
  ZERO,
  addCents,
  fromCents,
  maxCents,
  subtractCents,
  sumCents,
  type Cents,
} from '@/core/money';
import type {
  EstadoOferta,
  EstadoPersistido,
  OfertaBancaria,
  ViviendaGuardada,
} from '@/domain/types';
import {
  calcularDeudasMensuales,
  calcularIngresoMensualNormalizado,
  calcularOtrosIngresosMensuales,
} from '@/finance/affordability';
import { compararViviendas } from '@/finance/housingComparison';
import { calcularCosteVivienda } from '@/finance/housingCosts';
import { construirFlujoDeCaja } from '@/finance/mortgage';
import {
  PESOS_POR_DEFECTO,
  calcularMetricasOferta,
  compararOfertas,
  sonOfertasComparables,
  type ContextoComparacionHipotecas,
  type MetricasOferta,
  type ResultadoComparacion,
} from '@/finance/offers';
import { flujoInputDesdeEscenario } from '@/finance/scenario';

type TipoComparacion = 'viviendas' | 'hipotecas';
type Seleccion = [string, string, string];

interface OpcionSeleccion {
  readonly id: string;
  readonly titulo: string;
  readonly detalle: string;
}

interface CeldaComparativa {
  readonly contenido: ReactNode;
  readonly destacado?: boolean;
  readonly tono?: 'positivo' | 'aviso' | 'negativo';
}

interface FilaComparativa {
  readonly id: string;
  readonly etiqueta: string;
  readonly ayuda?: string;
  readonly celdas: readonly CeldaComparativa[];
}

interface GrupoComparativo {
  readonly id: string;
  readonly titulo: string;
  readonly filas: readonly FilaComparativa[];
}

interface ColumnaComparativa {
  readonly id: string;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly enlace: string;
  readonly insignia?: string;
}

const ETIQUETAS_ESTADO_OFERTA: Record<EstadoOferta, string> = {
  pendiente: 'Pendiente',
  estudio: 'En estudio',
  preaprobada: 'Preaprobada',
  fein_recibida: 'FEIN recibida',
  rechazada: 'Rechazada',
  firmada: 'Firmada',
};

const ETIQUETAS_TIPO = {
  fija: 'Fija',
  variable: 'Variable',
  mixta: 'Mixta',
} as const;

const ETIQUETAS_DESTINO = {
  habitual: 'Vivienda habitual',
  segunda: 'Segunda residencia',
  inversion: 'Inversión',
} as const;

const fmtEurosM2 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function opcionesSeleccionadas<T extends { readonly id: string }>(
  opciones: readonly T[],
  seleccion: Seleccion,
): T[] {
  const porId = new Map(opciones.map((opcion) => [opcion.id, opcion]));
  return seleccion.flatMap((id) => {
    const opcion = porId.get(id);
    return opcion === undefined ? [] : [opcion];
  });
}

function esMejor(
  valores: readonly (number | null)[],
  valor: number | null,
  sentido: 'menor' | 'mayor',
): boolean {
  const validos = valores.filter((dato): dato is number => dato !== null && Number.isFinite(dato));
  if (valor === null || validos.length < 2) return false;
  const referencia = sentido === 'menor' ? Math.min(...validos) : Math.max(...validos);
  return valor === referencia;
}

function textoSiNo(valor: boolean): ReactNode {
  return (
    <span className={valor ? 'font-semibold text-comodo' : 'text-tinta-media'}>
      {valor ? 'Sí' : 'No'}
    </span>
  );
}

function mesesEnTexto(meses: number | null): string {
  if (meses === null) return 'No alcanzable en 10 años';
  if (meses === 0) return 'Disponible ahora';
  if (meses === 1) return '1 mes';
  if (meses < 24) return `${meses} meses`;
  const anos = meses / 12;
  return `${anos.toLocaleString('es-ES', { maximumFractionDigits: 1 })} años`;
}

function SelectorComparacion({
  id,
  nombre,
  opciones,
  seleccion,
  onCambio,
}: {
  readonly id: string;
  readonly nombre: string;
  readonly opciones: readonly OpcionSeleccion[];
  readonly seleccion: Seleccion;
  readonly onCambio: (seleccion: Seleccion) => void;
}) {
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const seleccionadas = seleccion.filter(Boolean);
  const opcionesDisponibles = opciones.filter((opcion) => !seleccion.includes(opcion.id));

  function anadir(valor: string) {
    const indiceLibre = seleccion.findIndex((seleccionada) => seleccionada === '');
    if (indiceLibre === -1 || seleccion.includes(valor)) return;
    const siguiente: Seleccion = [...seleccion];
    siguiente[indiceLibre] = valor;
    onCambio(siguiente);
    setSelectorAbierto(false);
  }

  function quitar(indice: number) {
    const siguiente: Seleccion = [...seleccion];
    siguiente[indice] = '';
    onCambio(siguiente);
  }

  return (
    <section className="rounded-grande border border-linea bg-superficie p-3 shadow-papel sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="rotulo text-acento">Tu selección</p>
          <h2 className="mt-0.5 font-display text-lg text-tinta">
            Compara hasta tres alternativas
          </h2>
        </div>
        <p className="text-xs text-tinta-suave">{seleccionadas.length}/3 seleccionadas</p>
      </div>

      {seleccionadas.length === 0 ? (
        <p className="mt-3 rounded-medio border border-dashed border-linea-fuerte bg-superficie-2 px-3 py-4 text-sm text-tinta-media">
          Aún no has añadido ninguna alternativa.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {seleccion.map((valor, indice) => {
            if (valor === '') return null;
            const opcionActual = opciones.find((opcion) => opcion.id === valor);
            return (
              <div
                key={`${id}-${indice}`}
                className="relative rounded-medio border border-linea bg-superficie-2 p-3"
              >
                <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-tinta-suave">
                  Opción {indice + 1}
                </p>
                <p className="mt-1 font-semibold text-tinta">{opcionActual?.titulo}</p>
                <p className="mt-1 min-h-5 text-xs leading-relaxed text-tinta-suave">
                  {opcionActual?.detalle}
                </p>
                <button
                  type="button"
                  onClick={() => quitar(indice)}
                  className="mt-2 text-xs font-semibold text-acento hover:underline"
                >
                  Quitar
                </button>
              </div>
            );
          })}
        </div>
      )}

      {seleccionadas.length < 3 && (
        <button
          type="button"
          onClick={() => setSelectorAbierto(true)}
          className="mt-3 inline-flex min-h-toque items-center rounded-medio bg-acento px-4 py-2 text-sm font-semibold text-sobre-acento hover:bg-acento/90 focus:outline-none focus:ring-2 focus:ring-acento/40 focus:ring-offset-2"
        >
          + Añadir {nombre}
        </button>
      )}
      {opciones.length > 3 && seleccionadas.length < 3 && (
        <p className="mt-3 text-xs leading-relaxed text-tinta-suave">
          El límite de tres mantiene la comparación legible en móvil.
        </p>
      )}

      {selectorAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-tinta/45 p-3 sm:items-center sm:justify-center sm:p-6"
          onClick={() => setSelectorAbierto(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-selector-titulo`}
            onClick={(evento) => evento.stopPropagation()}
            onKeyDown={(evento) => {
              if (evento.key === 'Escape') setSelectorAbierto(false);
            }}
            tabIndex={-1}
            className="max-h-[min(42rem,calc(100dvh-1.5rem))] w-full max-w-xl overflow-y-auto rounded-grande bg-superficie p-4 shadow-papel sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="rotulo text-acento">Añadir a la comparación</p>
                <h3 id={`${id}-selector-titulo`} className="mt-0.5 font-display text-xl text-tinta">
                  Selecciona una {nombre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectorAbierto(false)}
                aria-label="Cerrar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-tinta-media hover:bg-superficie-2 hover:text-tinta focus:outline-none focus:ring-2 focus:ring-acento/40"
              >
                ×
              </button>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-tinta-media">
              Elige una de tus{' '}
              {nombre === 'vivienda' ? 'viviendas guardadas' : 'hipotecas guardadas'}.
            </p>
            <div className="mt-4 space-y-2">
              {opcionesDisponibles.map((opcion) => (
                <button
                  key={opcion.id}
                  type="button"
                  onClick={() => anadir(opcion.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-medio border border-linea bg-superficie-2 p-3 text-left transition-colors hover:border-acento/50 hover:bg-acento-tenue focus:outline-none focus:ring-2 focus:ring-acento/40"
                >
                  <span>
                    <span className="block font-semibold text-tinta">{opcion.titulo}</span>
                    <span className="mt-0.5 block text-sm text-tinta-media">{opcion.detalle}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-acento">Añadir</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function TablaComparativa({
  etiqueta,
  columnas,
  grupos,
}: {
  readonly etiqueta: string;
  readonly columnas: readonly ColumnaComparativa[];
  readonly grupos: readonly GrupoComparativo[];
}) {
  const anchuraMinima = columnas.length <= 1 ? '100%' : `${148 + columnas.length * 150}px`;

  return (
    <div className="overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table
          aria-label={etiqueta}
          className="w-full border-separate border-spacing-0 text-sm"
          style={{ minWidth: anchuraMinima }}
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 w-36 min-w-36 border-b border-r border-linea bg-superficie-2 px-3 py-3 text-left align-bottom text-xs font-semibold text-tinta sm:w-44 sm:min-w-44"
              >
                Datos comparativos
              </th>
              {columnas.map((columna) => (
                <th
                  key={columna.id}
                  scope="col"
                  className="min-w-36 border-b border-linea bg-superficie-2 px-3 py-3 text-left align-bottom sm:min-w-40"
                >
                  {columna.insignia !== undefined && (
                    <span className="mb-1.5 inline-flex rounded-full border border-comodo/35 bg-comodo-tenue px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-comodo">
                      {columna.insignia}
                    </span>
                  )}
                  <Link
                    to={columna.enlace}
                    className="block font-display text-base leading-tight text-tinta hover:text-acento"
                  >
                    {columna.titulo}
                  </Link>
                  <span className="mt-1 block text-xs font-normal leading-snug text-tinta-suave">
                    {columna.subtitulo}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo) => (
              <FragmentoGrupo key={grupo.id} grupo={grupo} columnas={columnas.length} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentoGrupo({
  grupo,
  columnas,
}: {
  readonly grupo: GrupoComparativo;
  readonly columnas: number;
}) {
  return (
    <>
      <tr>
        <th
          colSpan={columnas + 1}
          className="border-b border-linea bg-acento-tenue px-3 py-2 text-left text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-acento"
        >
          {grupo.titulo}
        </th>
      </tr>
      {grupo.filas.map((fila) => (
        <tr key={fila.id} className="group">
          <th
            scope="row"
            className="sticky left-0 z-10 border-b border-r border-linea bg-superficie px-3 py-2.5 text-left align-top font-medium text-tinta group-hover:bg-superficie-2"
          >
            <span className="block leading-snug">{fila.etiqueta}</span>
            {fila.ayuda !== undefined && (
              <span className="mt-0.5 block text-[0.6875rem] font-normal leading-snug text-tinta-suave">
                {fila.ayuda}
              </span>
            )}
          </th>
          {fila.celdas.map((celda, indice) => (
            <td
              key={`${fila.id}-${indice}`}
              className={[
                'border-b border-linea px-3 py-2.5 align-top font-cifra leading-snug tabular-nums text-tinta group-hover:bg-superficie-2',
                celda.destacado === true ? 'bg-comodo-tenue/45' : 'bg-superficie',
                celda.tono === 'positivo'
                  ? 'text-comodo'
                  : celda.tono === 'aviso'
                    ? 'text-ajustado'
                    : celda.tono === 'negativo'
                      ? 'text-no-viable'
                      : '',
              ].join(' ')}
            >
              <span className={celda.destacado === true ? 'font-bold text-comodo' : ''}>
                {celda.contenido}
              </span>
              {celda.destacado === true && (
                <span className="mt-1 block w-fit rounded-full bg-comodo-tenue px-1.5 py-0.5 font-sans text-[0.5625rem] font-bold uppercase tracking-wide text-comodo">
                  Mejor
                </span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EstadoVacio({
  titulo,
  texto,
  enlace,
  accion,
}: {
  readonly titulo: string;
  readonly texto: string;
  readonly enlace: string;
  readonly accion: string;
}) {
  return (
    <section className="rounded-grande border border-dashed border-linea-fuerte bg-superficie px-5 py-10 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-acento-tenue text-xl text-acento">
        +
      </div>
      <h2 className="mt-3 font-display text-xl text-tinta">{titulo}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-tinta-media">{texto}</p>
      <Link
        to={enlace}
        className="mt-5 inline-flex min-h-toque items-center rounded-medio bg-acento px-4 py-2 text-sm font-semibold text-sobre-acento hover:bg-acento/90"
      >
        {accion}
      </Link>
    </section>
  );
}

function ComparacionViviendas({
  viviendas,
  seleccion,
  onCambio,
  estado,
}: {
  readonly viviendas: readonly ViviendaGuardada[];
  readonly seleccion: Seleccion;
  readonly onCambio: (seleccion: Seleccion) => void;
  readonly estado: EstadoPersistido;
}) {
  const elegidas = opcionesSeleccionadas(viviendas, seleccion);
  const opciones = viviendas.map((vivienda) => ({
    id: vivienda.id,
    titulo: vivienda.nombre,
    detalle:
      vivienda.superficieM2 > 0
        ? `${formatEuros(vivienda.precioVenta)} · ${formatEntero(vivienda.superficieM2)} m²`
        : `${formatEuros(vivienda.precioVenta)} · superficie pendiente`,
  }));
  const datos = useMemo(() => {
    const comparacion = compararViviendas(elegidas, estado);
    const porId = new Map(comparacion.map((resultado) => [resultado.vivienda.id, resultado]));
    return elegidas.map((vivienda) => ({
      vivienda,
      coste: calcularCosteVivienda(vivienda, estado),
      resultado: porId.get(vivienda.id),
    }));
  }, [elegidas, estado]);

  if (viviendas.length === 0) {
    return (
      <EstadoVacio
        titulo="Añade tu primera vivienda"
        texto="Guarda precio, superficie, estado, gastos y reformas. Después podrás comparar hasta tres inmuebles con el mismo nivel de detalle."
        enlace="/ofertas/vivienda"
        accion="Añadir vivienda"
      />
    );
  }

  const puntuaciones = datos.map((dato) => dato.resultado?.puntuacion ?? null);
  const precios = datos.map((dato) => dato.vivienda.precioVenta);
  const preciosM2 = datos.map((dato) =>
    dato.vivienda.superficieM2 > 0
      ? fromCents(dato.vivienda.precioVenta) / dato.vivienda.superficieM2
      : null,
  );
  const reformas = datos.map((dato) => dato.coste.costeReforma);
  const costesTotales = datos.map((dato) => dato.coste.costeTotal);
  const costesM2 = datos.map((dato) => dato.resultado?.costePorM2 ?? null);
  const superficies = datos.map((dato) =>
    dato.vivienda.superficieM2 > 0 ? dato.vivienda.superficieM2 : null,
  );
  const cuotas = datos.map((dato) => dato.resultado?.encajePlan?.evaluacion?.cuota ?? null);
  const costesMensuales = datos.map(
    (dato) => dato.resultado?.encajePlan?.evaluacion?.costeMensualVivienda ?? null,
  );
  const efectivos = datos.map(
    (dato) => dato.resultado?.encajePlan?.evaluacion?.dineroRecomendado ?? null,
  );
  const faltantes = datos.map((dato) => dato.resultado?.encajePlan?.evaluacion?.faltante ?? null);
  const comunidad = datos.map((dato) => dato.vivienda.comunidadMensual ?? null);
  const ibi = datos.map((dato) => dato.vivienda.ibiAnual ?? null);
  const ganadora = datos.reduce<(typeof datos)[number] | undefined>((mejor, dato) => {
    if (dato.resultado === undefined || !dato.resultado.esRecomendable) return mejor;
    if (
      mejor === undefined ||
      mejor.resultado === undefined ||
      dato.resultado.puntuacion > mejor.resultado.puntuacion
    ) {
      return dato;
    }
    return mejor;
  }, undefined);

  const columnas: ColumnaComparativa[] = datos.map((dato) => ({
    id: dato.vivienda.id,
    titulo: dato.vivienda.nombre,
    subtitulo: dato.vivienda.direccion || 'Dirección sin completar',
    enlace: `/ofertas/vivienda?vivienda=${encodeURIComponent(dato.vivienda.id)}`,
    ...(ganadora?.vivienda.id === dato.vivienda.id && datos.length > 1
      ? { insignia: 'Mejor encaje' }
      : {}),
  }));

  const grupos: GrupoComparativo[] = [
    {
      id: 'decision',
      titulo: 'Decisión y encaje personal',
      filas: [
        {
          id: 'valoracion',
          etiqueta: 'Valoración global',
          ayuda: 'Coste, finanzas y necesidades',
          celdas: datos.map((dato, indice) => ({
            contenido:
              dato.resultado === undefined
                ? 'Datos insuficientes'
                : `${Math.round(dato.resultado.puntuacion)}/100`,
            destacado: esMejor(puntuaciones, puntuaciones[indice] ?? null, 'mayor'),
          })),
        },
        {
          id: 'encaje',
          etiqueta: 'Encaje con tu plan',
          celdas: datos.map((dato) => {
            const encaje = dato.resultado?.encajePlan;
            if (encaje === undefined || encaje === null) return { contenido: 'Sin calcular' };
            const textos = {
              en_plan: 'Dentro de tu plan',
              alcanzable: 'Alcanzable con ahorro',
              no_viable: 'No viable ahora',
              sin_presupuesto: 'Faltan datos de ingresos',
            } as const;
            return {
              contenido: textos[encaje.estado],
              tono:
                encaje.estado === 'en_plan'
                  ? ('positivo' as const)
                  : encaje.estado === 'no_viable'
                    ? ('negativo' as const)
                    : ('aviso' as const),
            };
          }),
        },
        {
          id: 'plazo-ahorro',
          etiqueta: 'Cuándo podrías comprar',
          ayuda: 'Según ahorro e ingresos actuales',
          celdas: datos.map((dato) => ({
            contenido: mesesEnTexto(dato.resultado?.encajePlan?.mesesHastaAlcanzar ?? null),
          })),
        },
        {
          id: 'disponibilidad',
          etiqueta: 'Disponibilidad',
          celdas: datos.map((dato) => ({
            contenido: dato.vivienda.yaNoDisponible === true ? 'Retirada' : 'Disponible',
            tono: dato.vivienda.yaNoDisponible === true ? 'negativo' : 'positivo',
          })),
        },
      ],
    },
    {
      id: 'coste',
      titulo: 'Precio y coste real de compra',
      filas: [
        {
          id: 'precio',
          etiqueta: 'Precio anunciado',
          celdas: datos.map((dato, indice) => ({
            contenido: formatEuros(dato.vivienda.precioVenta),
            destacado: esMejor(precios, precios[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'precio-m2',
          etiqueta: 'Precio por m²',
          ayuda: 'Sin impuestos ni reforma',
          celdas: datos.map((_, indice) => ({
            contenido:
              preciosM2[indice] === null || preciosM2[indice] === undefined
                ? '—'
                : fmtEurosM2.format(preciosM2[indice]),
            destacado: esMejor(preciosM2, preciosM2[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'reforma',
          etiqueta: 'Reformas previstas',
          celdas: datos.map((dato, indice) => ({
            contenido: formatEuros(dato.coste.costeReforma),
            destacado: esMejor(reformas, reformas[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'impuestos',
          etiqueta: 'Impuestos de compra',
          ayuda: 'ITP o IVA + AJD',
          celdas: datos.map((dato) => ({
            contenido: formatEuros(dato.coste.gastosCompra.impuestos),
          })),
        },
        {
          id: 'gastos-compra',
          etiqueta: 'Otros gastos de compra',
          ayuda: 'Notaría, registro, agencia y transición',
          celdas: datos.map((dato) => ({
            contenido: formatEuros(
              maxCents(
                ZERO,
                subtractCents(
                  dato.coste.gastosCompra.total,
                  addCents(dato.coste.gastosCompra.impuestos, dato.coste.costeReforma),
                ),
              ),
            ),
          })),
        },
        {
          id: 'coste-total',
          etiqueta: 'Coste completo',
          ayuda: 'Precio + impuestos + todos los gastos',
          celdas: datos.map((dato, indice) => ({
            contenido: formatEuros(dato.coste.costeTotal),
            destacado: esMejor(costesTotales, costesTotales[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'coste-total-m2',
          etiqueta: 'Coste completo por m²',
          celdas: datos.map((_, indice) => ({
            contenido:
              costesM2[indice] === null || costesM2[indice] === undefined
                ? '—'
                : fmtEurosM2.format(costesM2[indice]),
            destacado: esMejor(costesM2, costesM2[indice] ?? null, 'menor'),
          })),
        },
      ],
    },
    {
      id: 'financiacion',
      titulo: 'Impacto en tus finanzas',
      filas: [
        {
          id: 'efectivo',
          etiqueta: 'Efectivo recomendado',
          ayuda: 'Entrada, gastos y colchón',
          celdas: datos.map((_, indice) => ({
            contenido: efectivos[indice] === null ? '—' : formatEuros(efectivos[indice] as Cents),
            destacado: esMejor(efectivos, efectivos[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'faltante',
          etiqueta: 'Ahorro que te falta',
          celdas: datos.map((_, indice) => ({
            contenido: faltantes[indice] === null ? '—' : formatEuros(faltantes[indice] as Cents),
            destacado: esMejor(faltantes, faltantes[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'cuota',
          etiqueta: 'Cuota hipotecaria estimada',
          ayuda: 'Con tus ajustes por defecto',
          celdas: datos.map((_, indice) => ({
            contenido:
              cuotas[indice] === null ? '—' : `${formatEuros(cuotas[indice] as Cents)}/mes`,
            destacado: esMejor(cuotas, cuotas[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'coste-mensual',
          etiqueta: 'Coste mensual de vivienda',
          ayuda: 'Cuota + gastos recurrentes',
          celdas: datos.map((_, indice) => ({
            contenido:
              costesMensuales[indice] === null
                ? '—'
                : `${formatEuros(costesMensuales[indice] as Cents)}/mes`,
            destacado: esMejor(costesMensuales, costesMensuales[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'comunidad',
          etiqueta: 'Comunidad',
          celdas: datos.map((_, indice) => ({
            contenido:
              comunidad[indice] === null
                ? 'Sin informar'
                : `${formatEuros(comunidad[indice] as Cents)}/mes`,
            destacado: esMejor(comunidad, comunidad[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'ibi',
          etiqueta: 'IBI',
          celdas: datos.map((_, indice) => ({
            contenido:
              ibi[indice] === null ? 'Sin informar' : `${formatEuros(ibi[indice] as Cents)}/año`,
            destacado: esMejor(ibi, ibi[indice] ?? null, 'menor'),
          })),
        },
      ],
    },
    {
      id: 'caracteristicas',
      titulo: 'Características del inmueble',
      filas: [
        {
          id: 'superficie',
          etiqueta: 'Superficie',
          celdas: datos.map((dato, indice) => ({
            contenido:
              dato.vivienda.superficieM2 > 0
                ? `${formatEntero(dato.vivienda.superficieM2)} m²`
                : 'Sin informar',
            destacado: esMejor(superficies, superficies[indice] ?? null, 'mayor'),
          })),
        },
        {
          id: 'habitaciones',
          etiqueta: 'Habitaciones',
          celdas: datos.map((dato) => ({ contenido: formatEntero(dato.vivienda.habitaciones) })),
        },
        {
          id: 'banos',
          etiqueta: 'Baños',
          celdas: datos.map((dato) => ({
            contenido:
              dato.vivienda.banos === undefined
                ? 'Sin informar'
                : formatEntero(dato.vivienda.banos),
          })),
        },
        {
          id: 'estado',
          etiqueta: 'Estado de la vivienda',
          celdas: datos.map((dato) => ({
            contenido:
              (dato.vivienda.estadoVivienda ?? estado.preferencias.estadoVivienda) === 'nueva'
                ? 'Nueva'
                : 'Segunda mano',
          })),
        },
        {
          id: 'destino',
          etiqueta: 'Uso previsto',
          celdas: datos.map((dato) => ({
            contenido: ETIQUETAS_DESTINO[dato.vivienda.destino ?? estado.preferencias.destino],
          })),
        },
        {
          id: 'exterior',
          etiqueta: 'Exterior',
          celdas: datos.map((dato) => ({ contenido: textoSiNo(dato.vivienda.esExterior) })),
        },
        {
          id: 'garaje',
          etiqueta: 'Garaje',
          celdas: datos.map((dato) => ({ contenido: textoSiNo(dato.vivienda.tieneGaraje) })),
        },
        {
          id: 'trastero',
          etiqueta: 'Trastero',
          celdas: datos.map((dato) => ({ contenido: textoSiNo(dato.vivienda.tieneTrastero) })),
        },
        {
          id: 'detalle-reformas',
          etiqueta: 'Detalle de reformas',
          celdas: datos.map((dato) => ({
            contenido:
              dato.vivienda.reformas.length === 0
                ? 'Sin partidas detalladas'
                : dato.vivienda.reformas
                    .map((reforma) => `${reforma.concepto}: ${formatEuros(reforma.costeEstimado)}`)
                    .join(' · '),
          })),
        },
        {
          id: 'referencia-fiscal',
          etiqueta: 'Valor de referencia fiscal',
          celdas: datos.map((dato) => ({
            contenido:
              dato.vivienda.valorReferenciaFiscal === undefined
                ? 'Sin informar'
                : formatEuros(dato.vivienda.valorReferenciaFiscal),
          })),
        },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <SelectorComparacion
        id="vivienda"
        nombre="vivienda"
        opciones={opciones}
        seleccion={seleccion}
        onCambio={onCambio}
      />
      {datos.length === 0 ? (
        <p className="rounded-medio border border-linea bg-superficie px-4 py-6 text-center text-sm text-tinta-media">
          Selecciona al menos una vivienda para ver sus datos.
        </p>
      ) : (
        <>
          {datos.length > 1 && ganadora === undefined && (
            <div
              role="status"
              className="rounded-medio border border-ajustado/35 bg-ajustado-tenue px-4 py-3 text-sm text-tinta"
            >
              Ninguna vivienda supera ahora todos los filtros de seguridad. La tabla mantiene la
              comparación informativa, pero no marca una ganadora.
            </div>
          )}
          <TablaComparativa
            etiqueta="Comparación de viviendas"
            columnas={columnas}
            grupos={grupos}
          />
        </>
      )}
    </div>
  );
}

function viviendaDeOferta(
  oferta: OfertaBancaria,
  estado: EstadoPersistido,
): ViviendaGuardada | undefined {
  const viviendaId = oferta.viviendaId ?? estado.viviendas[0]?.id;
  return estado.viviendas.find((vivienda) => vivienda.id === viviendaId);
}

function contextoOferta(
  oferta: OfertaBancaria,
  estado: EstadoPersistido,
): ContextoComparacionHipotecas {
  const vivienda = viviendaDeOferta(oferta, estado);
  const ingresoMensual = addCents(
    calcularIngresoMensualNormalizado(estado.perfil.titulares),
    calcularOtrosIngresosMensuales(estado.perfil),
  );
  return {
    ingresoMensual,
    otrasDeudasMensuales: calcularDeudasMensuales(estado.perfil.deudas),
    ratioBancarioMaximo: estado.ajustes.ratioBancarioMaximo,
    ahorrosDisponibles: estado.perfil.ahorrosActuales,
    ...(vivienda === undefined
      ? {}
      : { gastosCompraNoFinanciados: calcularCosteVivienda(vivienda, estado).gastosCompra.total }),
  };
}

interface DatosHipoteca {
  readonly oferta: OfertaBancaria;
  readonly metricas: MetricasOferta;
  readonly resultado: ResultadoComparacion | undefined;
  readonly vivienda: ViviendaGuardada | undefined;
  readonly tinInicial: number;
  readonly costeVinculaciones: Cents;
  readonly comisionApertura: Cents;
}

function ComparacionHipotecas({
  ofertas,
  seleccion,
  onCambio,
  estado,
}: {
  readonly ofertas: readonly OfertaBancaria[];
  readonly seleccion: Seleccion;
  readonly onCambio: (seleccion: Seleccion) => void;
  readonly estado: EstadoPersistido;
}) {
  const elegidas = opcionesSeleccionadas(ofertas, seleccion);
  const opciones = ofertas.map((oferta) => ({
    id: oferta.id,
    titulo: `${oferta.banco} · ${oferta.nombre}`,
    detalle: `${ETIQUETAS_TIPO[oferta.escenario.tipo]} · ${formatEuros(oferta.escenario.importeSolicitado)} · ${oferta.escenario.plazoAnios} años`,
  }));
  const comparables = sonOfertasComparables(elegidas);
  const datos = useMemo<DatosHipoteca[]>(() => {
    const contextoComun =
      elegidas[0] === undefined ? undefined : contextoOferta(elegidas[0], estado);
    const comparacion = compararOfertas(elegidas, PESOS_POR_DEFECTO, contextoComun);
    const porId = new Map(comparacion.map((resultado) => [resultado.oferta.id, resultado]));
    return elegidas.map((oferta) => {
      const flujo = construirFlujoDeCaja(flujoInputDesdeEscenario(oferta.escenario));
      const costesIniciales = sumCents(
        oferta.escenario.vinculaciones
          .filter((vinculacion) => vinculacion.activo)
          .map((vinculacion) => vinculacion.costeInicial),
      );
      return {
        oferta,
        metricas: calcularMetricasOferta(oferta, contextoOferta(oferta, estado)),
        resultado: porId.get(oferta.id),
        vivienda: viviendaDeOferta(oferta, estado),
        tinInicial: flujo[1]?.tinAplicado ?? 0,
        costeVinculaciones: addCents(
          costesIniciales,
          sumCents(flujo.slice(1).map((linea) => linea.costesVinculados)),
        ),
        comisionApertura: flujo[0]?.comisiones ?? ZERO,
      };
    });
  }, [elegidas, estado]);

  if (ofertas.length === 0) {
    return (
      <EstadoVacio
        titulo="Añade tu primera hipoteca"
        texto="Guarda las propuestas de los bancos. Compararemos cuota, TIN, TAE, coste real, vinculaciones y qué ocurre si suben los tipos."
        enlace="/hipoteca"
        accion="Ir a Hipoteca"
      />
    );
  }

  const ganadora = comparables
    ? datos.find((dato) => dato.resultado?.esMejorGlobal === true)
    : undefined;
  const puntuaciones = datos.map((dato) =>
    comparables ? (dato.resultado?.puntuacion ?? null) : null,
  );
  const importes = datos.map((dato) => dato.oferta.escenario.importeSolicitado);
  const entradas = datos.map((dato) =>
    maxCents(
      ZERO,
      subtractCents(dato.oferta.escenario.precioCompra, dato.oferta.escenario.importeSolicitado),
    ),
  );
  const tins = datos.map((dato) => dato.tinInicial);
  const taesOficiales = datos.map(
    (dato) => dato.oferta.taeOficial ?? dato.oferta.escenario.taeOficial ?? null,
  );
  const taesEstimadas = datos.map((dato) => dato.metricas.taeEstimada || null);
  const cuotas = datos.map((dato) => dato.metricas.cuotaInicial);
  const cuotasTensionadas = datos.map((dato) => dato.metricas.cuotaTensionada);
  const costesReales = datos.map((dato) => dato.metricas.costeRealTotal);
  const efectivos = datos.map((dato) => dato.metricas.efectivoTotalNecesario);
  const desembolsos = datos.map((dato) => dato.metricas.desembolsoInicial);
  const vinculaciones = datos.map((dato) => dato.costeVinculaciones);
  const flexibilidad = datos.map((dato) => dato.metricas.indiceFlexibilidad);
  const resiliencia = datos.map((dato) => dato.metricas.indiceResiliencia);
  const ratios = datos.map((dato) => dato.metricas.ratioBancarioTensionado);

  const columnas: ColumnaComparativa[] = datos.map((dato) => ({
    id: dato.oferta.id,
    titulo: dato.oferta.banco,
    subtitulo: dato.oferta.nombre,
    enlace: `/hipoteca${dato.vivienda === undefined ? '' : `?vivienda=${encodeURIComponent(dato.vivienda.id)}&oferta=${encodeURIComponent(dato.oferta.id)}`}`,
    ...(ganadora?.oferta.id === dato.oferta.id && datos.length > 1
      ? { insignia: 'Mejor oferta' }
      : {}),
  }));

  const grupos: GrupoComparativo[] = [
    {
      id: 'decision',
      titulo: 'Decisión y seguridad',
      filas: [
        {
          id: 'valoracion',
          etiqueta: 'Valoración global',
          ayuda: comparables
            ? 'Según coste, cuota, riesgo y flexibilidad'
            : 'Solo válida para la misma compra',
          celdas: datos.map((_, indice) => ({
            contenido:
              puntuaciones[indice] === null
                ? 'No comparable'
                : `${Math.round(puntuaciones[indice] as number)}/100`,
            destacado: esMejor(puntuaciones, puntuaciones[indice] ?? null, 'mayor'),
          })),
        },
        {
          id: 'estado-oferta',
          etiqueta: 'Estado de la propuesta',
          celdas: datos.map((dato) => ({
            contenido: ETIQUETAS_ESTADO_OFERTA[dato.oferta.estado],
            ...(dato.oferta.estado === 'rechazada' ? { tono: 'negativo' as const } : {}),
          })),
        },
        {
          id: 'ahorro-suficiente',
          etiqueta: 'Ahorro suficiente',
          ayuda: 'Incluye gastos de la vivienda asignada',
          celdas: datos.map((dato) => {
            const suficiente = dato.metricas.ahorroSuficiente;
            return {
              contenido: suficiente === null ? 'Sin calcular' : suficiente ? 'Sí' : 'No',
              ...(suficiente === null
                ? {}
                : { tono: suficiente ? ('positivo' as const) : ('negativo' as const) }),
            };
          }),
        },
        {
          id: 'ratio-tensionado',
          etiqueta: 'Esfuerzo con tipos tensionados',
          ayuda: 'Cuota adversa + deudas / ingresos',
          celdas: datos.map((_, indice) => {
            const ratio = ratios[indice] ?? null;
            return {
              contenido: ratio === null ? 'Completa tus ingresos' : formatPorcentaje(ratio),
              destacado: esMejor(ratios, ratio, 'menor'),
              ...(ratio === null
                ? {}
                : {
                    tono:
                      ratio <= estado.ajustes.ratioBancarioMaximo
                        ? ('positivo' as const)
                        : ('negativo' as const),
                  }),
            };
          }),
        },
      ],
    },
    {
      id: 'prestamo',
      titulo: 'Préstamo y compra financiada',
      filas: [
        {
          id: 'vivienda',
          etiqueta: 'Vivienda asociada',
          celdas: datos.map((dato) => ({ contenido: dato.vivienda?.nombre ?? 'Sin asignar' })),
        },
        {
          id: 'tipo',
          etiqueta: 'Tipo de hipoteca',
          celdas: datos.map((dato) => ({ contenido: ETIQUETAS_TIPO[dato.oferta.escenario.tipo] })),
        },
        {
          id: 'precio-compra',
          etiqueta: 'Precio de compra',
          celdas: datos.map((dato) => ({
            contenido: formatEuros(dato.oferta.escenario.precioCompra),
          })),
        },
        {
          id: 'tasacion',
          etiqueta: 'Valor de tasación',
          celdas: datos.map((dato) => ({
            contenido: formatEuros(dato.oferta.escenario.valorTasacion),
          })),
        },
        {
          id: 'importe',
          etiqueta: 'Capital solicitado',
          celdas: datos.map((dato, indice) => ({
            contenido: formatEuros(dato.oferta.escenario.importeSolicitado),
            destacado: esMejor(importes, importes[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'financiacion',
          etiqueta: 'Financiación (LTV)',
          celdas: datos.map((dato) => ({ contenido: formatPorcentaje(dato.oferta.escenario.ltv) })),
        },
        {
          id: 'entrada',
          etiqueta: 'Entrada para el precio',
          celdas: datos.map((_, indice) => ({
            contenido: formatEuros(entradas[indice] as Cents),
            destacado: esMejor(entradas, entradas[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'plazo',
          etiqueta: 'Plazo',
          celdas: datos.map((dato) => ({ contenido: `${dato.oferta.escenario.plazoAnios} años` })),
        },
      ],
    },
    {
      id: 'intereses',
      titulo: 'Intereses y coste del dinero',
      filas: [
        {
          id: 'tin-inicial',
          etiqueta: 'TIN inicial aplicado',
          ayuda: 'Con bonificaciones activas',
          celdas: datos.map((dato, indice) => ({
            contenido: formatPorcentaje(dato.tinInicial),
            destacado: esMejor(tins, tins[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'tae-oficial',
          etiqueta: 'TAE oficial',
          ayuda: 'La indicada por el banco o FEIN',
          celdas: datos.map((_, indice) => ({
            contenido:
              taesOficiales[indice] === null
                ? 'Sin informar'
                : formatPorcentaje(taesOficiales[indice] as number),
            destacado: esMejor(taesOficiales, taesOficiales[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'tae-estimada',
          etiqueta: 'TAE estimada',
          ayuda: 'Calculada con los datos guardados',
          celdas: datos.map((_, indice) => ({
            contenido:
              taesEstimadas[indice] === null
                ? '—'
                : formatPorcentaje(taesEstimadas[indice] as number),
            destacado: esMejor(taesEstimadas, taesEstimadas[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'referencia-variable',
          etiqueta: 'Referencia variable',
          celdas: datos.map((dato) => {
            const escenario = dato.oferta.escenario;
            return {
              contenido:
                escenario.tipo === 'fija'
                  ? 'No aplica'
                  : `Euríbor ${formatPorcentaje(escenario.euribor ?? 0)} + ${formatPorcentaje(escenario.diferencial ?? 0)}`,
            };
          }),
        },
        {
          id: 'fase-fija',
          etiqueta: 'Fase fija en mixta',
          celdas: datos.map((dato) => ({
            contenido:
              dato.oferta.escenario.tipo !== 'mixta'
                ? 'No aplica'
                : `${dato.oferta.escenario.mixtaAniosFijos ?? 0} años`,
          })),
        },
      ],
    },
    {
      id: 'coste-riesgo',
      titulo: 'Cuotas, coste total y riesgo',
      filas: [
        {
          id: 'cuota-inicial',
          etiqueta: 'Cuota inicial',
          celdas: datos.map((dato, indice) => ({
            contenido: `${formatEuros(dato.metricas.cuotaInicial)}/mes`,
            destacado: esMejor(cuotas, cuotas[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'cuota-variable',
          etiqueta: 'Cuota tras la fase fija',
          celdas: datos.map((dato) => ({
            contenido:
              dato.metricas.cuotaPostFija === null
                ? 'No aplica'
                : `${formatEuros(dato.metricas.cuotaPostFija)}/mes`,
          })),
        },
        {
          id: 'cuota-tensionada',
          etiqueta: 'Cuota en escenario adverso',
          ayuda: '+2 puntos y sin bonificaciones',
          celdas: datos.map((dato, indice) => ({
            contenido: `${formatEuros(dato.metricas.cuotaTensionada)}/mes`,
            destacado: esMejor(cuotasTensionadas, cuotasTensionadas[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'subida-cuota',
          etiqueta: 'Aumento en escenario adverso',
          celdas: datos.map((dato) => ({
            contenido: `+${formatEuros(maxCents(ZERO, subtractCents(dato.metricas.cuotaTensionada, dato.metricas.cuotaInicial)))}/mes`,
          })),
        },
        {
          id: 'coste-real',
          etiqueta: 'Coste real total',
          ayuda: 'Entrada + cuotas + comisiones + vinculaciones',
          celdas: datos.map((dato, indice) => ({
            contenido: formatEuros(dato.metricas.costeRealTotal),
            destacado: esMejor(costesReales, costesReales[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'desembolso-hipoteca',
          etiqueta: 'Desembolso inicial hipotecario',
          ayuda: 'Entrada + apertura + productos',
          celdas: datos.map((dato, indice) => ({
            contenido: formatEuros(dato.metricas.desembolsoInicial),
            destacado: esMejor(desembolsos, desembolsos[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'efectivo-total',
          etiqueta: 'Efectivo total necesario',
          ayuda: 'Añade impuestos y gastos de compra',
          celdas: datos.map((_, indice) => ({
            contenido: efectivos[indice] === null ? '—' : formatEuros(efectivos[indice] as Cents),
            destacado: esMejor(efectivos, efectivos[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'resiliencia',
          etiqueta: 'Resistencia a subidas',
          ayuda: '100 es la mejor protección',
          celdas: datos.map((dato, indice) => ({
            contenido: `${Math.round(dato.metricas.indiceResiliencia)}/100`,
            destacado: esMejor(resiliencia, resiliencia[indice] ?? null, 'mayor'),
          })),
        },
      ],
    },
    {
      id: 'condiciones',
      titulo: 'Comisiones y vinculaciones',
      filas: [
        {
          id: 'apertura',
          etiqueta: 'Comisión de apertura',
          celdas: datos.map((dato) => ({
            contenido: `${formatPorcentaje(dato.oferta.escenario.comisiones.apertura)} · ${formatEuros(dato.comisionApertura)}`,
          })),
        },
        {
          id: 'vinculaciones-obligatorias',
          etiqueta: 'Productos obligatorios',
          celdas: datos.map((dato) => ({
            contenido: `${dato.metricas.numVinculacionesObligatorias}`,
          })),
        },
        {
          id: 'detalle-vinculaciones',
          etiqueta: 'Vinculaciones activas',
          celdas: datos.map((dato) => {
            const activas = dato.oferta.escenario.vinculaciones.filter(
              (vinculacion) => vinculacion.activo,
            );
            return {
              contenido:
                activas.length === 0
                  ? 'Ninguna'
                  : activas.map((vinculacion) => vinculacion.nombre).join(' · '),
            };
          }),
        },
        {
          id: 'coste-vinculaciones',
          etiqueta: 'Coste total de vinculaciones',
          celdas: datos.map((dato, indice) => ({
            contenido: formatEuros(dato.costeVinculaciones),
            destacado: esMejor(vinculaciones, vinculaciones[indice] ?? null, 'menor'),
          })),
        },
        {
          id: 'amortizacion-parcial',
          etiqueta: 'Comisión amortización parcial',
          celdas: datos.map((dato) => ({
            contenido: formatPorcentaje(dato.oferta.escenario.comisiones.amortizacionParcial),
          })),
        },
        {
          id: 'amortizacion-total',
          etiqueta: 'Comisión amortización total',
          celdas: datos.map((dato) => ({
            contenido: formatPorcentaje(dato.oferta.escenario.comisiones.amortizacionTotal),
          })),
        },
        {
          id: 'flexibilidad',
          etiqueta: 'Flexibilidad',
          ayuda: '100 equivale a no tener penalización',
          celdas: datos.map((dato, indice) => ({
            contenido: `${Math.round(dato.metricas.indiceFlexibilidad)}/100`,
            destacado: esMejor(flexibilidad, flexibilidad[indice] ?? null, 'mayor'),
          })),
        },
        {
          id: 'fecha',
          etiqueta: 'Fecha de la propuesta',
          celdas: datos.map((dato) => ({ contenido: formatFecha(dato.oferta.fecha) })),
        },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <SelectorComparacion
        id="hipoteca"
        nombre="hipoteca"
        opciones={opciones}
        seleccion={seleccion}
        onCambio={onCambio}
      />
      {datos.length === 0 ? (
        <p className="rounded-medio border border-linea bg-superficie px-4 py-6 text-center text-sm text-tinta-media">
          Selecciona al menos una hipoteca para ver sus condiciones.
        </p>
      ) : (
        <>
          {datos.length > 1 && !comparables && (
            <div
              role="status"
              className="rounded-medio border border-ajustado/35 bg-ajustado-tenue px-4 py-3 text-sm leading-relaxed text-tinta"
            >
              Estas hipotecas tienen precios de compra distintos. Puedes revisar sus cifras, pero la
              valoración no elegirá una ganadora hasta que financien la misma compra.
            </div>
          )}
          {datos.length > 1 && comparables && ganadora === undefined && (
            <div
              role="status"
              className="rounded-medio border border-no-viable/35 bg-no-viable-tenue px-4 py-3 text-sm leading-relaxed text-tinta"
            >
              Ninguna propuesta supera todos tus filtros de seguridad. Revisa ahorro, esfuerzo,
              estado de la oferta y condiciones tensionadas antes de decidir.
            </div>
          )}
          <TablaComparativa
            etiqueta="Comparación de hipotecas"
            columnas={columnas}
            grupos={grupos}
          />
        </>
      )}
    </div>
  );
}

export function Comparador() {
  const { estado } = useEstado();
  const [parametros, setParametros] = useSearchParams();
  const tipo: TipoComparacion = parametros.get('tipo') === 'hipotecas' ? 'hipotecas' : 'viviendas';
  const [seleccionViviendas, setSeleccionViviendas] = useState<Seleccion>(['', '', '']);
  const [seleccionHipotecas, setSeleccionHipotecas] = useState<Seleccion>(['', '', '']);

  function cambiarTipo(siguiente: TipoComparacion) {
    const nuevosParametros = new URLSearchParams(parametros);
    nuevosParametros.set('tipo', siguiente);
    setParametros(nuevosParametros, { replace: true });
  }

  return (
    <div className="space-y-5 pb-4">
      <div
        role="tablist"
        aria-label="Tipo de comparación"
        className="grid grid-cols-2 rounded-medio border border-linea bg-superficie-2 p-1 shadow-papel"
      >
        <button
          id="tab-comparador-viviendas"
          type="button"
          role="tab"
          aria-selected={tipo === 'viviendas'}
          aria-controls="panel-comparador-viviendas"
          onClick={() => cambiarTipo('viviendas')}
          className={[
            'min-h-toque rounded-chico px-3 py-2 text-sm font-semibold transition-colors',
            tipo === 'viviendas'
              ? 'bg-superficie text-acento shadow-papel'
              : 'text-tinta-media hover:text-tinta',
          ].join(' ')}
        >
          Viviendas
          <span className="ml-2 rounded-full bg-acento-tenue px-2 py-0.5 font-cifra text-xs text-acento">
            {estado.viviendas.length}
          </span>
        </button>
        <button
          id="tab-comparador-hipotecas"
          type="button"
          role="tab"
          aria-selected={tipo === 'hipotecas'}
          aria-controls="panel-comparador-hipotecas"
          onClick={() => cambiarTipo('hipotecas')}
          className={[
            'min-h-toque rounded-chico px-3 py-2 text-sm font-semibold transition-colors',
            tipo === 'hipotecas'
              ? 'bg-superficie text-acento shadow-papel'
              : 'text-tinta-media hover:text-tinta',
          ].join(' ')}
        >
          Hipotecas
          <span className="ml-2 rounded-full bg-acento-tenue px-2 py-0.5 font-cifra text-xs text-acento">
            {estado.ofertas.length}
          </span>
        </button>
      </div>

      {tipo === 'viviendas' ? (
        <div
          id="panel-comparador-viviendas"
          role="tabpanel"
          aria-labelledby="tab-comparador-viviendas"
        >
          <ComparacionViviendas
            viviendas={estado.viviendas}
            seleccion={seleccionViviendas}
            onCambio={setSeleccionViviendas}
            estado={estado}
          />
        </div>
      ) : (
        <div
          id="panel-comparador-hipotecas"
          role="tabpanel"
          aria-labelledby="tab-comparador-hipotecas"
        >
          <ComparacionHipotecas
            ofertas={estado.ofertas}
            seleccion={seleccionHipotecas}
            onCambio={setSeleccionHipotecas}
            estado={estado}
          />
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-tinta-suave">
        Las estimaciones sirven para comparar alternativas, no sustituyen la tasación, la inspección
        técnica, la nota simple ni las condiciones definitivas de la FEIN.
      </p>
    </div>
  );
}
