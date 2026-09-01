import { useState } from 'react';
import { toCents, type Cents } from '@/core/money';
import { formatEuros, formatEurosMientrasSeEscribe } from '@/core/format';
import { parseEuros } from '@/core/parseNumber';
import { InfoTooltip } from '@/components/InfoTooltip';
import { Icono } from '@/components/Icono';
import type { NombreIcono } from '@/components/Icono';

interface PropsInputMoneda {
  readonly valor: Cents;
  readonly onChange: (v: Cents) => void;
  readonly etiqueta: string;
  readonly id: string;
  readonly ayuda?: string;
  readonly error?: string;
  readonly deshabilitado?: boolean;
  readonly minimo?: Cents;
  readonly icono?: NombreIcono;
  readonly comoDeslizador?: boolean;
  readonly maximoDeslizador?: Cents;
  readonly pasoDeslizador?: Cents;
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
  icono,
  comoDeslizador = false,
  maximoDeslizador = toCents(3_000),
  pasoDeslizador = toCents(25),
}: PropsInputMoneda) {
  const [texto, setTexto] = useState<string>(() => formatEuros(valor));
  const [editando, setEditando] = useState(false);
  const [textoDeslizador, setTextoDeslizador] = useState<string>(() => formatEuros(valor));
  const [editandoDeslizador, setEditandoDeslizador] = useState(false);
  const maximoEfectivo = maximoDeslizador;

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

  function handleBlurDeslizador() {
    const cents = parseEuros(textoDeslizador);
    if (cents !== null) {
      onChange(Math.min(cents, maximoEfectivo) as Cents);
    }
    setEditandoDeslizador(false);
  }

  const hayError = error !== undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {icono !== undefined && <Icono nombre={icono} tamano={16} className="text-acento" />}
        <label htmlFor={id} className="text-sm font-medium text-tinta">
          {etiqueta}
        </label>
        {ayuda !== undefined && <InfoTooltip texto={ayuda} />}
      </div>
      <input
        id={id}
        type={comoDeslizador ? 'range' : 'text'}
        inputMode={comoDeslizador ? undefined : 'decimal'}
        min={comoDeslizador ? 0 : undefined}
        max={comoDeslizador ? maximoEfectivo / 100 : undefined}
        step={comoDeslizador ? pasoDeslizador / 100 : undefined}
        value={comoDeslizador ? valor / 100 : editando ? texto : formatEuros(valor)}
        disabled={deshabilitado}
        onChange={(e) => {
          if (comoDeslizador) {
            onChange(toCents(Number(e.target.value)));
            return;
          }
          setTexto(formatEurosMientrasSeEscribe(e.target.value));
        }}
        onFocus={comoDeslizador ? undefined : handleFocus}
        onBlur={comoDeslizador ? undefined : handleBlur}
        aria-describedby={hayError ? `${id}-desc` : undefined}
        aria-invalid={hayError || undefined}
        aria-valuetext={comoDeslizador ? `${formatEuros(valor)} al mes` : undefined}
        className={[
          comoDeslizador
            ? 'mt-2 h-2 w-full cursor-pointer accent-acento'
            : 'rounded-medio border px-3 py-2 text-sm text-tinta bg-superficie',
          'focus:outline-none focus:ring-2 focus:ring-acento/50',
          hayError ? 'border-no-viable text-no-viable' : 'border-linea',
          deshabilitado ? 'opacity-50 cursor-not-allowed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      {comoDeslizador && (
        <div className="flex items-center justify-between text-xs text-tinta-suave">
          <span>0 €</span>
          <div className="flex items-center gap-0.5 font-cifra text-sm font-semibold tabular-nums text-acento">
            <input
              aria-label={`${etiqueta}: importe mensual`}
              type="text"
              inputMode="decimal"
              value={editandoDeslizador ? textoDeslizador : formatEuros(valor)}
              onFocus={(e) => {
                setTextoDeslizador(formatEuros(valor));
                setEditandoDeslizador(true);
                e.currentTarget.select();
              }}
              onChange={(e) => setTextoDeslizador(formatEurosMientrasSeEscribe(e.target.value))}
              onBlur={handleBlurDeslizador}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="w-20 rounded-medio border border-linea bg-superficie px-1 py-0.5 text-center text-sm font-semibold text-acento focus:outline-none focus:ring-2 focus:ring-acento/50"
            />
            <span>/mes</span>
          </div>
          <span>{formatEuros(maximoEfectivo)}</span>
        </div>
      )}
      {hayError && (
        <p id={`${id}-desc`} className="text-xs text-no-viable">
          {error}
        </p>
      )}
    </div>
  );
}
