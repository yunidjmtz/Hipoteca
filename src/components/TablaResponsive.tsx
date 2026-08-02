import type { CSSProperties, ReactNode } from 'react';
import { formatEuros, formatPorcentaje } from '@/core/format';
import type { Cents } from '@/core/money';

interface Props {
  minWidth?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Envoltorio que garantiza scroll horizontal en pantallas estrechas.
 * minWidth se pasa como estilo inline para evitar clases dinámicas de Tailwind.
 */
export function TablaResponsive({ minWidth = '600px', children, className = '' }: Props) {
  return (
    <div className={`overflow-x-auto [-webkit-overflow-scrolling:touch] ${className}`}>
      <table
        className="tabla-responsive w-full border-collapse text-sm"
        style={{ '--tabla-min-width': minWidth } as CSSProperties}
      >
        {children}
      </table>
    </div>
  );
}

/**
 * En móvil la unidad ya aparece en la cabecera de la columna: la celda solo
 * muestra la cifra para reducir el ancho necesario de las tablas.
 */
export function ValorEurosTabla({ valor }: { readonly valor: Cents }) {
  return (
    <>
      {formatEuros(valor).replace(/\s*€/u, '')}
      <span className="hidden sm:inline"> €</span>
    </>
  );
}

export function ValorPorcentajeTabla({ valor }: { readonly valor: number }) {
  return (
    <>
      {formatPorcentaje(valor).replace(/\s*%/u, '')}
      <span className="hidden sm:inline"> %</span>
    </>
  );
}

export function EncabezadoConUnidad({
  titulo,
  unidad,
}: {
  readonly titulo: string;
  readonly unidad: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap leading-tight">
      {titulo}
      <span className="font-normal">{unidad}</span>
    </span>
  );
}
