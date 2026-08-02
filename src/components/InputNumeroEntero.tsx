import { useState } from 'react';

interface PropsInputNumeroEntero {
  readonly id: string;
  readonly valor: number;
  readonly minimo: number;
  readonly maximo: number;
  readonly onChange: (valor: number) => void;
  readonly className: string;
}

/**
 * Campo numérico para pantallas táctiles. Se vacía al empezar a editar y solo
 * aplica los límites cuando el usuario termina, para que se pueda sustituir
 * por completo un valor ya guardado.
 */
export function InputNumeroEntero({
  id,
  valor,
  minimo,
  maximo,
  onChange,
  className,
}: PropsInputNumeroEntero) {
  const [texto, setTexto] = useState<string | null>(null);

  function guardar() {
    const candidato = texto?.trim() ?? '';
    const numero = Number(candidato);

    if (candidato !== '' && Number.isInteger(numero)) {
      onChange(Math.min(maximo, Math.max(minimo, numero)));
    }

    setTexto(null);
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={texto ?? String(valor)}
      onFocus={() => setTexto('')}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      className={className}
    />
  );
}
