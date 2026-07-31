/**
 * Contraste WCAG 2.1 sobre colores hexadecimales.
 * Vive en tests/ y no en src/core/ a propósito: la aplicación no calcula
 * contrastes en tiempo de ejecución, solo se verifican los tokens al probar.
 */

function canalLineal(valor8bits: number): number {
  const c = valor8bits / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminanciaRelativa(hex: string): number {
  const limpio = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) throw new Error(`Color no soportado: ${hex}`);
  const r = Number.parseInt(limpio.slice(0, 2), 16);
  const g = Number.parseInt(limpio.slice(2, 4), 16);
  const b = Number.parseInt(limpio.slice(4, 6), 16);
  return 0.2126 * canalLineal(r) + 0.7152 * canalLineal(g) + 0.0722 * canalLineal(b);
}

export function contraste(hexA: string, hexB: string): number {
  const a = luminanciaRelativa(hexA);
  const b = luminanciaRelativa(hexB);
  const claro = Math.max(a, b);
  const oscuro = Math.min(a, b);
  return (claro + 0.05) / (oscuro + 0.05);
}

export interface TemasDeTokens {
  readonly claro: ReadonlyMap<string, string>;
  readonly oscuro: ReadonlyMap<string, string>;
}

/**
 * Extrae los tokens `--c-*: light-dark(#claro, #oscuro)` de tokens.css.
 * Si alguien define un color fuera de esa forma, `tokensSinLightDark` lo caza.
 */
export function leerTokens(css: string): TemasDeTokens & { readonly tokensSinLightDark: string[] } {
  const claro = new Map<string, string>();
  const oscuro = new Map<string, string>();
  const tokensSinLightDark: string[] = [];

  const conParDeColores =
    /--(c-[\w-]+)\s*:\s*light-dark\(\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\s*\)/g;
  for (const [, nombre, valorClaro, valorOscuro] of css.matchAll(conParDeColores)) {
    if (nombre === undefined || valorClaro === undefined || valorOscuro === undefined) continue;
    claro.set(nombre, valorClaro);
    oscuro.set(nombre, valorOscuro);
  }

  const cualquierTokenDeColor = /--(c-[\w-]+)\s*:/g;
  for (const [, nombre] of css.matchAll(cualquierTokenDeColor)) {
    if (nombre !== undefined && !claro.has(nombre)) tokensSinLightDark.push(nombre);
  }

  return { claro, oscuro, tokensSinLightDark };
}
