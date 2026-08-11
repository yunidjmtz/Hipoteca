import { useEffect, useState } from 'react';
import type { Cents } from '@/core/money';
import { formatEuros } from '@/core/format';
import { Panel } from '@/components/Panel';
import {
  actualizarViviendaAgenteApi,
  apiHipotecasConfigurada,
  cerrarSesionApi,
  codigosInvitacionAgenteApi,
  crearViviendaAgenteApi,
  generarCodigoInvitacionAgenteApi,
  iniciarSesionApi,
  panelAgenteApi,
  revocarCodigoInvitacionAgenteApi,
  tokenSesionApi,
  viviendasAgenteApi,
  type BorradorViviendaAgenciaApi,
  type CodigoInvitacionApi,
  type EstadoViviendaAgenciaApi,
  type InmobiliariaApi,
  type ViviendaAgenciaApi,
} from '@/services/hipotecasApi';

const CAMPOS =
  'rounded-chico border border-linea bg-superficie-2 px-3 py-2 text-sm text-tinta transition-colors focus:border-acento focus:bg-superficie focus:outline-none focus:ring-2 focus:ring-acento/20';

const ETIQUETAS_ESTADO: Record<EstadoViviendaAgenciaApi, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  withdrawn: 'Retirada',
};

function fecha(iso: string | null): string {
  if (iso === null) return 'Sin caducidad';
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(iso));
}

function copiaDe(vivienda?: ViviendaAgenciaApi): BorradorViviendaAgenciaApi {
  return {
    title: vivienda?.title ?? '',
    priceCents: vivienda?.price_cents ?? 0,
    zone: vivienda?.zone ?? '',
    address: vivienda?.address ?? null,
    latitude: vivienda?.latitude ?? null,
    longitude: vivienda?.longitude ?? null,
    areaM2: vivienda?.area_m2 ?? 0,
    bedrooms: vivienda?.bedrooms ?? 0,
    bathrooms: vivienda?.bathrooms ?? 0,
    description: vivienda?.description ?? '',
    mainImageUrl: vivienda?.main_image_url ?? '',
    galleryUrls: vivienda?.gallery_urls ?? [],
    listingUrl: vivienda?.listing_url ?? '',
    status: vivienda?.status ?? 'draft',
  };
}

function Estado({ estado }: { readonly estado: EstadoViviendaAgenciaApi }) {
  const clase =
    estado === 'published'
      ? 'border-comodo/35 bg-comodo-tenue text-comodo'
      : estado === 'withdrawn'
        ? 'border-no-viable/35 bg-no-viable-tenue text-no-viable'
        : 'border-linea bg-superficie-2 text-tinta-media';
  return (
    <span className={`rounded-chico border px-2 py-0.5 text-xs font-medium ${clase}`}>
      {ETIQUETAS_ESTADO[estado]}
    </span>
  );
}

