export type Cents = number & { readonly __brand: 'Cents' };

export const ZERO: Cents = 0 as Cents;

export function toCents(euros: number): Cents {
  return Math.floor(euros * 100 + 0.5) as Cents;
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

/** Redondeo half-up de un valor decimal a céntimos enteros. */
export function centsRoundHalfUp(value: number): Cents {
  return Math.floor(value + 0.5) as Cents;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce<number>((acc, v) => acc + v, 0) as Cents;
}

export function addCents(a: Cents, b: Cents): Cents {
  return (a + b) as Cents;
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return (a - b) as Cents;
}

export function multiplyCents(cents: Cents, factor: number): Cents {
  return centsRoundHalfUp(cents * factor);
}

export function maxCents(a: Cents, b: Cents): Cents {
  return a >= b ? a : b;
}

export function minCents(a: Cents, b: Cents): Cents {
  return a <= b ? a : b;
}

export function clampCents(value: Cents, lo: Cents, hi: Cents): Cents {
  return maxCents(lo, minCents(value, hi));
}
