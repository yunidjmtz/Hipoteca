import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useEstado } from '@/app/EstadoProvider';
import { InputMoneda } from '@/components/InputMoneda';
import { InputNumeroEntero } from '@/components/InputNumeroEntero';
import { InfoTooltip } from '@/components/InfoTooltip';
import { Interruptor } from '@/components/Interruptor';
import { Icono } from '@/components/Icono';
import type { NombreIcono } from '@/components/Icono';
import { formatEuros } from '@/core/format';
import { addCents, clampCents, ZERO } from '@/core/money';
import type { Cents } from '@/core/money';
import {
  calcularIngresoMensualNormalizado,
  calcularOtrosIngresosMensuales,
} from '@/finance/affordability';
import type {
  SituacionLaboral,
  DeudaMensual,
  GastoFijo,
  OtroIngreso,
  Periodicidad,
  PerfilFinanciero,
  Titular,
} from '@/domain/types';

// ─── Textos de ayuda ─────────────────────────────────────────────────────────

const AYUDAS = {
  netoPorPaga:
    'Importe neto por paga, después de impuestos. Si tienes pagas extras, inclúyelas en «Pagas al año»; así el banco calcula el ingreso anual normalizado.',
  numeroPagas:
    'Los bancos trabajan con el ingreso anual dividido entre 12. Si tienes 14 pagas (incluidas extras), la fórmula es netoPorPaga × 14 / 12.',
  edad: 'La edad del titular mayor suele limitar el plazo máximo (la mayoría de bancos exige que la hipoteca venza antes de los 75–80 años).',
  situacionLaboral:
    'Los bancos valoran la estabilidad laboral de forma distinta. Este dato se guarda como referencia, pero no cambia automáticamente el cálculo.',
  ahorrosActuales:
    'Total de ahorro líquido disponible hoy: cuentas corrientes, depósitos y fondos rescatables. No incluyas planes de pensiones no disponibles.',
} as const;

// ─── Constantes UI ────────────────────────────────────────────────────────────

const ETIQUETAS_SITUACION: Record<SituacionLaboral, string> = {
  indefinido: 'Indefinido',
  funcionario: 'Funcionario/a',
  autonomo: 'Autónomo/a',
  temporal: 'Temporal',
  jubilado: 'Jubilado/a',
  otro: 'Otro',
};

const OPCIONES_PERIODICIDAD: readonly { valor: Periodicidad; etiqueta: string }[] = [
  { valor: 'mensual', etiqueta: 'Mensual' },
  { valor: 'bimestral', etiqueta: 'Bimestral' },
  { valor: 'trimestral', etiqueta: 'Trimestral' },
  { valor: 'semestral', etiqueta: 'Semestral' },
  { valor: 'anual', etiqueta: 'Anual' },
];

const DIVISORES_PERIODICIDAD: Record<Periodicidad, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

function mensualizar(importe: Cents, periodicidad: Periodicidad): Cents {
  return Math.round(importe / DIVISORES_PERIODICIDAD[periodicidad]) as Cents;
}

function etiquetaPeriodicidad(p: Periodicidad): string {
  return OPCIONES_PERIODICIDAD.find((op) => op.valor === p)?.etiqueta ?? p;
}

const claseSelect =
  'rounded-medio border border-linea bg-superficie px-3 py-2.5 text-sm text-tinta ' +
  'focus:outline-none focus:ring-2 focus:ring-acento/40 focus:border-acento ' +
  'transition-colors duration-100 appearance-none cursor-pointer min-h-toque';

const claseInput =
  'rounded-medio border border-linea bg-superficie px-3 py-2.5 text-sm text-tinta ' +
  'focus:outline-none focus:ring-2 focus:ring-acento/40 focus:border-acento ' +
  'transition-colors duration-100 min-h-toque w-full';

// ─── Estado del modal ─────────────────────────────────────────────────────────

type TipoModal = 'ingreso' | 'deuda' | 'gasto';

interface EstadoModal {
  tipo: TipoModal;
  editandoId: string | undefined;
  concepto: string;
  importe: Cents;
  periodicidad: Periodicidad;
  esAlquilerActual: boolean;
}

const TITULO_MODAL: Record<TipoModal, { nuevo: string; editar: string; placeholder: string }> = {
  ingreso: {
    nuevo: 'Nuevo ingreso',
    editar: 'Editar ingreso',
    placeholder: 'Alquiler, pensión, dividendos…',
  },
  deuda: {
    nuevo: 'Nueva deuda',
    editar: 'Editar deuda',
    placeholder: 'Préstamo personal, tarjeta…',
  },
  gasto: {
    nuevo: 'Nueva deuda o gasto',
    editar: 'Editar gasto',
    placeholder: 'Alquiler, préstamo, seguro…',
  },
};