function FormularioVivienda({
  vivienda,
  onGuardar,
  onCancelar,
}: {
  readonly vivienda: ViviendaAgenciaApi | null;
  readonly onGuardar: (borrador: BorradorViviendaAgenciaApi) => Promise<void>;
  readonly onCancelar: () => void;
}) {
  const [borrador, setBorrador] = useState(() => copiaDe(vivienda ?? undefined));
  const [precio, setPrecio] = useState(() =>
    vivienda === null ? '' : String((vivienda.price_cents / 100).toFixed(2)),
  );
  const [galeria, setGaleria] = useState(() => vivienda?.gallery_urls.join('\n') ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function campo<K extends keyof BorradorViviendaAgenciaApi>(
    nombre: K,
    valor: BorradorViviendaAgenciaApi[K],
  ) {
    setBorrador((actual) => ({ ...actual, [nombre]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const precioCents = Math.round(Number(precio.replace(',', '.')) * 100);
    if (!Number.isInteger(precioCents) || precioCents <= 0) {
      setError('Indica un precio de venta válido.');
      return;
    }
    const galleryUrls = galeria
      .split('\n')
      .map((url) => url.trim())
      .filter(Boolean);
    setGuardando(true);
    setError('');
    try {
      await onGuardar({ ...borrador, priceCents: precioCents, galleryUrls });
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo guardar la vivienda.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      onSubmit={(evento) => void enviar(evento)}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta sm:col-span-2">
          Título
          <input
            required
            value={borrador.title}
            onChange={(e) => campo('title', e.target.value)}
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Precio de venta (€)
          <input
            required
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Estado
          <select
            value={borrador.status}
            onChange={(e) => campo('status', e.target.value as EstadoViviendaAgenciaApi)}
            className={CAMPOS}
          >
            {Object.entries(ETIQUETAS_ESTADO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Zona
          <input
            required
            value={borrador.zone}
            onChange={(e) => campo('zone', e.target.value)}
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Dirección <span className="font-normal text-tinta-suave">(opcional)</span>
          <input
            value={borrador.address ?? ''}
            onChange={(e) => campo('address', e.target.value || null)}
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Metros cuadrados
          <input
            required
            min="1"
            type="number"
            value={borrador.areaM2 || ''}
            onChange={(e) => campo('areaM2', Number(e.target.value))}
            className={CAMPOS}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Habitaciones
            <input
              min="0"
              type="number"
              value={borrador.bedrooms}
              onChange={(e) => campo('bedrooms', Number(e.target.value))}
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Baños
            <input
              min="0"
              type="number"
              value={borrador.bathrooms}
              onChange={(e) => campo('bathrooms', Number(e.target.value))}
              className={CAMPOS}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta sm:col-span-2">
          Descripción
          <textarea
            required
            rows={4}
            value={borrador.description}
            onChange={(e) => campo('description', e.target.value)}
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta sm:col-span-2">
          URL de imagen principal
          <input
            required
            type="url"
            value={borrador.mainImageUrl}
            onChange={(e) => campo('mainImageUrl', e.target.value)}
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta sm:col-span-2">
          URLs de galería{' '}
          <span className="font-normal text-tinta-suave">(una por línea, máximo 12)</span>
          <textarea
            rows={3}
            value={galeria}
            onChange={(e) => setGaleria(e.target.value)}
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta sm:col-span-2">
          URL de la ficha completa
          <input
            required
            type="url"
            value={borrador.listingUrl}
            onChange={(e) => campo('listingUrl', e.target.value)}
            className={CAMPOS}
          />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Latitud{' '}
            <input
              inputMode="decimal"
              value={borrador.latitude ?? ''}
              onChange={(e) =>
                campo('latitude', e.target.value === '' ? null : Number(e.target.value))
              }
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Longitud{' '}
            <input
              inputMode="decimal"
              value={borrador.longitude ?? ''}
              onChange={(e) =>
                campo('longitude', e.target.value === '' ? null : Number(e.target.value))
              }
              className={CAMPOS}
            />
          </label>
        </div>
      </div>
      <aside className="rounded-grande border border-linea bg-superficie-2 p-4">
        <p className="rotulo">Vista previa</p>
        {borrador.mainImageUrl !== '' && (
          <img
            src={borrador.mainImageUrl}
            alt="Vista previa"
            className="mt-3 h-32 w-full rounded-medio object-cover"
          />
        )}
        <h3 className="mt-3 font-display text-lg text-tinta">
          {borrador.title || 'Título de la vivienda'}
        </h3>
        <p className="mt-1 font-cifra text-xl font-bold text-acento">
          {precio === '' ? '—' : `${precio} €`}
        </p>
        <p className="mt-2 text-xs text-tinta-media">
          {borrador.zone || 'Zona'} · {borrador.areaM2 || '—'} m² · {borrador.bedrooms} hab.
        </p>
        <p className="mt-3 line-clamp-4 text-sm text-tinta-media">
          {borrador.description || 'La descripción aparecerá aquí.'}
        </p>
      </aside>
      {error !== '' && (
        <p role="alert" className="text-sm text-no-viable lg:col-span-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
        >
          Cancelar
        </button>
        <button
          disabled={guardando}
          className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90 disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : vivienda === null ? 'Crear vivienda' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}

function AccesoAgente({ onAcceso }: { readonly onAcceso: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await iniciarSesionApi(email, password);
      onAcceso();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  }
  return (
    <section className="mx-auto max-w-md overflow-hidden rounded-medio border border-linea bg-superficie shadow-papel">
      <div className="border-b border-acento/15 bg-acento-tenue px-6 py-5">
      <p className="rotulo">Panel de inmobiliaria</p>
      <h1 className="mt-1 font-display text-2xl text-tinta">Acceso para agentes</h1>
      <p className="mt-2 text-sm text-tinta-media">
        Usa la cuenta que tu inmobiliaria ha registrado como agente.
      </p>
      </div>
      <form onSubmit={(e) => void entrar(e)} className="flex flex-col gap-3 p-6">
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Correo
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Contraseña
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={CAMPOS}
          />
        </label>
        {error !== '' && (
          <p role="alert" className="text-sm text-no-viable">
            {error}
          </p>
        )}
        <button
          disabled={enviando}
          className="mt-2 rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento disabled:opacity-60"
        >
          {enviando ? 'Accediendo…' : 'Entrar'}
        </button>
      </form>
    </section>
  );
}

export function PanelInmobiliaria() {
  const [sesion, setSesion] = useState(() => tokenSesionApi() !== null);
  const [agencia, setAgencia] = useState<InmobiliariaApi | null>(null);
  const [viviendas, setViviendas] = useState<readonly ViviendaAgenciaApi[]>([]);
  const [codigos, setCodigos] = useState<readonly CodigoInvitacionApi[]>([]);
  const [editando, setEditando] = useState<ViviendaAgenciaApi | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [caducidad, setCaducidad] = useState('');
  const [usos, setUsos] = useState(1);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const [perfil, propiedades, invitaciones] = await Promise.all([
        panelAgenteApi(),
        viviendasAgenteApi(),
        codigosInvitacionAgenteApi(),
      ]);
      setAgencia(perfil.agency);
      setViviendas(propiedades.properties);
      setCodigos(invitaciones.codes);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo cargar el panel.');
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    if (!sesion || !apiHipotecasConfigurada()) return;
    const temporizador = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(temporizador);
  }, [sesion]);
  async function guardar(borrador: BorradorViviendaAgenciaApi) {
    const respuesta =
      editando === null
        ? await crearViviendaAgenteApi(borrador)
        : await actualizarViviendaAgenteApi(editando!.id, borrador);
    setViviendas((actual) =>
      editando === null
        ? [respuesta.property, ...actual]
        : actual.map((v) => (v.id === respuesta.property.id ? respuesta.property : v)),
    );
    setEditando(undefined);
  }
  async function generarCodigo() {
    try {
      const { code } = await generarCodigoInvitacionAgenteApi({
        expiresAt: caducidad === '' ? null : caducidad,
        maxUses: usos,
      });
      setCodigos((actual) => [code, ...actual]);
      setCaducidad('');
      setUsos(1);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo generar el código.');
    }
  }
  async function revocar(id: string) {
    try {
      const { code } = await revocarCodigoInvitacionAgenteApi(id);
      setCodigos((actual) =>
        actual.map((actualCode) => (actualCode.id === id ? code : actualCode)),
      );
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo revocar el código.');
    }
  }
  if (!apiHipotecasConfigurada())
    return (
      <Panel titulo="Panel de inmobiliaria">
        <p className="text-sm text-tinta-media">
          El panel necesita la configuración de la API de Hipotecas para poder conectarse de forma
          segura.
        </p>
      </Panel>
    );
  if (!sesion) return <AccesoAgente onAcceso={() => setSesion(true)} />;
  if (editando !== undefined)
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="rotulo">{agencia?.brand ?? 'Panel de inmobiliaria'}</p>
            <h1 className="font-display text-2xl text-tinta">
              {editando === null ? 'Nueva vivienda' : 'Editar vivienda'}
            </h1>
          </div>
          <button
            onClick={() => setEditando(undefined)}
            className="rounded-medio border border-linea px-3 py-2 text-sm text-tinta"
          >
            ← Volver
          </button>
        </div>
        <Panel>
          <FormularioVivienda
            vivienda={editando}
            onGuardar={guardar}
            onCancelar={() => setEditando(undefined)}
          />
        </Panel>
      </div>
    );

  const viviendasPublicadas = viviendas.filter((vivienda) => vivienda.status === 'published').length;
  const codigosActivos = codigos.filter((codigo) => codigo.status === 'active').length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linea pb-5 xl:col-span-2">
        <div>
          <p className="rotulo">Operaciones</p>
          <h1 className="mt-1 font-display text-3xl text-tinta">{agencia?.name ?? 'Cargando…'}</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Catálogo publicado, propiedades pendientes y códigos de acceso para clientes.
          </p>
        </div>
        <button
          onClick={() => {
            cerrarSesionApi();
            setSesion(false);
            setAgencia(null);
          }}
          className="rounded-chico border border-linea bg-superficie px-3 py-2 text-sm font-medium text-tinta transition-colors hover:bg-superficie-2"
        >
          Cerrar sesión
        </button>
      </header>
      {error !== '' && (
        <p
          role="alert"
          className="rounded-chico border border-no-viable/20 bg-no-viable-tenue p-3 text-sm text-no-viable xl:col-span-2"
        >
          {error}
        </p>
      )}
      <section className="grid grid-cols-3 gap-px overflow-hidden rounded-medio border border-linea bg-linea xl:col-span-2">
        <div className="bg-superficie px-4 py-3.5 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-tinta-suave">Viviendas</p>
          <p className="mt-1 font-cifra text-2xl font-bold text-tinta">{viviendas.length}</p>
        </div>
        <div className="bg-superficie px-4 py-3.5 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-tinta-suave">Publicadas</p>
          <p className="mt-1 font-cifra text-2xl font-bold text-comodo">{viviendasPublicadas}</p>
        </div>
        <div className="bg-superficie px-4 py-3.5 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-tinta-suave">Códigos activos</p>
          <p className="mt-1 font-cifra text-2xl font-bold text-acento">{codigosActivos}</p>
        </div>
      </section>
      <Panel
        titulo="Catálogo de viviendas"
        rotulo="Inventario"
        className="order-2 rounded-medio shadow-none xl:order-1"
        contenidoClassName="p-2 sm:p-3"
        accionEncabezado={
          <button
            onClick={() => setEditando(null)}
            className="rounded-chico bg-acento px-3 py-2 text-sm font-semibold text-sobre-acento shadow-papel transition-colors hover:bg-acento/90"
          >
            + Nueva vivienda
          </button>
        }
      >
        <div className="divide-y divide-linea">
          {viviendas.map((vivienda) => (
            <article
              key={vivienda.id}
              className="grid items-center gap-3 rounded-chico p-3 transition-colors hover:bg-superficie-2 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]"
            >
              <img
                src={vivienda.main_image_url}
                alt=""
                className="h-16 w-full rounded-chico object-cover sm:w-[5.5rem]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-display text-base text-tinta">{vivienda.title}</h2>
                  <Estado estado={vivienda.status} />
                </div>
                <p className="mt-1 text-sm text-tinta-media">
                  {vivienda.zone} · {vivienda.area_m2} m² ·{' '}
                  {formatEuros(vivienda.price_cents as Cents)}
                </p>
              </div>
              <button
                onClick={() => setEditando(vivienda)}
                className="justify-self-start rounded-chico border border-linea bg-superficie px-3 py-1.5 text-sm font-semibold text-acento transition-colors hover:bg-acento-tenue sm:justify-self-end"
              >
                Editar
              </button>
            </article>
          ))}
          {!cargando && viviendas.length === 0 && (
            <p className="m-3 rounded-chico border border-dashed border-linea p-7 text-center text-sm text-tinta-media">
              Todavía no has añadido viviendas al catálogo.
            </p>
          )}
        </div>
      </Panel>
      <Panel
        titulo="Códigos de acceso"
        rotulo="Clientes"
        className="order-1 rounded-medio shadow-none xl:order-2 xl:sticky xl:top-6"
        contenidoClassName="p-4"
      >
        <div className="grid gap-3 border-b border-linea pb-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Caducidad <span className="font-normal text-tinta-suave">(opcional)</span>
            <input
              type="date"
              value={caducidad}
              onChange={(e) => setCaducidad(e.target.value)}
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Límite de usos
            <input
              min="1"
              max="10000"
              type="number"
              value={usos}
              onChange={(e) => setUsos(Math.max(1, Number(e.target.value)))}
              className={CAMPOS}
            />
          </label>
          <button
            onClick={() => void generarCodigo()}
            className="w-full rounded-chico bg-acento px-4 py-2.5 text-sm font-semibold text-sobre-acento shadow-papel transition-colors hover:bg-acento/90"
          >
            Generar código
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {codigos.map((codigo) => (
            <div
              key={codigo.id}
              className="rounded-chico border border-linea bg-superficie-2 p-3"
            >
              <div>
                <p className="font-cifra font-bold tracking-wider text-tinta">{codigo.code}</p>
                <p className="mt-1 text-xs text-tinta-media">
                  {codigo.uses_count}/{codigo.max_uses} usos · {fecha(codigo.expires_at)} ·{' '}
                  {codigo.status}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void navigator.clipboard?.writeText(codigo.code)}
                  className="rounded-medio border border-linea px-3 py-2 text-xs font-semibold text-acento"
                >
                  Copiar
                </button>
                {codigo.status === 'active' && codigo.uses_count === 0 && (
                  <button
                    onClick={() => void revocar(codigo.id)}
                    className="rounded-medio border border-no-viable/35 px-3 py-2 text-xs font-semibold text-no-viable"
                  >
                    Revocar
                  </button>
                )}
              </div>
            </div>
          ))}
          {!cargando && codigos.length === 0 && (
            <p className="text-sm text-tinta-media">
              Genera el primer código para compartir el catálogo con un cliente.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
