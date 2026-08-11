import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Panel } from '@/components/Panel';
import {
  apiHipotecasConfigurada,
  cerrarSesionApi,
  crearInmobiliariaAdministracionApi,
  inmobiliariasAdministracionApi,
  iniciarSesionApi,
  superadminApi,
  tokenSesionApi,
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

export function AdministracionInmobiliarias() {
  const [sesion, setSesion] = useState(() => tokenSesionApi() !== null);
  const [emailSuperadmin, setEmailSuperadmin] = useState<string | null>(null);
  const [inmobiliarias, setInmobiliarias] = useState<readonly InmobiliariaAdministracionApi[]>([]);
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
            </article>
          ))}
          {!cargando && inmobiliarias.length === 0 && (
            <p className="rounded-medio border border-dashed border-linea p-5 text-center text-sm text-tinta-media">
              Aún no hay inmobiliarias registradas.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
