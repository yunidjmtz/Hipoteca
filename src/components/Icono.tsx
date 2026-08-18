/**
 * Iconografía propia, SVG inline y trazo de 1,5 px: §2.1 prohíbe cualquier
 * icono remoto, y una familia de iconos de línea dibujada a mano encaja mejor
 * con el aire de documento que cualquier set genérico.
 */

const TRAZOS = {
  perfil: ['M12 4a4 4 0 100 8 4 4 0 000-8z', 'M4 20c0-4 3.6-7 8-7s8 3 8 7'],
  casa: ['M3 11L12 4l9 7', 'M5 10v10.5h5v-5h4v5h5V10'],
  hipoteca: [
    'M3.5 9.5h17L12 4 3.5 9.5z',
    'M5.5 10v8.5',
    'M9 10v8.5',
    'M12 10v8.5',
    'M15 10v8.5',
    'M18.5 10v8.5',
    'M3.5 20h17',
  ],
  recibo: ['M5.5 4.5h13v16l-2.5-2-2.5 2-3-2-2.5 2-2.5-2z', 'M8.5 10h7', 'M8.5 13h5'],
  escudo: ['M12 3.5L5 7v5c0 4 3 7.5 7 9 4-1.5 7-5 7-9V7z'],
  corazon: [
    'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
  ],
  herramienta: [
    'M14.7 6.3a4 4 0 01-5 5.3L5.5 17a1.5 1.5 0 002 2l4.3-4.3A4 4 0 0014.7 6.3z',
    'M16.3 4.7l3 3',
  ],
  coche: ['M4 14l2.5-5.5h11L20 14', 'M2 14h20v5.5H2z', 'M6.5 19.5v.5', 'M17.5 19.5v.5'],
  rayo: ['M13 3.5L5 14h7l-1.5 7L20.5 10h-7z'],
  puntos: ['M5.5 11.5h1', 'M11.5 11.5h1', 'M17.5 11.5h1'],
  resumen: ['M3.5 5h17v14h-17z', 'M3.5 10h17', 'M9.5 10v9'],
  capacidad: ['M12 4.5v3', 'M4 8h16', 'M8 8l-3.5 6h7z', 'M16 8l3.5 6h-7z', 'M9 19.5h6'],
  meta: ['M6 3.5v17', 'M6 4.5h11.5l-2 4 2 4H6'],
  escala: ['M3.5 20.5h17', 'M5 20.5V13h3.5v7.5', 'M10.5 20.5V8.5H14v12', 'M16 20.5v-9h3.5v9'],
  simulador: ['M4 7.5h16', 'M4 12h16', 'M4 16.5h16'],
  ofertas: [
    'M3 9.5l9-5.5 9 5.5',
    'M5.5 9.5v10',
    'M18.5 9.5v10',
    'M10 19.5v-6',
    'M14 19.5v-6',
    'M3 19.5h18',
  ],
  amortizacion: ['M4.5 4v16h15', 'M7.5 9l4 4.5 3-2 4.5 5'],
  ajustes: [
    'M12 9.25a2.75 2.75 0 100 5.5 2.75 2.75 0 000-5.5z',
    'M12 3.5v2.25',
    'M12 18.25v2.25',
    'M3.5 12h2.25',
    'M18.25 12h2.25',
    'M6 6l1.6 1.6',
    'M16.4 16.4L18 18',
    'M18 6l-1.6 1.6',
    'M7.6 16.4L6 18',
  ],
  controles: [
    'M4 7h8',
    'M16 7h4',
    'M12 4v6',
    'M4 17h3',
    'M11 17h9',
    'M7 14v6',
    'M4 12h13',
    'M21 12h-4',
    'M17 9v6',
  ],
  ayuda: [
    'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17z',
    'M9.7 9a2.5 2.5 0 014.85.85c0 1.9-2.55 2.2-2.55 4.15',
    'M12 16.75v.01',
  ],
  aviso: ['M12 4.5L21 20H3z', 'M12 10v4.5', 'M12 17.25v.01'],
  candado: ['M6.5 10.5h11v9h-11z', 'M9 10.5V8a3 3 0 016 0v2.5'],
  comprobado: ['M4.5 12.5l4.5 4.5 10.5-10.5'],
  reloj: ['M12 4.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15z', 'M12 8v4.5l3 2'],
  editar: ['M4.5 19.5l4.2-1 10-10a2.1 2.1 0 00-3-3l-10 10z', 'M13.8 7.4l3 3', 'M4.5 19.5l1-4'],
} as const;

export type NombreIcono = keyof typeof TRAZOS;

interface PropsIcono {
  readonly nombre: NombreIcono;
  readonly tamano?: number;
  readonly className?: string;
}

export function Icono({ nombre, tamano = 20, className }: PropsIcono) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {TRAZOS[nombre].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
