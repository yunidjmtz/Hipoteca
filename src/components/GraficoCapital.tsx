import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatEuros, formatFecha } from '@/core/format';
import { type Cents, ZERO } from '@/core/money';
import type { LineaMensual } from '@/domain/types';
import { Panel } from './Panel';

interface PropsGraficoCapital {
  readonly flujoBase: readonly LineaMensual[];
  readonly flujoAmortizado: readonly LineaMensual[] | null;
  readonly mesAmortizacion: number;
}

function formatoEjeCapital(cents: number): string {
  return `${Math.round(cents / 100_000)} mil €`;
}

export function GraficoCapital({
  flujoBase,
  flujoAmortizado,
  mesAmortizacion,
}: PropsGraficoCapital) {
  const datos = useMemo(() => {
    const amortizadoPorMes = new Map(
      (flujoAmortizado ?? []).map((linea) => [linea.numero, linea.pendiente]),
    );

    return flujoBase.map((linea) => ({
      mes: linea.numero,
      fecha: linea.fecha,
      pendienteBase: linea.pendiente,
      ...(flujoAmortizado !== null
        ? { pendienteAmortizado: amortizadoPorMes.get(linea.numero) ?? ZERO }
        : {}),
    }));
  }, [flujoBase, flujoAmortizado]);

  const hayComparacion = flujoAmortizado !== null;

  return (
    <Panel
      rotulo="Evolución de la deuda"
      titulo={hayComparacion ? 'Antes y después de tu amortización' : 'Cómo se reduce tu deuda'}
    >
      <div
        className="h-72 w-full"
        role="img"
        aria-label={
          hayComparacion
            ? 'Gráfico que compara el capital pendiente original con el capital tras la amortización.'
            : 'Gráfico de la evolución mensual del capital pendiente de la hipoteca seleccionada.'
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} margin={{ top: 12, right: 14, bottom: 4, left: 6 }}>
            <defs>
              <linearGradient id="capital-base" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--c-acento)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--c-acento)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--c-linea)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="mes"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--c-tinta-suave)', fontSize: 12 }}
              tickFormatter={(mes: number) => `Año ${Math.round(mes / 12)}`}
              minTickGap={42}
            />
            <YAxis
              width={58}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--c-tinta-suave)', fontSize: 12 }}
              tickFormatter={formatoEjeCapital}
            />
            <Tooltip
              labelFormatter={(mes) => {
                const mesNumero =
                  typeof mes === 'number' || typeof mes === 'string' ? Number(mes) : 0;
                const punto = datos.find((dato) => dato.mes === mesNumero);
                return punto === undefined
                  ? `Mes ${mesNumero}`
                  : `Mes ${mesNumero} · ${formatFecha(punto.fecha)}`;
              }}
              formatter={(valor, nombre) => [formatEuros(Number(valor) as Cents), nombre]}
              contentStyle={{
                borderColor: 'var(--c-linea)',
                borderRadius: 'var(--r-medio)',
                backgroundColor: 'var(--c-superficie)',
                color: 'var(--c-tinta)',
              }}
            />
            {hayComparacion && (
              <ReferenceLine
                x={mesAmortizacion}
                stroke="var(--c-tinta-suave)"
                strokeDasharray="4 4"
                label={{
                  value: 'Amortización',
                  position: 'top',
                  fill: 'var(--c-tinta-suave)',
                  fontSize: 12,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="pendienteBase"
              name="Sin amortizar"
              stroke="var(--c-acento)"
              strokeWidth={2}
              fill="url(#capital-base)"
              isAnimationActive={false}
            />
            {hayComparacion && (
              <Line
                type="monotone"
                dataKey="pendienteAmortizado"
                name="Con amortización"
                stroke="var(--c-comodo)"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {hayComparacion && <Legend wrapperStyle={{ fontSize: '0.75rem' }} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-tinta-suave">
        El área muestra el capital que queda por devolver cada mes. Cuando simules una amortización,
        la línea verde mostrará la diferencia real frente al plan original.
      </p>
    </Panel>
  );
}