// ─── Componentes UI auxiliares ────────────────────────────────────────────────

function Campo({
  htmlFor,
  etiqueta,
  ayuda,
  icono,
  children,
}: {
  readonly htmlFor: string;
  readonly etiqueta: string;
  readonly ayuda?: string;
  readonly icono?: NombreIcono;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {icono !== undefined && <Icono nombre={icono} tamano={16} className="text-acento" />}
        <label htmlFor={htmlFor} className="text-sm font-medium text-tinta">
          {etiqueta}
        </label>
        {ayuda !== undefined && <InfoTooltip texto={ayuda} />}
      </div>
      {children}
    </div>
  );
}

// ─── Tarjeta de ítem (lista) ──────────────────────────────────────────────────

function TarjetaItem({
  concepto,
  importe,
  periodicidad,
  esAlquilerActual = false,
  onEditar,
  onEliminar,
}: {
  readonly concepto: string;
  readonly importe: Cents;
  readonly periodicidad: Periodicidad;
  readonly esAlquilerActual?: boolean;
  readonly onEditar: () => void;
  readonly onEliminar: () => void;
}) {
  const mensual = mensualizar(importe, periodicidad);

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-medio border px-4 py-3',
        esAlquilerActual ? 'border-acento/40 bg-acento-tenue' : 'border-linea bg-superficie-2/40',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-tinta">
          {concepto !== '' ? (
            concepto
          ) : (
            <span className="text-tinta-suave italic">Sin concepto</span>
          )}
        </p>
        <p className="mt-0.5 font-cifra tabular-nums text-xs text-tinta-suave">
          {formatEuros(importe)} · {etiquetaPeriodicidad(periodicidad)}
          {periodicidad !== 'mensual' && importe > 0 && (
            <span className="text-acento"> · {formatEuros(mensual)}/mes</span>
          )}
        </p>
        {esAlquilerActual && (
          <p className="mt-1 text-[0.625rem] font-medium text-acento">
            Alquiler actual · se excluye al comprar
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onEditar}
          aria-label={`Editar ${concepto || 'elemento'}`}
          className="flex h-8 w-8 items-center justify-center rounded-medio border border-linea text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
        >
          <Icono nombre="editar" tamano={15} />
        </button>
        <button
          type="button"
          onClick={onEliminar}
          aria-label={`Eliminar ${concepto || 'elemento'}`}
          className="flex h-8 w-8 items-center justify-center rounded-medio border border-linea text-lg leading-none text-no-viable transition-colors hover:bg-no-viable/10"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ─── Gráficas ─────────────────────────────────────────────────────────────────

// ─── Tarjeta de stat compacta ─────────────────────────────────────────────────

// ─── Formulario de titular ───────────────────────────────────────────────────

function TitularForm({
  titular,
  indice,
  onChange,
  onEliminar,
}: {
  readonly titular: Titular;
  readonly indice: number;
  readonly onChange: (t: Titular) => void;
  readonly onEliminar?: () => void;
}) {
  const n = indice + 1;

  return (
    <fieldset className="relative flex flex-col gap-4 rounded-grande border border-linea bg-superficie-2/50 p-5 pt-8">
      <legend className="px-2 text-sm font-semibold text-tinta">
        <span className="inline-flex items-center gap-1.5">
          <Icono nombre="perfil" tamano={16} className="text-tinta" />
          Titular {n}
        </span>
      </legend>

      {onEliminar !== undefined && (
        <button
          type="button"
          onClick={onEliminar}
          aria-label={`Eliminar titular ${n}`}
          className="absolute right-4 top-3 flex h-8 items-center justify-center rounded-medio border border-linea px-3 text-sm text-no-viable transition-colors hover:bg-no-viable/10"
        >
          Eliminar
        </button>
      )}

      <InputMoneda
        id={`neto-T${n}`}
        etiqueta="Neto por paga"
        valor={titular.netoPorPaga}
        onChange={(v) => onChange({ ...titular, netoPorPaga: v })}
        ayuda={AYUDAS.netoPorPaga}
      />

      <div className="grid grid-cols-2 gap-4">
        <Campo htmlFor={`pagas-T${n}`} etiqueta="Pagas al año" ayuda={AYUDAS.numeroPagas}>
          <select
            id={`pagas-T${n}`}
            value={titular.numeroPagas}
            onChange={(e) => {
              const val = Number(e.target.value);
              onChange({ ...titular, numeroPagas: val === 14 ? 14 : 12 });
            }}
            className={claseSelect}
          >
            <option value={12}>12 pagas</option>
            <option value={14}>14 pagas</option>
          </select>
        </Campo>

        <Campo htmlFor={`edad-T${n}`} etiqueta="Edad" ayuda={AYUDAS.edad}>
          <InputNumeroEntero
            id={`edad-T${n}`}
            valor={titular.edad}
            minimo={18}
            maximo={80}
            onChange={(edad) => onChange({ ...titular, edad })}
            className={claseSelect}
          />
        </Campo>
      </div>

      <Campo
        htmlFor={`situacion-T${n}`}
        etiqueta="Situación laboral"
        ayuda={AYUDAS.situacionLaboral}
      >
        <select
          id={`situacion-T${n}`}
          value={titular.situacionLaboral}
          onChange={(e) =>
            onChange({ ...titular, situacionLaboral: e.target.value as SituacionLaboral })
          }
          className={claseSelect}
        >
          {(Object.keys(ETIQUETAS_SITUACION) as SituacionLaboral[]).map((k) => (
            <option key={k} value={k}>
              {ETIQUETAS_SITUACION[k]}
            </option>
          ))}
        </select>
      </Campo>
    </fieldset>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = 'titulares' | 'otros-ingresos' | 'deudas-gastos';

const TABS: readonly { id: TabId; etiqueta: string; icono: NombreIcono }[] = [
  { id: 'titulares', etiqueta: 'Titulares', icono: 'perfil' },
  { id: 'otros-ingresos', etiqueta: 'Ingresos', icono: 'resumen' },
  { id: 'deudas-gastos', etiqueta: 'Gastos', icono: 'escala' },
];

// ─── Página principal ────────────────────────────────────────────────────────

export function Perfil() {
  const { estado, actualizarPerfil } = useEstado();
  const { perfil } = estado;

  const [tabActiva, setTabActiva] = useState<TabId>('titulares');
  const [modalAbierto, setModalAbierto] = useState<EstadoModal | null>(null);
  const [intentoGuardar, setIntentoGuardar] = useState(false);

  // Cierra el modal con Escape
  useEffect(() => {
    if (modalAbierto === null) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalAbierto(null);
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [modalAbierto]);

  // ── Helpers de cálculo ──
  function computarTotalOtrosIngresos(lista: OtroIngreso[]): Cents {
    return lista.reduce(
      (acc, item) => (acc + mensualizar(item.importe, item.periodicidad)) as Cents,
      ZERO,
    );
  }

  // ── Handlers titulares ──
  function handleTitular(indice: number, t: Titular) {
    const titulares = perfil.titulares.map((titular, posicion) =>
      posicion === indice ? t : titular,
    );
    actualizarPerfil({ titulares: titulares as PerfilFinanciero['titulares'] });
  }

  function anadirTitular() {
    const titularPorDefecto: Titular = {
      netoPorPaga: ZERO,
      numeroPagas: 12,
      edad: 35,
      situacionLaboral: 'indefinido',
    };
    actualizarPerfil({
      titulares: [...perfil.titulares, titularPorDefecto] as PerfilFinanciero['titulares'],
    });
  }

  function eliminarTitular(indice: number) {
    const titulares = perfil.titulares.filter((_, posicion) => posicion !== indice);
    actualizarPerfil({ titulares: titulares as PerfilFinanciero['titulares'] });
  }

  function irATabSiguiente() {
    const indiceActual = TABS.findIndex((tab) => tab.id === tabActiva);
    const indiceSiguiente = (indiceActual + 1) % TABS.length;
    setTabActiva(TABS[indiceSiguiente]!.id);
  }

  function irATabAnterior() {
    const indiceActual = TABS.findIndex((tab) => tab.id === tabActiva);
    const indiceAnterior = (indiceActual - 1 + TABS.length) % TABS.length;
    setTabActiva(TABS[indiceAnterior]!.id);
  }

  // ── Handlers deudas ──
  function eliminarDeuda(id: string) {
    actualizarPerfil({ deudas: perfil.deudas.filter((d) => d.id !== id) });
  }

  function actualizarDeuda(id: string, cambios: Partial<DeudaMensual>) {
    actualizarPerfil({
      deudas: perfil.deudas.map((d) => (d.id === id ? { ...d, ...cambios } : d)),
    });
  }

  // ── Handlers gastos fijos ──
  function eliminarGasto(id: string) {
    actualizarPerfil({ gastosFijos: perfil.gastosFijos.filter((g) => g.id !== id) });
  }

  function actualizarGasto(id: string, cambios: Partial<GastoFijo>) {
    actualizarPerfil({
      gastosFijos: perfil.gastosFijos.map((g) => {
        if (g.id === id) return { ...g, ...cambios };
        return cambios.esAlquilerActual === true ? { ...g, esAlquilerActual: false } : g;
      }),
    });
  }

  // ── Handlers otros ingresos ──
  function eliminarIngreso(id: string) {
    const nuevaLista = perfil.otrosIngresos.filter((i) => i.id !== id);
    actualizarPerfil({
      otrosIngresos: nuevaLista,
      otrosIngresosMensuales: computarTotalOtrosIngresos(nuevaLista),
    });
  }

  function actualizarIngreso(id: string, cambios: Partial<OtroIngreso>) {
    const nuevaLista = perfil.otrosIngresos.map((i) => (i.id === id ? { ...i, ...cambios } : i));
    actualizarPerfil({
      otrosIngresos: nuevaLista,
      otrosIngresosMensuales: computarTotalOtrosIngresos(nuevaLista),
    });
  }

  // ── Abrir modal ──
  function abrirNuevo(tipo: TipoModal) {
    setIntentoGuardar(false);
    setModalAbierto({
      tipo,
      editandoId: undefined,
      concepto: '',
      importe: ZERO,
      periodicidad: 'mensual',
      esAlquilerActual: false,
    });
  }

  function abrirEditar(
    tipo: TipoModal,
    item: {
      id: string;
      concepto: string;
      importe: Cents;
      periodicidad: Periodicidad;
      esAlquilerActual?: boolean;
    },
  ) {
    setIntentoGuardar(false);
    setModalAbierto({
      tipo,
      editandoId: item.id,
      concepto: item.concepto,
      importe: item.importe,
      periodicidad: item.periodicidad,
      esAlquilerActual: item.esAlquilerActual ?? false,
    });
  }

  // ── Guardar modal ──
  function guardarModal() {
    if (modalAbierto === null) return;
    const { tipo, editandoId, concepto, importe, periodicidad, esAlquilerActual } = modalAbierto;
    const conceptoFinal = concepto.trim();

    if (conceptoFinal === '' || importe === 0) {
      setIntentoGuardar(true);
      return;
    }

    if (tipo === 'ingreso') {
      if (editandoId !== undefined) {
        actualizarIngreso(editandoId, { concepto: conceptoFinal, importe, periodicidad });
      } else {
        const nuevaLista: OtroIngreso[] = [
          ...perfil.otrosIngresos,
          { id: crypto.randomUUID(), concepto: conceptoFinal, importe, periodicidad },
        ];
        actualizarPerfil({
          otrosIngresos: nuevaLista,
          otrosIngresosMensuales: computarTotalOtrosIngresos(nuevaLista),
        });
      }
    } else if (tipo === 'deuda') {
      if (editandoId !== undefined) {
        actualizarDeuda(editandoId, { concepto: conceptoFinal, importe, periodicidad });
      } else {
        actualizarPerfil({
          deudas: [
            ...perfil.deudas,
            {
              id: crypto.randomUUID(),
              concepto: conceptoFinal,
              importe,
              periodicidad,
            } satisfies DeudaMensual,
          ],
        });
      }
    } else {
      if (editandoId !== undefined) {
        actualizarGasto(editandoId, {
          concepto: conceptoFinal,
          importe,
          periodicidad,
          esAlquilerActual,
        });
      } else {
        actualizarPerfil({
          gastosFijos: [
            ...(esAlquilerActual
              ? perfil.gastosFijos.map((g) => ({ ...g, esAlquilerActual: false }))
              : perfil.gastosFijos),
            {
              id: crypto.randomUUID(),
              concepto: conceptoFinal,
              importe,
              periodicidad,
              esAlquilerActual,
            } satisfies GastoFijo,
          ],
        });
      }
    }

    setModalAbierto(null);
  }

  // ── Cálculos derivados ──
  const totalOtrosIngresos: Cents = perfil.otrosIngresos.reduce(
    (acc, item) => (acc + mensualizar(item.importe, item.periodicidad)) as Cents,
    ZERO,
  );

  const totalDeudas: Cents = perfil.deudas.reduce(
    (acc, d) => (acc + mensualizar(d.importe, d.periodicidad)) as Cents,
    ZERO,
  );

  const totalGastosDetallados: Cents = perfil.gastosFijos.reduce(
    (acc, g) => (acc + mensualizar(g.importe, g.periodicidad)) as Cents,
    ZERO,
  );

  const totalIngresosMensuales = addCents(
    calcularIngresoMensualNormalizado(perfil.titulares),
    calcularOtrosIngresosMensuales(perfil),
  );

  useEffect(() => {
    if (perfil.gastoGeneralMensual > totalIngresosMensuales) {
      actualizarPerfil({ gastoGeneralMensual: totalIngresosMensuales });
    }
  }, [actualizarPerfil, perfil.gastoGeneralMensual, totalIngresosMensuales]);

  const hayOtroAlquilerActual = perfil.gastosFijos.some(
    (gasto) => gasto.esAlquilerActual && gasto.id !== modalAbierto?.editandoId,
  );

  // ── Modal info ──
  const modalInfo = modalAbierto !== null ? TITULO_MODAL[modalAbierto.tipo] : undefined;
  const tituloModal =
    modalAbierto !== null && modalInfo !== undefined
      ? modalAbierto.editandoId !== undefined
        ? modalInfo.editar
        : modalInfo.nuevo
      : '';
  const errorConcepto =
    intentoGuardar && modalAbierto !== null && modalAbierto.concepto.trim() === '';
  const errorImporte = intentoGuardar && modalAbierto !== null && modalAbierto.importe === 0;

  return (
    <div className="flex flex-col gap-5 pt-16">
      <header className="sr-only">
        <h1 className="font-display text-2xl text-tinta">Mi situación financiera</h1>
      </header>

      <div
        role="tablist"
        aria-label="Situación financiera para el cálculo"
        className="fixed inset-x-0 top-[3.75rem] z-[19] flex border-b border-linea bg-superficie/90 backdrop-blur-xl lg:top-0 lg:z-20"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tabActiva === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setTabActiva(tab.id)}
            className={[
              'flex flex-1 items-center justify-center gap-2 px-3 py-3.5 text-sm font-medium',
              'border-b-2 -mb-px transition-colors duration-150 min-h-toque',
              tabActiva === tab.id
                ? 'border-acento text-acento bg-superficie'
                : 'border-transparent text-tinta-media hover:text-tinta hover:bg-superficie/60',
            ].join(' ')}
          >
            <Icono nombre={tab.icono} tamano={14} />
            <span className="hidden sm:inline">{tab.etiqueta}</span>
            <span className="sm:hidden text-xs">{tab.etiqueta.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* ── Panel con tabs ────────────────────────────────────────────── */}
      <div className="aparece-1 overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
        {/* Tab content */}
        <div
          id={`panel-${tabActiva}`}
          role="tabpanel"
          aria-labelledby={`tab-${tabActiva}`}
          className="px-4 py-6"
        >
          {/* ── TAB: Titulares ─────────────────────────────────────── */}
          {tabActiva === 'titulares' && (
            <div className="flex flex-col gap-5">
              {perfil.titulares.map((titular, indice) => (
                <TitularForm
                  key={indice}
                  titular={titular}
                  indice={indice}
                  onChange={(titularActualizado) => handleTitular(indice, titularActualizado)}
                  {...(indice === 0 ? {} : { onEliminar: () => eliminarTitular(indice) })}
                />
              ))}

              {perfil.titulares.length < 3 && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={anadirTitular}
                    className="rounded-medio border border-linea bg-superficie px-4 py-2 text-sm text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
                  >
                    + Añadir titular
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: Otros ingresos ────────────────────────────────── */}
          {tabActiva === 'otros-ingresos' && (
            <div className="flex flex-col gap-4">
              <section
                aria-label="Ahorros actuales"
                className="rounded-grande border border-linea bg-superficie-2/40 p-4"
              >
                <InputMoneda
                  id="ahorros-actuales"
                  etiqueta="Ahorros actuales"
                  valor={perfil.ahorrosActuales}
                  onChange={(v) => actualizarPerfil({ ahorrosActuales: v })}
                  ayuda={AYUDAS.ahorrosActuales}
                  icono="capacidad"
                />
              </section>

              <section
                aria-labelledby="ingresos-adicionales-titulo"
                className="rounded-grande border border-linea bg-superficie-2/40 p-4"
              >
                <h2 id="ingresos-adicionales-titulo" className="text-base font-semibold text-tinta">
                  Ingresos adicionales
                </h2>
                <fieldset
                  className="mt-4 flex flex-col gap-2"
                  aria-describedby="modo-ingresos-ayuda"
                >
                  <legend className="text-sm font-medium text-tinta">
                    ¿Cómo quieres indicar tus ingresos adicionales?
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['general', 'General'],
                        ['desglosado', 'Desglosado'],
                      ] as const
                    ).map(([modo, etiqueta]) => (
                      <label key={modo} className="cursor-pointer">
                        <input
                          type="radio"
                          name="modo-otros-ingresos"
                          value={modo}
                          checked={(perfil.modoOtrosIngresos ?? 'general') === modo}
                          onChange={() => actualizarPerfil({ modoOtrosIngresos: modo })}
                          className="peer sr-only"
                        />
                        <span className="flex min-h-toque items-center justify-center rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-medium text-tinta transition-colors peer-checked:border-acento peer-checked:bg-acento-tenue peer-checked:text-acento peer-focus-visible:ring-2 peer-focus-visible:ring-acento/40">
                          {etiqueta}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p id="modo-ingresos-ayuda" className="text-xs leading-relaxed text-tinta-suave">
                    Elige una sola forma de cálculo. La otra se conserva para que puedas cambiar
                    cuando quieras.
                  </p>
                </fieldset>

                {(perfil.modoOtrosIngresos ?? 'general') === 'general' ? (
                  <section aria-label="Ingresos adicionales generales" className="mt-4">
                    <InputMoneda
                      id="otros-ingresos-mensuales"
                      etiqueta="Ingresos adicionales al mes"
                      ayuda="Una estimación mensual de ingresos aparte de las nóminas de los titulares."
                      valor={perfil.otrosIngresosMensuales}
                      onChange={(otrosIngresosMensuales) =>
                        actualizarPerfil({ otrosIngresosMensuales })
                      }
                    />
                    <p className="mt-2 text-xs leading-relaxed text-tinta-suave">
                      Ajusta una estimación mensual rápida con la barra.
                    </p>
                  </section>
                ) : null}

                {(perfil.modoOtrosIngresos ?? 'general') === 'desglosado' ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => abrirNuevo('ingreso')}
                        className="flex items-center gap-2 rounded-medio border border-acento px-4 py-2 text-sm text-acento transition-colors hover:bg-acento-tenue"
                      >
                        <span aria-hidden="true">+</span>
                        Añadir ingreso
                      </button>
                      {totalOtrosIngresos > 0 && (
                        <span className="font-cifra tabular-nums text-sm text-tinta-media">
                          Total{' '}
                          <span className="font-semibold text-tinta">
                            {formatEuros(totalOtrosIngresos)}/mes
                          </span>
                        </span>
                      )}
                    </div>

                    {perfil.otrosIngresos.length === 0 ? (
                      <p className="text-sm text-tinta-suave">
                        Sin ingresos adicionales registrados.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {perfil.otrosIngresos.map((ingreso) => (
                          <TarjetaItem
                            key={ingreso.id}
                            concepto={ingreso.concepto}
                            importe={ingreso.importe}
                            periodicidad={ingreso.periodicidad}
                            onEditar={() => abrirEditar('ingreso', ingreso)}
                            onEliminar={() => eliminarIngreso(ingreso.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
            </div>
          )}

          {/* ── TAB: Deudas y gastos ───────────────────────────────── */}
          {tabActiva === 'deudas-gastos' && (
            <div className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2" aria-describedby="modo-gastos-ayuda">
                <legend className="text-sm font-medium text-tinta">
                  ¿Cómo quieres indicar tus gastos?
                </legend>
                <p id="modo-gastos-ayuda" className="text-xs leading-relaxed text-tinta-suave">
                  Elige una sola forma de cálculo. La otra se conserva para que puedas cambiar
                  cuando quieras.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['general', 'General'],
                      ['desglosado', 'Desglosado'],
                    ] as const
                  ).map(([modo, etiqueta]) => (
                    <label key={modo} className="cursor-pointer">
                      <input
                        type="radio"
                        name="modo-gastos-mensuales"
                        value={modo}
                        checked={(perfil.modoGastosMensuales ?? 'general') === modo}
                        onChange={() => actualizarPerfil({ modoGastosMensuales: modo })}
                        className="peer sr-only"
                      />
                      <span className="flex min-h-toque items-center justify-center rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-medium text-tinta transition-colors peer-checked:border-acento peer-checked:bg-acento-tenue peer-checked:text-acento peer-focus-visible:ring-2 peer-focus-visible:ring-acento/40">
                        {etiqueta}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {(perfil.modoGastosMensuales ?? 'general') === 'general' ? (
                <section
                  aria-label="Gasto mensual general"
                  className="rounded-grande border border-linea bg-superficie-2/40 p-4"
                >
                  <InputMoneda
                    id="gasto-general-mensual"
                    comoDeslizador
                    etiqueta="Gasto mensual general"
                    ayuda="Una estimación mensual para tus gastos habituales. No puede superar el total de tus ingresos mensuales."
                    valor={perfil.gastoGeneralMensual}
                    maximoDeslizador={totalIngresosMensuales}
                    onChange={(gastoGeneralMensual) =>
                      actualizarPerfil({
                        gastoGeneralMensual: clampCents(
                          gastoGeneralMensual,
                          ZERO,
                          totalIngresosMensuales,
                        ),
                      })
                    }
                  />
                </section>
              ) : null}

              {(perfil.modoGastosMensuales ?? 'general') === 'general' &&
                perfil.deudas.length > 0 && (
                  <section aria-label="Deudas" className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-medium text-tinta">Deudas</h2>
                      <span className="font-cifra tabular-nums text-sm text-tinta-media">
                        Total{' '}
                        <span className="font-semibold text-tinta">
                          {formatEuros(totalDeudas)}/mes
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {perfil.deudas.map((deuda) => (
                        <TarjetaItem
                          key={deuda.id}
                          concepto={deuda.concepto}
                          importe={deuda.importe}
                          periodicidad={deuda.periodicidad}
                          onEditar={() => abrirEditar('deuda', deuda)}
                          onEliminar={() => eliminarDeuda(deuda.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}

              {(perfil.modoGastosMensuales ?? 'general') === 'desglosado' ? (
                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => abrirNuevo('gasto')}
                      className="flex items-center gap-2 rounded-medio border border-acento px-4 py-2 text-sm text-acento transition-colors hover:bg-acento-tenue"
                    >
                      <span aria-hidden="true">+</span>
                      Añadir gasto
                    </button>
                  </div>

                  {(perfil.deudas.length > 0 || perfil.gastosFijos.length > 0) && (
                    <div className="flex flex-col gap-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        {perfil.deudas.length > 0 && (
                          <section aria-label="Deudas" className="flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-3">
                              <h2 className="text-sm font-medium text-tinta">Deudas</h2>
                              <span className="font-cifra tabular-nums text-sm text-tinta-media">
                                Total{' '}
                                <span className="font-semibold text-tinta">
                                  {formatEuros(totalDeudas)}/mes
                                </span>
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              {perfil.deudas.map((deuda) => (
                                <TarjetaItem
                                  key={deuda.id}
                                  concepto={deuda.concepto}
                                  importe={deuda.importe}
                                  periodicidad={deuda.periodicidad}
                                  onEditar={() => abrirEditar('deuda', deuda)}
                                  onEliminar={() => eliminarDeuda(deuda.id)}
                                />
                              ))}
                            </div>
                          </section>
                        )}
                        {perfil.gastosFijos.length > 0 && (
                          <section aria-label="Gastos" className="flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-3">
                              <h2 className="text-sm font-medium text-tinta">Gastos detallados</h2>
                              <span className="font-cifra tabular-nums text-sm text-tinta-media">
                                Total{' '}
                                <span className="font-semibold text-tinta">
                                  {formatEuros(totalGastosDetallados)}/mes
                                </span>
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              {perfil.gastosFijos.map((gasto) => (
                                <TarjetaItem
                                  key={gasto.id}
                                  concepto={gasto.concepto}
                                  importe={gasto.importe}
                                  periodicidad={gasto.periodicidad}
                                  esAlquilerActual={gasto.esAlquilerActual ?? false}
                                  onEditar={() => abrirEditar('gasto', gasto)}
                                  onEliminar={() => eliminarGasto(gasto.id)}
                                />
                              ))}
                            </div>
                          </section>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex justify-between border-t border-linea bg-superficie-2/40 px-6 py-4">
          {tabActiva !== TABS[0]!.id ? (
            <button
              type="button"
              onClick={irATabAnterior}
              className="flex min-h-toque items-center gap-2 rounded-medio border border-linea bg-superficie px-4 py-2 text-sm font-medium text-tinta transition-colors hover:bg-superficie-2 focus:outline-none focus:ring-2 focus:ring-acento/40 focus:ring-offset-2"
            >
              <span aria-hidden="true">←</span>
              Anterior
            </button>
          ) : (
            <span />
          )}
          {tabActiva === 'deudas-gastos' ? (
            <Link
              to="/resumen"
              className="flex min-h-toque items-center gap-2 rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-acento/90 focus:outline-none focus:ring-2 focus:ring-acento/40 focus:ring-offset-2"
            >
              Ir al resumen
              <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={irATabSiguiente}
              className="flex min-h-toque items-center gap-2 rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-acento/90 focus:outline-none focus:ring-2 focus:ring-acento/40 focus:ring-offset-2"
            >
              Siguiente
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Modal añadir / editar ─────────────────────────────────── */}
      {modalAbierto !== null && modalInfo !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-tinta/25 backdrop-blur-sm"
            onClick={() => setModalAbierto(null)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={tituloModal}
            className="relative z-10 w-full max-w-sm rounded-grande border border-linea bg-superficie shadow-elevado"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-linea px-6 py-4">
              <h3 className="font-display text-lg text-tinta">{tituloModal}</h3>
              <button
                type="button"
                onClick={() => setModalAbierto(null)}
                aria-label="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-medio border border-linea text-lg leading-none text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-4 p-6">
              {modalAbierto.tipo !== 'ingreso' && modalAbierto.editandoId === undefined && (
                <Campo htmlFor="modal-tipo" etiqueta="Tipo">
                  <select
                    id="modal-tipo"
                    value={modalAbierto.tipo}
                    onChange={(e) =>
                      setModalAbierto({
                        ...modalAbierto,
                        tipo: e.target.value as 'deuda' | 'gasto',
                        esAlquilerActual: false,
                      })
                    }
                    className={claseSelect}
                  >
                    <option value="deuda">Deuda</option>
                    <option value="gasto">Gasto</option>
                  </select>
                </Campo>
              )}

              {/* Concepto */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="modal-concepto" className="text-sm font-medium text-tinta">
                  Concepto <span className="text-no-viable">*</span>
                </label>
                <input
                  id="modal-concepto"
                  type="text"
                  value={modalAbierto.concepto}
                  placeholder={modalInfo.placeholder}
                  onChange={(e) => setModalAbierto({ ...modalAbierto, concepto: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') guardarModal();
                  }}
                  aria-invalid={errorConcepto || undefined}
                  className={[claseInput, errorConcepto ? 'border-no-viable text-no-viable' : '']
                    .filter(Boolean)
                    .join(' ')}
                  autoFocus
                />
                {errorConcepto && (
                  <p className="text-xs text-no-viable">El concepto es obligatorio.</p>
                )}
              </div>

              {/* Importe */}
              <InputMoneda
                id="modal-importe"
                etiqueta="Importe *"
                valor={modalAbierto.importe}
                onChange={(v) => setModalAbierto({ ...modalAbierto, importe: v })}
                {...(errorImporte ? { error: 'El importe debe ser mayor que 0.' } : {})}
              />

              {/* Periodicidad */}
              <Campo htmlFor="modal-periodo" etiqueta="Periodicidad">
                <select
                  id="modal-periodo"
                  value={modalAbierto.periodicidad}
                  onChange={(e) =>
                    setModalAbierto({
                      ...modalAbierto,
                      periodicidad: e.target.value as Periodicidad,
                    })
                  }
                  className={claseSelect}
                >
                  {OPCIONES_PERIODICIDAD.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {op.etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>

              {modalAbierto.tipo === 'gasto' &&
                (modalAbierto.esAlquilerActual || !hayOtroAlquilerActual) && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-medio border border-linea bg-superficie-2/40 p-3 text-sm text-tinta">
                    <Interruptor
                      activado={modalAbierto.esAlquilerActual}
                      alCambiar={(e) =>
                        setModalAbierto({ ...modalAbierto, esAlquilerActual: e.target.checked })
                      }
                    />
                    <span>
                      <span className="block font-medium">Es mi alquiler actual</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-tinta-suave">
                        Se elimina de los gastos al calcular la compra de tu vivienda.
                      </span>
                    </span>
                  </label>
                )}

              {/* Equivalente mensual */}
              {modalAbierto.importe > 0 && modalAbierto.periodicidad !== 'mensual' && (
                <p className="text-sm text-tinta-suave">
                  ={' '}
                  <span className="font-cifra tabular-nums text-acento">
                    {formatEuros(mensualizar(modalAbierto.importe, modalAbierto.periodicidad))}
                  </span>{' '}
                  / mes
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t border-linea px-6 py-4">
              <button
                type="button"
                onClick={() => setModalAbierto(null)}
                className="rounded-medio border border-linea bg-superficie px-4 py-2 text-sm text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarModal}
                className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento transition-colors hover:bg-acento/90"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
