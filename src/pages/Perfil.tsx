import { useState, useEffect } from 'react';
import { useEstado } from '@/app/EstadoProvider';
import { InputMoneda } from '@/components/InputMoneda';
import { InputNumeroEntero } from '@/components/InputNumeroEntero';
import { InfoTooltip } from '@/components/InfoTooltip';
import { Icono } from '@/components/Icono';
import type { NombreIcono } from '@/components/Icono';
import { formatEuros } from '@/core/format';
import { ZERO } from '@/core/money';
import type { Cents } from '@/core/money';
import type {
  SituacionLaboral,
  DeudaMensual,
  GastoFijo,
  OtroIngreso,
  Periodicidad,
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
  precioObjetivo:
    'El precio de la vivienda que tienes en mente. A partir de aquí se calculan impuestos, entrada mínima y cuota estimada.',
  estadoVivienda:
    'Usada: tributa ITP (varía por comunidad autónoma, habitualmente 6–10 %). Nueva: IVA 10 % + AJD. La diferencia puede ser de varios miles de euros.',
  destino:
    'La vivienda habitual tiene deducciones fiscales autonómicas. Segunda residencia e inversión tributan igual pero sin deducciones adicionales.',
  ccaa: 'La comunidad autónoma determina el ITP o el AJD. Aragón está configurada específicamente; para las demás usamos una estimación editable.',
  esVpoEspecial:
    'Vivienda de Protección Oficial con tipo reducido de IVA (4 % en lugar del 10 %). Solo aplica a VPO de régimen especial.',
} as const;

// ─── Constantes UI ────────────────────────────────────────────────────────────

const CCAA_ESPANA = [
  'Andalucía',
  'Aragón',
  'Asturias',
  'Islas Baleares',
  'Canarias',
  'Cantabria',
  'Castilla-La Mancha',
  'Castilla y León',
  'Cataluña',
  'Extremadura',
  'Galicia',
  'La Rioja',
  'Madrid',
  'Murcia',
  'Navarra',
  'País Vasco',
  'Comunitat Valenciana',
  'Ceuta',
  'Melilla',
  'Genérica (editable)',
] as const;

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
    nuevo: 'Nuevo gasto',
    editar: 'Editar gasto',
    placeholder: 'Comunidad, seguro, suministros…',
  },
};

// ─── Componentes UI auxiliares ────────────────────────────────────────────────

