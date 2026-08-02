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
    'Amortización extraordinaria (€)',
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
      formatEuros(l.amortizacionExtraordinaria),
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
// Generador PDF
// ---------------------------------------------------------------------------

/** Descarga el cuadro de amortización en PDF, con cabecera repetida en cada página. */
export async function descargarPDFAmortizacion(lineas: readonly LineaMensual[]): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const documento = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });
  const fecha = new Date();
  const fechaArchivo = fecha.toISOString().slice(0, 10);
  const fechaDocumento = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fecha);

  autoTable(documento, {
    head: [
      [
        'Nº',
        'Fecha',
        'TIN',
        'Cuota',
        'Intereses',
        'Principal',
        'Amortización extra',
        'Pendiente',
        'Costes vinculados',
      ],
    ],
    body: lineas
      .slice(1)
      .map((linea) => [
        String(linea.numero),
        formatFecha(linea.fecha),
        formatPorcentaje(linea.tinAplicado),
        formatEuros(linea.cuota),
        formatEuros(linea.intereses),
        formatEuros(linea.principal),
        formatEuros(linea.amortizacionExtraordinaria),
        formatEuros(linea.pendiente),
        formatEuros(linea.costesVinculados),
      ]),
    startY: 24,
    margin: { top: 24, right: 10, bottom: 14, left: 10 },
    styles: {
      font: 'courier',
      fontSize: 7,
      cellPadding: 1.8,
      textColor: [45, 39, 33],
      lineColor: [225, 213, 194],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [140, 90, 0],
      textColor: [255, 255, 255],
      font: 'helvetica',
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [250, 247, 242] },
    columnStyles: {
      0: { halign: 'right', cellWidth: 10 },
      1: { cellWidth: 22 },
      2: { halign: 'right', cellWidth: 17 },
      3: { halign: 'right', cellWidth: 29 },
      4: { halign: 'right', cellWidth: 29 },
      5: { halign: 'right', cellWidth: 29 },
      6: { halign: 'right', cellWidth: 31 },
      7: { halign: 'right', cellWidth: 31 },
      8: { halign: 'right', cellWidth: 32 },
    },
    didDrawPage: () => {
      documento.setFont('helvetica', 'bold');
      documento.setFontSize(14);
      documento.setTextColor(45, 39, 33);
      documento.text('Mi Hipoteca', 10, 10);
      documento.setFont('helvetica', 'normal');
      documento.setFontSize(10);
      documento.setTextColor(100, 91, 80);
      documento.text('Cuadro mensual tras amortización anticipada', 10, 16);
      documento.text(`Generado el ${fechaDocumento}`, 287, 10, { align: 'right' });
      documento.setFontSize(8);
      documento.text(`Página ${documento.getNumberOfPages()}`, 287, 204, { align: 'right' });
    },
  });

  documento.save(`amortizacion-anticipada-${fechaArchivo}.pdf`);
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
