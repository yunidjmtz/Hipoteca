import type { ChangeEventHandler } from 'react';

interface PropsInterruptor {
  readonly activado: boolean;
  readonly alCambiar: ChangeEventHandler<HTMLInputElement>;
  readonly deshabilitado?: boolean;
}

/** Control booleano nativo, con apariencia de interruptor y accesible por teclado. */
export function Interruptor({ activado, alCambiar, deshabilitado = false }: PropsInterruptor) {
  return (
    <>
      <input
        type="checkbox"
        role="switch"
        checked={activado}
        onChange={alCambiar}
        disabled={deshabilitado}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="flex h-5 w-9 shrink-0 items-center rounded-full bg-linea p-0.5 transition-colors after:block after:h-4 after:w-4 after:rounded-full after:bg-superficie after:shadow-sm after:transition-transform after:content-[''] peer-checked:bg-acento peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-acento/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
      />
    </>
  );
}
