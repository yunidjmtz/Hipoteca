import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contraste, leerTokens } from './utilidades/contraste';

// Se lee del disco a propósito: con el entorno jsdom, Vitest devuelve vacío
// cualquier import de CSS, incluso con `?raw`.
const css = readFileSync(join(import.meta.dirname, '../src/styles/tokens.css'), 'utf8');
const tokens = leerTokens(css);

interface ParExigido {
  readonly frente: string;
  readonly fondo: string;
  readonly minimo: number;
  readonly motivo: string;
}

/**
 * Fase 0 del plan: «tokens de color accesibles (contraste AA verificado)».
 * Verificado significa comprobado por una prueba, no mirado a ojo.
 *
 * AA exige 4,5:1 para texto normal, 3:1 para texto grande y para los bordes
 * de los controles. Aquí se pide 4,5:1 a todo lo que sea texto, incluidos los
 * estados de viabilidad sobre su propio fondo tenue, porque en la escala de
 * precios esas etiquetas se leen en cuerpo pequeño.
 */
const PARES: readonly ParExigido[] = [
  { frente: 'c-tinta', fondo: 'c-lienzo', minimo: 7, motivo: 'texto principal sobre el lienzo' },
  { frente: 'c-tinta', fondo: 'c-superficie', minimo: 7, motivo: 'texto principal sobre panel' },
  {
    frente: 'c-tinta',
    fondo: 'c-superficie-2',
    minimo: 7,
    motivo: 'texto principal sobre fila alterna',
  },
  { frente: 'c-tinta-media', fondo: 'c-superficie', minimo: 4.5, motivo: 'texto secundario' },
  {
    frente: 'c-tinta-media',
    fondo: 'c-lienzo',
    minimo: 4.5,
    motivo: 'texto secundario sobre lienzo',
  },
  { frente: 'c-tinta-suave', fondo: 'c-superficie', minimo: 4.5, motivo: 'rótulos y notas al pie' },
  { frente: 'c-tinta-suave', fondo: 'c-lienzo', minimo: 4.5, motivo: 'rótulos sobre lienzo' },
  {
    frente: 'c-tinta-suave',
    fondo: 'c-superficie-2',
    minimo: 4.5,
    motivo: 'rótulos sobre fila alterna',
  },
  { frente: 'c-acento', fondo: 'c-superficie', minimo: 4.5, motivo: 'enlaces y navegación activa' },
  { frente: 'c-acento', fondo: 'c-lienzo', minimo: 4.5, motivo: 'acento sobre lienzo' },
  {
    frente: 'c-acento',
    fondo: 'c-acento-tenue',
    minimo: 4.5,
    motivo: 'navegación activa resaltada',
  },
  { frente: 'c-sobre-acento', fondo: 'c-acento', minimo: 4.5, motivo: 'texto del botón principal' },
  {
    frente: 'c-linea-fuerte',
    fondo: 'c-superficie',
    minimo: 3,
    motivo: 'borde de control (AA no textual)',
  },
  { frente: 'c-comodo', fondo: 'c-superficie', minimo: 4.5, motivo: 'estado cómodo' },
  {
    frente: 'c-comodo',
    fondo: 'c-comodo-tenue',
    minimo: 4.5,
    motivo: 'estado cómodo sobre su fondo',
  },
  { frente: 'c-ajustado', fondo: 'c-superficie', minimo: 4.5, motivo: 'estado ajustado' },
  {
    frente: 'c-ajustado',
    fondo: 'c-ajustado-tenue',
    minimo: 4.5,
    motivo: 'estado ajustado sobre su fondo',
  },
  { frente: 'c-revisar', fondo: 'c-superficie', minimo: 4.5, motivo: 'estado revisar' },
  {
    frente: 'c-revisar',
    fondo: 'c-revisar-tenue',
    minimo: 4.5,
    motivo: 'estado revisar sobre su fondo',
  },
  { frente: 'c-no-viable', fondo: 'c-superficie', minimo: 4.5, motivo: 'estado no viable' },
  {
    frente: 'c-no-viable',
    fondo: 'c-no-viable-tenue',
    minimo: 4.5,
    motivo: 'estado no viable sobre su fondo',
  },
];

function color(tema: ReadonlyMap<string, string>, nombre: string): string {
  const valor = tema.get(nombre);
  if (valor === undefined) throw new Error(`Token no definido en tokens.css: --${nombre}`);
  return valor;
}

describe('tokens de color', () => {
  it('define todos los colores con light-dark(), sin bloques de tema duplicados', () => {
    expect(tokens.tokensSinLightDark).toEqual([]);
  });

  it('define el mismo conjunto de tokens en ambos temas', () => {
    expect([...tokens.oscuro.keys()].sort()).toEqual([...tokens.claro.keys()].sort());
  });

  for (const tema of ['claro', 'oscuro'] as const) {
    describe(`tema ${tema}`, () => {
      for (const par of PARES) {
        it(`${par.frente} sobre ${par.fondo} cumple ${par.minimo}:1 — ${par.motivo}`, () => {
          const mapa = tokens[tema];
          const ratio = contraste(color(mapa, par.frente), color(mapa, par.fondo));
          expect(
            ratio,
            `${par.frente}/${par.fondo} en tema ${tema}: ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(par.minimo);
        });
      }
    });
  }
});
