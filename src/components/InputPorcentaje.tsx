import { useState } from 'react';
import { parseDecimalPorcentaje } from '@/core/parseNumber';
import { formatPorcentaje } from '@/core/format';
import { InfoTooltip } from '@/components/InfoTooltip';

interface PropsInputPorcentaje {
  readonly valor: number;
  readonly onChange: (v: number) => void;
  readonly etiqueta: string;
  readonly id: string;
  readonly ayuda?: string;
  readonly error?: string;
  readonly deshabilitado?: boolean;
  readonly mostrarVacioSiCero?: boolean;
  readonly onVaciar?: () => void;
}

export function InputPorcentaje({
  valor,
  onChange,
  etiqueta,
  id,
  ayuda,
  error,
  deshabilitado = false,
  mostrarVacioSiCero = false,
  onVaciar,
}: PropsInputPorcentaje) {
  const [texto, setTexto] = useState<string>(() => formatPorcentaje(valor));
  const [editando, setEditando] = useState(false);

  function handleFocus() {
    setTexto('');
    setEditando(true);
  }

  function handleBlur() {
    const decimal = parseDecimalPorcentaje(texto);
    if (decimal !== null) {
      onChange(decimal);
    } else if (texto.trim() === '') {
      onVaciar?.();
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
        value={editando ? texto : mostrarVacioSiCero && valor === 0 ? '' : formatPorcentaje(valor)}
        disabled={deshabilitado}
        onChange={(e) => setTexto(e.target.value)}
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
