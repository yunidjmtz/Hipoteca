import { useState } from 'react';
import type { Cents } from '@/core/money';
import { formatEuros, formatEurosMientrasSeEscribe } from '@/core/format';
import { parseEuros } from '@/core/parseNumber';
import { InfoTooltip } from '@/components/InfoTooltip';

interface PropsInputMoneda {
  readonly valor: Cents;
  readonly onChange: (v: Cents) => void;
  readonly etiqueta: string;
  readonly id: string;
  readonly ayuda?: string;
  readonly error?: string;
  readonly deshabilitado?: boolean;
  readonly minimo?: Cents;
}

export function InputMoneda({
  valor,
  onChange,
  etiqueta,
  id,
  ayuda,
  error,
  deshabilitado = false,
  minimo,
}: PropsInputMoneda) {
  const [texto, setTexto] = useState<string>(() => formatEuros(valor));
  const [editando, setEditando] = useState(false);

  function handleFocus() {
    // En móviles la selección de texto puede perderse al abrir el teclado.
    // Vaciar el valor evita que lo escrito se añada al importe anterior.
    setTexto('');
    setEditando(true);
  }

  function handleBlur() {
    const cents = parseEuros(texto);
    if (cents !== null) {
      const efectivo = minimo !== undefined && cents < minimo ? minimo : cents;
      onChange(efectivo);
    }
    setEditando(false);
  }

  const hayError = error !== undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center">
        <label htmlFor={id} className="text-sm font-medium text-tinta">
          {etiqueta}
        </label>
        {ayuda !== undefined && <InfoTooltip texto={ayuda} />}
      </div>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={editando ? texto : formatEuros(valor)}
        disabled={deshabilitado}
        onChange={(e) => setTexto(formatEurosMientrasSeEscribe(e.target.value))}
        onFocus={handleFocus}
        onBlur={handleBlur}
        aria-describedby={hayError ? `${id}-desc` : undefined}
        aria-invalid={hayError || undefined}
        className={[
          'rounded-medio border px-3 py-2 text-sm text-tinta bg-superficie',
          'focus:outline-none focus:ring-2 focus:ring-acento/50',
          hayError ? 'border-no-viable text-no-viable' : 'border-linea',
          deshabilitado ? 'opacity-50 cursor-not-allowed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      {hayError && (
        <p id={`${id}-desc`} className="text-xs text-no-viable">
          {error}
        </p>
      )}
    </div>
  );
}
