/**
 * Exportación de datos a CSV.
 * Separador: punto y coma (estándar ES para Excel).
 * Encoding: el BOM UTF-8 se añade al blob para que Excel lo reconozca.
 */
import type { LineaMensual, EvaluacionPrecio } from '@/domain/types';
import { formatEuros, formatFecha, formatPorcentaje } from '@/core/format';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escaparCSV(valor: string): string {
  if (valor.includes(';') || valor.includes('"') || valor.includes('\n')) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

function filaCSV(campos: string[]): string {
  return campos.map(escaparCSV).join(';');
}

// ---------------------------------------------------------------------------
// Generadores de contenido CSV
// ---------------------------------------------------------------------------

export function generarCSVAmortizacion(lineas: readonly LineaMensual[]): string {
  const cabecera = [
    'Nº',
    'Fecha',
    'TIN (%)',
    'Cuota (€)',
    'Intereses (€)',
    'Principal (€)',
    'Pendiente (€)',
    'Costes vinculados (€)',
  ];
  const filas = lineas
    .slice(1)
    .map((l) => [
      String(l.numero),
      formatFecha(l.fecha),
      formatPorcentaje(l.tinAplicado),
      formatEuros(l.cuota),
      formatEuros(l.intereses),
      formatEuros(l.principal),
      formatEuros(l.pendiente),
      formatEuros(l.costesVinculados),
    ]);
  return [cabecera, ...filas].map(filaCSV).join('\r\n');
}

export function generarCSVEscala(filas: readonly EvaluacionPrecio[]): string {
  const cabecera = [
    'Precio (€)',
    'Entrada (€)',
    'Impuestos (€)',
    'Notaría, tasación y otros gastos (€)',
    'Inmobiliaria con IVA (€)',
    'Broker hipotecario (€)',
    'Dinero mínimo (€)',
    'Faltante (€)',
    'Cuota (€)',
    'Ratio bancario (%)',
    'Estado',
  ];
  const datos = filas.map((f) => [
    formatEuros(f.precio),
    formatEuros(f.entrada),
    formatEuros(f.impuestos),
    formatEuros(f.gastosObligatorios),
    formatEuros(f.gastosInmobiliaria),
    formatEuros(f.gastosBroker),
    formatEuros(f.dineroMinimo),
    formatEuros(f.faltante),
    formatEuros(f.cuota),
    formatPorcentaje(f.ratioBancario),
    f.estado,
  ]);
  return [cabecera, ...datos].map(filaCSV).join('\r\n');
}

// ---------------------------------------------------------------------------
// Descarga en el navegador
// ---------------------------------------------------------------------------

/** Inicia la descarga de un archivo CSV. No realiza ninguna petición de red. */
export function descargarCSV(contenido: string, nombreArchivo: string): void {
  // BOM UTF-8 para compatibilidad con Excel en Windows
  const blob = new Blob(['﻿' + contenido], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
