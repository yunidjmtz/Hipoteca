import type { Cents } from './money';
import { fromCents } from './money';

const fmtEuros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtPorcentaje = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtEntero = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 0,
});

export function formatEuros(cents: Cents): string {
  return fmtEuros.format(fromCents(cents));
}

/** Formato español durante la edición, sin añadir el símbolo para no mover el cursor. */
export function formatEurosMientrasSeEscribe(input: string): string {
  let cleaned = input.replace(/[€\s]/g, '');
  const puntos = cleaned.split('.');
  if (!cleaned.includes(',') && puntos.length === 2 && (puntos[1]?.length ?? 0) <= 2) {
    cleaned = `${puntos[0] ?? ''},${puntos[1] ?? ''}`;
  }
  const [enteroRaw = '', ...decimalesRaw] = cleaned.split(',');
  const enteroSinSeparadores = enteroRaw.replace(/\D/g, '');
  const enteroNormalizado = enteroSinSeparadores.replace(/^0+(?=\d)/, '');
  const entero =
    enteroNormalizado === '' ? '' : enteroNormalizado.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const tieneDecimales = decimalesRaw.length > 0;
  const decimales = decimalesRaw.join('').replace(/\D/g, '').slice(0, 2);

  return tieneDecimales ? `${entero},${decimales}` : entero;
}

export function formatPorcentaje(decimal: number): string {
  return fmtPorcentaje.format(decimal);
}

export function formatEntero(value: number): string {
  return fmtEntero.format(value);
}

export function formatFecha(isoDate: string): string {
  const partes = isoDate.split('-');
  const year = Number(partes[0] ?? '1970');
  const month = Number(partes[1] ?? '1');
  const day = Number(partes[2] ?? '1');
  // Fecha local para evitar desplazamientos UTC
  return new Date(year, month - 1, day).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
