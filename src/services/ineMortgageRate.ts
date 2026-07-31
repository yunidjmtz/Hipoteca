export const INE_MORTGAGE_RATE_URL =
  'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/24457?nult=1&tip=A';

const INE_TOTAL_HOUSING_SERIES_CODE = 'HPT64408';
const CACHE_KEY = 'hipotecas-ine-tin-v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

interface IneObservation {
  Fecha: string;
  Valor: number | string;
}

interface IneSeries {
  COD: string;
  Nombre: string;
  Data: IneObservation[];
}

export interface MortgageRate {
  /** TIN expresado como decimal: 0.0298 equivale a 2,98 %. */
  rate: number;
  /** Mes estadístico de referencia, en formato YYYY-MM. */
  period: string;
  source: 'INE';
  consultedAt: string;
  fromCache: boolean;
  stale: boolean;
}

interface CachedMortgageRate {
  rate: number;
  period: string;
  source: 'INE';
  consultedAt: string;
}

interface FetchMortgageRateOptions {
  force?: boolean;
  now?: Date;
  fetchFn?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function isIneSeries(value: unknown): value is IneSeries {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<IneSeries>;
  return (
    typeof candidate.COD === 'string' &&
    typeof candidate.Nombre === 'string' &&
    Array.isArray(candidate.Data)
  );
}

function isCachedMortgageRate(value: unknown): value is CachedMortgageRate {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CachedMortgageRate>;
  return (
    Number.isFinite(candidate.rate) &&
    typeof candidate.period === 'string' &&
    candidate.source === 'INE' &&
    typeof candidate.consultedAt === 'string'
  );
}

function readCache(storage: Pick<Storage, 'getItem'>): CachedMortgageRate | null {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCachedMortgageRate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(storage: Pick<Storage, 'setItem'>, mortgageRate: CachedMortgageRate): void {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(mortgageRate));
  } catch {
    // La referencia sigue siendo utilizable aunque el navegador bloquee localStorage.
  }
}

export function parseAverageMortgageTin(payload: unknown, consultedAt: string): MortgageRate {
  if (!Array.isArray(payload)) {
    throw new Error('La respuesta del INE no contiene una lista de series');
  }

  const series = payload.filter(isIneSeries);
  const target =
    series.find((item) => item.COD === INE_TOTAL_HOUSING_SERIES_CODE) ??
    series.find((item) => {
      const name = normalize(item.Nombre);
      return name.startsWith('viviendas.') && name.endsWith('mensual. total.');
    });
  const observation = target?.Data[0];
  const valueAsPercent = Number(observation?.Valor);
  const period = observation?.Fecha.slice(0, 7);

  if (
    observation === undefined ||
    !Number.isFinite(valueAsPercent) ||
    valueAsPercent <= 0 ||
    valueAsPercent > 100 ||
    period === undefined ||
    !/^\d{4}-\d{2}$/.test(period)
  ) {
    throw new Error('No se encontró el tipo medio total de las hipotecas sobre viviendas');
  }

  return {
    rate: valueAsPercent / 100,
    period,
    source: 'INE',
    consultedAt,
    fromCache: false,
    stale: false,
  };
}

export async function fetchAverageMortgageTin(
  options: FetchMortgageRateOptions = {},
): Promise<MortgageRate> {
  const now = options.now ?? new Date();
  const consultedAt = now.toISOString();
  const fetchFn = options.fetchFn ?? fetch;
  const storage = options.storage ?? localStorage;
  const cached = readCache(storage);
  const cacheAge = cached === null ? Infinity : now.getTime() - Date.parse(cached.consultedAt);

  if (options.force !== true && cached !== null && cacheAge >= 0 && cacheAge < CACHE_TTL_MS) {
    return { ...cached, fromCache: true, stale: false };
  }

  try {
    const response = await fetchFn(INE_MORTGAGE_RATE_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`INE respondió con ${response.status}`);
    }

    const payload: unknown = await response.json();
    const result = parseAverageMortgageTin(payload, consultedAt);
    writeCache(storage, {
      rate: result.rate,
      period: result.period,
      source: result.source,
      consultedAt: result.consultedAt,
    });
    return result;
  } catch (error) {
    if (cached !== null) {
      return { ...cached, fromCache: true, stale: true };
    }
    throw error;
  }
}