function Campo({
  htmlFor,
  etiqueta,
  ayuda,
  children,
}: {
  readonly htmlFor: string;
  readonly etiqueta: string;
  readonly ayuda?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center">
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
    <div className="flex items-center gap-3 rounded-medio border border-linea bg-superficie-2/40 px-4 py-3">
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
}: {
  readonly titular: Titular;
  readonly indice: number;
  readonly onChange: (t: Titular) => void;
}) {
  const n = indice + 1;

  return (
    <fieldset className="flex flex-col gap-4 rounded-grande border border-linea bg-superficie-2/50 p-5">
      <legend className="px-2 text-sm font-semibold text-tinta">Titular {n}</legend>

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

type TabId = 'vivienda' | 'titulares' | 'otros-ingresos' | 'deudas-gastos';

const TABS: readonly { id: TabId; etiqueta: string; icono: NombreIcono }[] = [
  { id: 'vivienda', etiqueta: 'Vivienda', icono: 'casa' },
  { id: 'titulares', etiqueta: 'Titulares', icono: 'perfil' },
  { id: 'otros-ingresos', etiqueta: 'Otros ingresos', icono: 'resumen' },
  { id: 'deudas-gastos', etiqueta: 'Deudas y gastos', icono: 'escala' },
];

// ─── Página principal ────────────────────────────────────────────────────────

export function Perfil() {
  const { estado, actualizarPerfil, actualizarPreferencias } = useEstado();
  const { perfil, preferencias } = estado;

  const [tabActiva, setTabActiva] = useState<TabId>('vivienda');
  const [mostrarSegundo, setMostrarSegundo] = useState<boolean>(perfil.titulares.length === 2);
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
    if (indice === 0) {
      if (perfil.titulares.length === 2) {
        const segundo = perfil.titulares[1];
        actualizarPerfil({ titulares: [t, segundo] });
      } else {
        actualizarPerfil({ titulares: [t] });
      }
    } else {
      const primero = perfil.titulares[0];
      actualizarPerfil({ titulares: [primero, t] });
    }
  }

  function toggleSegundoTitular() {
    if (mostrarSegundo) {
      const primero = perfil.titulares[0];
      actualizarPerfil({ titulares: [primero] });
      setMostrarSegundo(false);
    } else {
      const primero = perfil.titulares[0];
      const segundoPorDefecto: Titular = {
        netoPorPaga: ZERO,
        numeroPagas: 12,
        edad: 35,
        situacionLaboral: 'indefinido',
      };
      actualizarPerfil({ titulares: [primero, segundoPorDefecto] });
      setMostrarSegundo(true);
    }
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
      gastosFijos: perfil.gastosFijos.map((g) => (g.id === id ? { ...g, ...cambios } : g)),
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
            ...perfil.gastosFijos,
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

  const totalGastosFijos: Cents = perfil.gastosFijos.reduce(
    (acc, g) => (acc + mensualizar(g.importe, g.periodicidad)) as Cents,
    ZERO,
  );

  const titularUno = perfil.titulares[0];
  const titularDos = perfil.titulares.length === 2 ? perfil.titulares[1] : undefined;

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
    <div className="flex flex-col gap-5 aparece-1">
      <header>
        <p className="rotulo mb-1">Paso 1</p>
        <h1 className="font-display text-2xl text-tinta">Cuéntanos tu situación</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinta-media">
          Empieza por la vivienda, tus ingresos, ahorros y deudas. Los cálculos se actualizan y se
          guardan automáticamente en este dispositivo.
        </p>
      </header>

      {/* ── Panel con tabs ────────────────────────────────────────────── */}
      <div className="rounded-grande border border-linea bg-superficie shadow-papel overflow-hidden">
        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Datos para el cálculo"
          className="flex border-b border-linea bg-superficie-2/60"
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

        {/* Tab content */}
        <div
          id={`panel-${tabActiva}`}
          role="tabpanel"
          aria-labelledby={`tab-${tabActiva}`}
          className="p-6"
        >
          {/* ── TAB: Vivienda ──────────────────────────────────────── */}
          {tabActiva === 'vivienda' && (
            <div className="flex flex-col gap-5">
              <div className="max-w-sm">
                <InputMoneda
                  id="precio-objetivo"
                  etiqueta="Precio objetivo de la vivienda"
                  valor={preferencias.precioObjetivo}
                  onChange={(v) => actualizarPreferencias({ precioObjetivo: v })}
                  ayuda={AYUDAS.precioObjetivo}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo htmlFor="ccaa" etiqueta="Comunidad autónoma" ayuda={AYUDAS.ccaa}>
                  <select
                    id="ccaa"
                    value={preferencias.ccaa}
                    onChange={(e) => actualizarPreferencias({ ccaa: e.target.value })}
                    className={claseSelect}
                  >
                    {CCAA_ESPANA.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Campo>

                <Campo
                  htmlFor="estado-vivienda"
                  etiqueta="Estado de la vivienda"
                  ayuda={AYUDAS.estadoVivienda}
                >
                  <select
                    id="estado-vivienda"
                    value={preferencias.estadoVivienda}
                    onChange={(e) =>
                      actualizarPreferencias({
                        estadoVivienda: e.target.value as 'usada' | 'nueva',
                        esVpoEspecial: false,
                      })
                    }
                    className={claseSelect}
                  >
                    <option value="usada">Usada (ITP)</option>
                    <option value="nueva">Nueva (IVA)</option>
                  </select>
                </Campo>

                <Campo htmlFor="destino-compra" etiqueta="Destino" ayuda={AYUDAS.destino}>
                  <select
                    id="destino-compra"
                    value={preferencias.destino}
                    onChange={(e) =>
                      actualizarPreferencias({
                        destino: e.target.value as 'habitual' | 'segunda' | 'inversion',
                      })
                    }
                    className={claseSelect}
                  >
                    <option value="habitual">Vivienda habitual</option>
                    <option value="segunda">Segunda residencia</option>
                    <option value="inversion">Inversión</option>
                  </select>
                </Campo>
              </div>

              {preferencias.ccaa !== '' && preferencias.ccaa !== 'Aragón' && (
                <div className="rounded-medio border border-revisar/40 bg-revisar-tenue px-4 py-3 text-sm text-tinta">
                  Para {preferencias.ccaa} usamos provisionalmente un ITP del 8 % y un AJD del 1,5
                  %, sin bonificaciones autonómicas. Confirma los tipos aplicables y corrígelos en
                  Ajustes antes de decidir.
                </div>
              )}

              {preferencias.estadoVivienda === 'usada' && (
                <div className="max-w-sm">
                  <InputMoneda
                    id="valor-referencia-fiscal"
                    etiqueta="Valor fiscal de referencia, si lo conoces"
                    valor={preferencias.valorReferenciaFiscal ?? ZERO}
                    onChange={(valorReferenciaFiscal) =>
                      actualizarPreferencias({ valorReferenciaFiscal })
                    }
                    ayuda="Si supera el precio de compra, puede aumentar el ITP. Puedes dejarlo en 0 si todavía no lo conoces."
                  />
                </div>
              )}

              {preferencias.estadoVivienda === 'nueva' && (
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={preferencias.esVpoEspecial}
                    onChange={(e) => actualizarPreferencias({ esVpoEspecial: e.target.checked })}
                    className="h-4 w-4 rounded-chico border border-linea accent-acento"
                  />
                  <span className="text-sm text-tinta">VPO de régimen especial (IVA 4 %)</span>
                  <InfoTooltip texto={AYUDAS.esVpoEspecial} />
                </label>
              )}
            </div>
          )}

          {/* ── TAB: Titulares ─────────────────────────────────────── */}
          {tabActiva === 'titulares' && (
            <div className="flex flex-col gap-5">
              <TitularForm titular={titularUno} indice={0} onChange={(t) => handleTitular(0, t)} />

              {mostrarSegundo && titularDos !== undefined && (
                <TitularForm
                  titular={titularDos}
                  indice={1}
                  onChange={(t) => handleTitular(1, t)}
                />
              )}

              <button
                type="button"
                onClick={toggleSegundoTitular}
                className="self-start rounded-medio border border-linea bg-superficie px-4 py-2 text-sm text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
              >
                {mostrarSegundo ? '− Eliminar segundo titular' : '+ Añadir segundo titular'}
              </button>

              <div className="filete pt-5">
                <p className="rotulo mb-3">Ahorro disponible</p>
                <div className="max-w-xs">
                  <InputMoneda
                    id="ahorros-actuales"
                    etiqueta="Ahorros actuales"
                    valor={perfil.ahorrosActuales}
                    onChange={(v) => actualizarPerfil({ ahorrosActuales: v })}
                    ayuda={AYUDAS.ahorrosActuales}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: Otros ingresos ────────────────────────────────── */}
          {tabActiva === 'otros-ingresos' && (
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
                <p className="text-sm text-tinta-suave">Sin ingresos adicionales registrados.</p>
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
          )}

          {/* ── TAB: Deudas y gastos ───────────────────────────────── */}
          {tabActiva === 'deudas-gastos' && (
            <div className="flex flex-col gap-8">
              {/* Deudas mensuales */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => abrirNuevo('deuda')}
                    className="flex items-center gap-2 rounded-medio border border-acento px-4 py-2 text-sm text-acento transition-colors hover:bg-acento-tenue"
                  >
                    <span aria-hidden="true">+</span>
                    Añadir deuda
                  </button>
                  {totalDeudas > 0 && (
                    <span className="font-cifra tabular-nums text-sm text-tinta-media">
                      Total{' '}
                      <span className="font-semibold text-tinta">
                        {formatEuros(totalDeudas)}/mes
                      </span>
                    </span>
                  )}
                </div>

                <p className="rotulo">Deudas mensuales</p>

                {perfil.deudas.length === 0 ? (
                  <p className="text-sm text-tinta-suave">Sin deudas registradas.</p>
                ) : (
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
                )}
              </div>

              {/* Gastos fijos */}
              <div className="filete flex flex-col gap-4 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => abrirNuevo('gasto')}
                    className="flex items-center gap-2 rounded-medio border border-acento px-4 py-2 text-sm text-acento transition-colors hover:bg-acento-tenue"
                  >
                    <span aria-hidden="true">+</span>
                    Añadir gasto
                  </button>
                  {totalGastosFijos > 0 && (
                    <span className="font-cifra tabular-nums text-sm text-tinta-media">
                      Total{' '}
                      <span className="font-semibold text-tinta">
                        {formatEuros(totalGastosFijos)}/mes
                      </span>
                    </span>
                  )}
                </div>

                <p className="rotulo">Gastos fijos del hogar</p>

                {perfil.gastosFijos.length === 0 ? (
                  <p className="text-sm text-tinta-suave">Sin gastos registrados.</p>
                ) : (
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
                )}
              </div>
            </div>
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

              {modalAbierto.tipo === 'gasto' && (
                <label className="flex cursor-pointer items-start gap-3 rounded-medio border border-linea bg-superficie-2/40 p-3 text-sm text-tinta">
                  <input
                    type="checkbox"
                    checked={modalAbierto.esAlquilerActual}
                    onChange={(e) =>
                      setModalAbierto({ ...modalAbierto, esAlquilerActual: e.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 accent-acento"
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
