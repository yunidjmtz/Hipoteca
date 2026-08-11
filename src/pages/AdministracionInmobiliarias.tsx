import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import {
  actualizarInmobiliariaAdministracionApi,
  actualizarRolEmpleadoInmobiliariaApi,
  apiHipotecasConfigurada,
  cerrarSesionApi,
  crearEmpleadoInmobiliariaAdministracionApi,
  crearInmobiliariaAdministracionApi,
  eliminarInmobiliariaAdministracionApi,
  empleadosInmobiliariaAdministracionApi,
  inmobiliariasAdministracionApi,
  iniciarSesionApi,
  retirarEmpleadoInmobiliariaApi,
  superadminApi,
  tokenSesionApi,
  type EmpleadoInmobiliariaApi,
  type InmobiliariaAdministracionApi,
} from '@/services/hipotecasApi';

const CAMPOS =
  'rounded-chico border border-linea bg-superficie-2 px-3 py-2 text-sm text-tinta transition-colors focus:border-acento focus:bg-superficie focus:outline-none focus:ring-2 focus:ring-acento/20';

function AccesoSuperadmin({ onAcceso }: { readonly onAcceso: () => void }) {
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
      <p className="rotulo">Administración interna</p>
      <h1 className="mt-1 font-display text-2xl text-tinta">Acceso de superadmin</h1>
      <p className="mt-2 text-sm text-tinta-media">
        Este espacio está reservado al administrador global de las inmobiliarias.
      </p>
      </div>
      <form onSubmit={(e) => void entrar(e)} className="flex flex-col gap-3 p-6">
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Correo
          <input
            required
            type="email"
            autoComplete="email"
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
            autoComplete="current-password"
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

function RecortadorLogo({
  value,
  onChange,
}: {
  readonly value: string | null;
  readonly onChange: (logo: string | null) => void;
}) {
  const [origen, setOrigen] = useState<string | null>(value);
  const [zoom, setZoom] = useState(1);
  const [posicionX, setPosicionX] = useState(50);
  const [posicionY, setPosicionY] = useState(50);
  const [error, setError] = useState('');

  function seleccionarArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (archivo === undefined) return;
    if (!archivo.type.startsWith('image/')) {
      setError('Selecciona una imagen válida.');
      return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      setError('La imagen no puede superar 5 MB.');
      return;
    }
    setError('');
    setZoom(1);
    setPosicionX(50);
    setPosicionY(50);
    const lector = new FileReader();
    lector.onload = () => {
      if (typeof lector.result === 'string') setOrigen(lector.result);
      else setError('No se pudo leer la imagen.');
    };
    lector.onerror = () => setError('No se pudo leer la imagen.');
    lector.readAsDataURL(archivo);
  }

  async function aplicarRecorte() {
    if (origen === null) return;
    setError('');
    const imagen = new Image();
    imagen.src = origen;
    try {
      await new Promise<void>((resolver, rechazar) => {
        imagen.onload = () => resolver();
        imagen.onerror = () => rechazar(new Error('No se pudo cargar la imagen.'));
      });
      const lado = Math.min(imagen.naturalWidth, imagen.naturalHeight) / zoom;
      const origenX = (imagen.naturalWidth - lado) * (posicionX / 100);
      const origenY = (imagen.naturalHeight - lado) * (posicionY / 100);
      const lienzo = document.createElement('canvas');
      lienzo.width = 512;
      lienzo.height = 512;
      const contexto = lienzo.getContext('2d');
      if (contexto === null) throw new Error('No se pudo preparar el recorte.');
      contexto.drawImage(imagen, origenX, origenY, lado, lado, 0, 0, 512, 512);
      const logo = lienzo.toDataURL('image/webp', 0.86);
      setOrigen(logo);
      onChange(logo);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo recortar la imagen.');
    }
  }

  return (
    <div className="rounded-chico border border-linea bg-superficie-2 p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-tinta">Foto o logo</p>
          <p className="text-xs text-tinta-media">Se guardará cuadrado y optimizado en WebP.</p>
        </div>
        {value !== null && (
          <button
            type="button"
            onClick={() => {
              setOrigen(null);
              onChange(null);
            }}
            className="text-xs font-semibold text-no-viable"
          >
            Quitar foto
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <div className="relative aspect-square overflow-hidden rounded-chico bg-linea">
          {origen === null ? (
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-tinta-suave">
              Sin foto
            </span>
          ) : (
            <img
              src={origen}
              alt="Vista previa del logo"
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${posicionX}% ${posicionY}%`,
                transform: `scale(${zoom})`,
              }}
            />
          )}
        </div>
        <div className="grid content-start gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Seleccionar imagen
            <input
              type="file"
              accept="image/*"
              onChange={seleccionarArchivo}
              className="block w-full text-xs text-tinta-media file:mr-3 file:rounded-chico file:border-0 file:bg-acento-tenue file:px-3 file:py-2 file:text-xs file:font-semibold file:text-acento hover:file:bg-acento/15"
            />
          </label>
          {origen !== null && (
            <>
              <label className="flex flex-col gap-1 text-xs font-semibold text-tinta-media">
                Zoom
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(evento) => setZoom(Number(evento.target.value))}
                  className="accent-acento"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-semibold text-tinta-media">
                  Horizontal
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={posicionX}
                    onChange={(evento) => setPosicionX(Number(evento.target.value))}
                    className="accent-acento"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-tinta-media">
                  Vertical
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={posicionY}
                    onChange={(evento) => setPosicionY(Number(evento.target.value))}
                    className="accent-acento"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void aplicarRecorte()}
                className="justify-self-start rounded-chico border border-linea bg-superficie px-3 py-2 text-sm font-semibold text-acento transition-colors hover:bg-acento-tenue"
              >
                Aplicar recorte
              </button>
            </>
          )}
          {error !== '' && <p role="alert" className="text-xs text-no-viable">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function GestionInmobiliaria({
  inmobiliaria,
  onActualizada,
  onEliminada,
}: {
  readonly inmobiliaria: InmobiliariaAdministracionApi;
  readonly onActualizada: (inmobiliaria: InmobiliariaAdministracionApi) => void;
  readonly onEliminada: () => void;
}) {
  const [nombre, setNombre] = useState(inmobiliaria.name);
  const [marca, setMarca] = useState(inmobiliaria.brand);
  const [sitioWeb, setSitioWeb] = useState(inmobiliaria.website ?? '');
  const [direccion, setDireccion] = useState(inmobiliaria.address ?? '');
  const [telefono, setTelefono] = useState(inmobiliaria.phone ?? '');
  const [correoContacto, setCorreoContacto] = useState(inmobiliaria.contact_email ?? '');
  const [logo, setLogo] = useState<string | null>(inmobiliaria.logo_url);
  const [activa, setActiva] = useState(inmobiliaria.active);
  const [empleados, setEmpleados] = useState<readonly EmpleadoInmobiliariaApi[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<'agent' | 'admin'>('agent');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [confirmarEliminacion, setConfirmarEliminacion] = useState(false);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      void (async () => {
        setCargando(true);
        try {
          const { employees } = await empleadosInmobiliariaAdministracionApi(inmobiliaria.id);
          setEmpleados(employees);
        } catch (causa) {
          setError(causa instanceof Error ? causa.message : 'No se pudieron cargar los empleados.');
        } finally {
          setCargando(false);
        }
      })();
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, [inmobiliaria.id]);

  async function guardarInmobiliaria(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const { agency } = await actualizarInmobiliariaAdministracionApi(inmobiliaria.id, {
        name: nombre,
        brand: marca,
        website: sitioWeb || null,
        address: direccion || null,
        phone: telefono || null,
        contact_email: correoContacto || null,
        logo_url: logo,
        active: activa,
      });
      onActualizada(agency);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo actualizar la inmobiliaria.');
    } finally {
      setGuardando(false);
    }
  }

  async function anadirEmpleado(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const { employee } = await crearEmpleadoInmobiliariaAdministracionApi(inmobiliaria.id, {
        email,
        password,
        role: rol,
      });
      setEmpleados((actual) => [...actual, employee]);
      setEmail('');
      setPassword('');
      setRol('agent');
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo crear el empleado.');
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarRol(empleado: EmpleadoInmobiliariaApi, siguienteRol: 'agent' | 'admin') {
    setError('');
    try {
      await actualizarRolEmpleadoInmobiliariaApi(inmobiliaria.id, empleado.user_id, siguienteRol);
      setEmpleados((actual) =>
        actual.map((actualEmpleado) =>
          actualEmpleado.user_id === empleado.user_id
            ? { ...actualEmpleado, role: siguienteRol }
            : actualEmpleado,
        ),
      );
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo cambiar el rol.');
    }
  }

  async function retirarEmpleado(empleado: EmpleadoInmobiliariaApi) {
    setError('');
    try {
      await retirarEmpleadoInmobiliariaApi(inmobiliaria.id, empleado.user_id);
      setEmpleados((actual) =>
        actual.filter((actualEmpleado) => actualEmpleado.user_id !== empleado.user_id),
      );
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo retirar el acceso.');
    }
  }

  async function eliminarInmobiliaria() {
    setGuardando(true);
    setError('');
    try {
      await eliminarInmobiliariaAdministracionApi(inmobiliaria.id);
      onEliminada();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo eliminar la inmobiliaria.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Panel
      titulo={`Gestionar ${inmobiliaria.name}`}
      rotulo="Configuración y accesos"
      className="rounded-medio shadow-none"
    >
      {error !== '' && (
        <p
          role="alert"
          className="mb-4 rounded-medio bg-no-viable-tenue p-3 text-sm text-no-viable"
        >
          {error}
        </p>
      )}
      <form onSubmit={(e) => void guardarInmobiliaria(e)} className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Nombre
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Marca
          <input
            required
            maxLength={5}
            value={marca}
            onChange={(e) => setMarca(e.target.value.toUpperCase())}
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Sitio web
          <input
            type="url"
            value={sitioWeb}
            onChange={(e) => setSitioWeb(e.target.value)}
            placeholder="https://inmobiliaria.es"
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta sm:col-span-2">
          Dirección
          <input
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder="Calle y localidad"
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Teléfono
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="600 000 000"
            className={CAMPOS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta sm:col-span-2">
          Correo de contacto
          <input
            type="email"
            value={correoContacto}
            onChange={(e) => setCorreoContacto(e.target.value)}
            placeholder="contacto@inmobiliaria.es"
            className={CAMPOS}
          />
        </label>
        <label className="flex items-end gap-2 text-sm font-medium text-tinta">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
            className="mb-2"
          />
          Inmobiliaria activa
        </label>
        <div className="sm:col-span-3">
          <RecortadorLogo value={logo} onChange={setLogo} />
        </div>
        <div className="flex justify-end sm:col-span-3">
          <button
            disabled={guardando}
            className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-acento hover:bg-acento-tenue disabled:opacity-60"
          >
            Guardar cambios
          </button>
        </div>
      </form>

      <div className="mt-6 border-t border-linea pt-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="rotulo">Empleados</p>
            <h3 className="font-display text-xl text-tinta">Accesos al panel</h3>
          </div>
          <span className="text-sm text-tinta-media">{empleados.length} con acceso</span>
        </div>
        <form onSubmit={(e) => void anadirEmpleado(e)} className="mt-4 grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta sm:col-span-2">
            Correo del empleado
            <input
              required
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Contraseña inicial
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Rol
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value as 'agent' | 'admin')}
              className={CAMPOS}
            >
              <option value="agent">Agente</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <div className="flex justify-end sm:col-span-4">
            <button
              disabled={guardando}
              className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento disabled:opacity-60"
            >
              Añadir empleado
            </button>
          </div>
        </form>
        <div className="mt-4 grid gap-2">
          {empleados.map((empleado) => (
            <article
              key={empleado.user_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-medio border border-linea p-3"
            >
              <p className="text-sm font-medium text-tinta">{empleado.email}</p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={empleado.role}
                  onChange={(e) => void cambiarRol(empleado, e.target.value as 'agent' | 'admin')}
                  className={`${CAMPOS} py-1.5`}
                >
                  <option value="agent">Agente</option>
                  <option value="admin">Administrador</option>
                </select>
                <button
                  type="button"
                  onClick={() => void retirarEmpleado(empleado)}
                  className="rounded-medio border border-no-viable/35 px-3 py-1.5 text-xs font-semibold text-no-viable"
                >
                  Retirar acceso
                </button>
              </div>
            </article>
          ))}
          {!cargando && empleados.length === 0 && (
            <p className="text-sm text-tinta-media">
              Esta inmobiliaria todavía no tiene empleados con acceso.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-no-viable/25 pt-5">
        <p className="rotulo text-no-viable">Zona de peligro</p>
        {confirmarEliminacion ? (
          <div className="mt-2 rounded-medio bg-no-viable-tenue p-3">
            <p className="text-sm text-tinta">
              Se desvincularán los clientes y se eliminarán el catálogo, los códigos y los accesos
              de esta inmobiliaria. Las cuentas de los empleados no se borran.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={guardando}
                onClick={() => void eliminarInmobiliaria()}
                className="rounded-medio bg-no-viable px-3 py-2 text-sm font-medium text-sobre-acento disabled:opacity-60"
              >
                Sí, eliminar inmobiliaria
              </button>
              <button
                type="button"
                onClick={() => setConfirmarEliminacion(false)}
                className="rounded-medio border border-linea px-3 py-2 text-sm font-medium text-tinta"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmarEliminacion(true)}
            className="mt-2 rounded-medio border border-no-viable/35 px-3 py-2 text-sm font-medium text-no-viable"
          >
            Eliminar inmobiliaria
          </button>
        )}
      </div>
    </Panel>
  );
}

export function AdministracionInmobiliarias() {
  const [sesion, setSesion] = useState(() => tokenSesionApi() !== null);
  const [emailSuperadmin, setEmailSuperadmin] = useState<string | null>(null);
  const [inmobiliarias, setInmobiliarias] = useState<readonly InmobiliariaAdministracionApi[]>([]);
  const [inmobiliariaSeleccionada, setInmobiliariaSeleccionada] =
    useState<InmobiliariaAdministracionApi | null>(null);
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [sitioWeb, setSitioWeb] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correoContacto, setCorreoContacto] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [altaAbierta, setAltaAbierta] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const [perfil, lista] = await Promise.all([
        superadminApi(),
        inmobiliariasAdministracionApi(),
      ]);
      setEmailSuperadmin(perfil.email);
      setInmobiliarias(lista.agencies);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo cargar la administración.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (!sesion || !apiHipotecasConfigurada()) return;
    const temporizador = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(temporizador);
  }, [sesion]);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const { agency } = await crearInmobiliariaAdministracionApi({
        name: nombre,
        brand: marca,
        website: sitioWeb || null,
        address: direccion || null,
        phone: telefono || null,
        contactEmail: correoContacto || null,
        logoDataUrl: logo,
      });
      setInmobiliarias((actual) => [agency, ...actual]);
      setInmobiliariaSeleccionada(agency);
      setNombre('');
      setMarca('');
      setSitioWeb('');
      setDireccion('');
      setTelefono('');
      setCorreoContacto('');
      setLogo(null);
      setAltaAbierta(false);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo crear la inmobiliaria.');
    } finally {
      setGuardando(false);
    }
  }

  if (!apiHipotecasConfigurada()) {
    return (
      <Panel titulo="Administración de inmobiliarias">
        <p className="text-sm text-tinta-media">La API de Hipotecas debe estar configurada.</p>
      </Panel>
    );
  }
  if (!sesion) return <AccesoSuperadmin onAcceso={() => setSesion(true)} />;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linea pb-5">
        <div>
          <p className="rotulo">Centro de control</p>
          <h1 className="mt-1 font-display text-3xl text-tinta">Inmobiliarias</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Gestiona altas, accesos y estado operativo. Superadmin:{' '}
            {emailSuperadmin ?? 'Comprobando acceso…'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setError('');
              setAltaAbierta(true);
            }}
            className="rounded-chico bg-acento px-3 py-2 text-sm font-semibold text-sobre-acento shadow-papel transition-colors hover:bg-acento/90"
          >
            + Nueva inmobiliaria
          </button>
          <button
            onClick={() => {
              cerrarSesionApi();
              setSesion(false);
              setEmailSuperadmin(null);
            }}
            className="rounded-chico border border-linea bg-superficie px-3 py-2 text-sm font-medium text-tinta transition-colors hover:bg-superficie-2"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {error !== '' && (
        <p
          role="alert"
          className="rounded-chico border border-no-viable/20 bg-no-viable-tenue p-3 text-sm text-no-viable"
        >
          {error}
        </p>
      )}

      <section className="overflow-hidden rounded-medio border border-linea bg-superficie shadow-papel">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-4 py-4 sm:px-5">
          <div>
            <p className="rotulo">Directorio</p>
            <h2 className="mt-1 font-display text-xl text-tinta">Inmobiliarias registradas</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-acento-tenue px-2.5 py-1 text-xs font-semibold text-acento">
              {inmobiliarias.length} total
            </span>
            <span className="rounded-full bg-comodo-tenue px-2.5 py-1 text-xs font-semibold text-comodo">
              {inmobiliarias.filter((inmobiliaria) => inmobiliaria.active).length} activas
            </span>
          </div>
        </header>
        <div className="p-2 sm:p-3">
          <div className="hidden grid-cols-[auto_minmax(0,1fr)_5.5rem_7rem] gap-3 px-3 pb-2 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-tinta-suave sm:grid">
            <span aria-hidden="true" />
            <span>Inmobiliaria</span>
            <span>Estado</span>
            <span className="text-right">Acción</span>
          </div>
          <div className="divide-y divide-linea">
            {inmobiliarias.map((inmobiliaria) => (
              <article
                key={inmobiliaria.id}
                className="grid items-center gap-3 rounded-chico p-3 transition-colors hover:bg-superficie-2 sm:grid-cols-[auto_minmax(0,1fr)_5.5rem_7rem]"
              >
                {inmobiliaria.logo_url === null ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-chico bg-acento font-cifra text-xs font-bold text-sobre-acento">
                    {inmobiliaria.brand}
                  </span>
                ) : (
                  <img
                    src={inmobiliaria.logo_url}
                    alt=""
                    className="h-9 w-9 rounded-chico border border-linea bg-superficie object-cover"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base text-tinta">{inmobiliaria.name}</h3>
                  <p className="truncate text-xs text-tinta-media">
                    {inmobiliaria.contact_email ??
                      inmobiliaria.website ??
                      inmobiliaria.address ??
                      `Marca ${inmobiliaria.brand}`}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                    inmobiliaria.active
                      ? 'bg-comodo-tenue text-comodo'
                      : 'bg-superficie-2 text-tinta-media'
                  }`}
                >
                  {inmobiliaria.active ? 'Activa' : 'Inactiva'}
                </span>
                <button
                  type="button"
                  onClick={() => setInmobiliariaSeleccionada(inmobiliaria)}
                  className="justify-self-start rounded-chico border border-linea bg-superficie px-3 py-1.5 text-sm font-semibold text-acento transition-colors hover:bg-acento-tenue sm:justify-self-end"
                >
                  Gestionar
                </button>
              </article>
            ))}
            {!cargando && inmobiliarias.length === 0 && (
              <p className="m-3 rounded-chico border border-dashed border-linea p-7 text-center text-sm text-tinta-media">
                Aún no hay inmobiliarias registradas.
              </p>
            )}
          </div>
        </div>
      </section>

      {altaAbierta && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-end bg-tinta/30 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
          onMouseDown={() => setAltaAbierta(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-alta-inmobiliaria"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-medio border border-linea bg-superficie shadow-elevado"
            onMouseDown={(evento) => evento.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-acento/15 bg-acento-tenue px-4 py-4 sm:px-5">
              <div>
            <p className="rotulo text-acento">Alta inicial</p>
                <h2 id="titulo-alta-inmobiliaria" className="mt-1 font-display text-xl text-tinta">
                  Nueva inmobiliaria
                </h2>
            <p className="mt-1 text-xs text-tinta-media">Los usuarios se añaden después, desde Gestionar.</p>
              </div>
              <button
                type="button"
                onClick={() => setAltaAbierta(false)}
                aria-label="Cerrar formulario de nueva inmobiliaria"
                className="flex h-8 w-8 items-center justify-center rounded-chico border border-linea bg-superficie text-lg leading-none text-tinta-media transition-colors hover:bg-superficie-2"
              >
                ×
              </button>
            </header>
          <form onSubmit={(e) => void crear(e)} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Nombre comercial
            <input
              required
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Marca corta
            <input
              required
              maxLength={5}
              value={marca}
              onChange={(e) => setMarca(e.target.value.toUpperCase())}
              placeholder="SOL"
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta sm:col-span-2">
            Sitio web <span className="font-normal text-tinta-suave">(opcional)</span>
            <input
              type="url"
              value={sitioWeb}
              onChange={(e) => setSitioWeb(e.target.value)}
              placeholder="https://inmobiliaria.es"
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta sm:col-span-2">
            Dirección <span className="font-normal text-tinta-suave">(opcional)</span>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Calle, número y localidad"
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Teléfono <span className="font-normal text-tinta-suave">(opcional)</span>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="600 000 000"
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Correo de contacto <span className="font-normal text-tinta-suave">(opcional)</span>
            <input
              type="email"
              value={correoContacto}
              onChange={(e) => setCorreoContacto(e.target.value)}
              placeholder="contacto@inmobiliaria.es"
              className={CAMPOS}
            />
          </label>
          <RecortadorLogo value={logo} onChange={setLogo} />
          <p className="text-xs leading-relaxed text-tinta-suave sm:col-span-2">
            La inmobiliaria se crea sin usuarios. Después entra en Gestionar para dar de alta a sus
            empleados y definir sus permisos.
          </p>
          {error !== '' && (
            <p
              role="alert"
              className="rounded-chico bg-no-viable-tenue p-3 text-sm text-no-viable sm:col-span-2"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setAltaAbierta(false)}
              className="rounded-chico border border-linea px-4 py-2.5 text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2"
            >
              Cancelar
            </button>
            <button
              disabled={guardando}
              className="rounded-chico bg-acento px-4 py-2.5 text-sm font-semibold text-sobre-acento shadow-papel transition-colors hover:bg-acento/90 disabled:opacity-60"
            >
              {guardando ? 'Creando…' : 'Crear inmobiliaria'}
            </button>
          </div>
        </form>
          </section>
        </div>
      )}
      {inmobiliariaSeleccionada !== null && (
        <div>
          <GestionInmobiliaria
            key={inmobiliariaSeleccionada.id}
            inmobiliaria={inmobiliariaSeleccionada}
            onActualizada={(actualizada) => {
              setInmobiliarias((actual) =>
                actual.map((inmobiliaria) =>
                  inmobiliaria.id === actualizada.id ? actualizada : inmobiliaria,
                ),
              );
              setInmobiliariaSeleccionada(actualizada);
            }}
            onEliminada={() => {
              setInmobiliarias((actual) =>
                actual.filter((inmobiliaria) => inmobiliaria.id !== inmobiliariaSeleccionada.id),
              );
              setInmobiliariaSeleccionada(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
