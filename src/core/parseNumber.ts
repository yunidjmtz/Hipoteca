import { toCents } from './money';
import type { Cents } from './money';

/**
 * Parsea importes en formato español: "1800", "1.800", "1800,5", "1.800,50", "1.800,50 €".
 * Devuelve null si la entrada es inválida o negativa.
 */
export function parseEuros(input: string): Cents | null {
  const cleaned = input.replace(/[€\s]/g, '');
  if (!cleaned) return null;

  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  let normalized: string;
  if (hasDot && hasComma) {
    // "1.800,50" → separador de miles (punto), decimal (coma)
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // "1800,5" → solo coma decimal
    normalized = cleaned.replace(',', '.');
  } else if (hasDot) {
    // "1.800" (miles) o "1.5" (decimal)?
    const afterDot = cleaned.split('.').at(-1) ?? '';
    normalized = afterDot.length === 3 ? cleaned.replace(/\./g, '') : cleaned;
  } else {
    normalized = cleaned;
  }

  const value = parseFloat(normalized);
  if (!isFinite(value) || value < 0) return null;
  return toCents(value);
}

/**
 * Parsea un porcentaje en formato español ("3,25 %" o "3.25") y
 * devuelve el decimal equivalente (0.0325). Devuelve null si es inválido.
 */
export function parseDecimalPorcentaje(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  if (!isFinite(value) || value < 0 || value > 100) return null;
  return value / 100;
}
