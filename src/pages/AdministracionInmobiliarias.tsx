import { useEffect, useState } from 'react';
import { Link } from 'react-router';
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
  'rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50';

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
    <section className="mx-auto max-w-md rounded-grande border border-linea bg-superficie p-6 shadow-papel">
      <p className="rotulo">Administración interna</p>
      <h1 className="mt-1 font-display text-2xl text-tinta">Acceso de superadmin</h1>
      <p className="mt-2 text-sm text-tinta-media">
        Este espacio está reservado al administrador global de las inmobiliarias.
      </p>
      <form onSubmit={(e) => void entrar(e)} className="mt-5 flex flex-col gap-3">
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
    <Panel titulo={`Gestionar ${inmobiliaria.name}`} rotulo="Inmobiliaria y empleados">
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
        <label className="flex items-end gap-2 text-sm font-medium text-tinta">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
            className="mb-2"
          />
          Inmobiliaria activa
        </label>
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
  const [emailAgente, setEmailAgente] = useState('');
  const [passwordAgente, setPasswordAgente] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

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
        agentEmail: emailAgente,
        agentPassword: passwordAgente,
      });
      setInmobiliarias((actual) => [agency, ...actual]);
      setInmobiliariaSeleccionada(agency);
      setNombre('');
      setMarca('');
      setEmailAgente('');
      setPasswordAgente('');
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
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="rotulo">Administración interna</p>
          <h1 className="font-display text-2xl text-tinta">Inmobiliarias y agentes</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Superadmin: {emailSuperadmin ?? 'Comprobando acceso…'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/ofertas"
            className="rounded-medio border border-linea px-3 py-2 text-sm font-medium text-tinta"
          >
            Área cliente
          </Link>
          <button
            onClick={() => {
              cerrarSesionApi();
              setSesion(false);
              setEmailSuperadmin(null);
            }}
            className="rounded-medio border border-linea px-3 py-2 text-sm font-medium text-tinta"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {error !== '' && (
        <p role="alert" className="rounded-medio bg-no-viable-tenue p-3 text-sm text-no-viable">
          {error}
        </p>
      )}

      <Panel titulo="Crear inmobiliaria" rotulo="Alta inicial">
        <form onSubmit={(e) => void crear(e)} className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Nombre comercial
            <input
              required
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
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Correo del agente
            <input
              required
              type="email"
              autoComplete="off"
              value={emailAgente}
              onChange={(e) => setEmailAgente(e.target.value)}
              className={CAMPOS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Contraseña inicial del agente
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={passwordAgente}
              onChange={(e) => setPasswordAgente(e.target.value)}
              className={CAMPOS}
            />
          </label>
          <p className="text-xs leading-relaxed text-tinta-suave sm:col-span-2">
            Comparte estas credenciales con el agente por un canal seguro. La cuenta quedará ligada
            solo a esta inmobiliaria.
          </p>
          <div className="flex justify-end sm:col-span-2">
            <button
              disabled={guardando}
              className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento disabled:opacity-60"
            >
              {guardando ? 'Creando…' : 'Crear inmobiliaria y agente'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel titulo="Inmobiliarias creadas" rotulo={`${inmobiliarias.length} registradas`}>
        <div className="grid gap-3">
          {inmobiliarias.map((inmobiliaria) => (
            <article
              key={inmobiliaria.id}
              className="flex items-center gap-3 rounded-medio border border-linea p-3"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-chico bg-acento font-display text-xs font-bold text-sobre-acento">
                {inmobiliaria.brand}
              </span>
              <div>
                <h2 className="font-display text-lg text-tinta">{inmobiliaria.name}</h2>
                <p className="text-xs text-tinta-media">
                  {inmobiliaria.active ? 'Activa' : 'Inactiva'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInmobiliariaSeleccionada(inmobiliaria)}
                className="ml-auto rounded-medio border border-linea px-3 py-2 text-sm font-medium text-acento hover:bg-acento-tenue"
              >
                Gestionar
              </button>
            </article>
          ))}
          {!cargando && inmobiliarias.length === 0 && (
            <p className="rounded-medio border border-dashed border-linea p-5 text-center text-sm text-tinta-media">
              Aún no hay inmobiliarias registradas.
            </p>
          )}
        </div>
      </Panel>
      {inmobiliariaSeleccionada !== null && (
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
      )}
    </div>
  );
}
