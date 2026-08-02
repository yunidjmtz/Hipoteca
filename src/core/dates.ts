/**
 * Calcula la fecha de vencimiento de la cuota k (1-indexado) anclándose SIEMPRE
 * al día original de la primera cuota — nunca iterando sobre el vencimiento anterior.
 * R8: vencimiento(k) = min(diaOriginal, ultimoDiaDelMes(mes_base + k-1))
 */
export function fechaLocalISO(fecha = new Date()): string {
  const year = String(fecha.getFullYear()).padStart(4, '0');
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Primer día del mes siguiente sin convertir la medianoche local a UTC. */
export function primerDiaMesSiguienteLocal(fecha = new Date()): string {
  return fechaLocalISO(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1));
}

export function fechaVencimiento(fechaPrimeraCuota: string, numeroCuota: number): string {
  const partes = fechaPrimeraCuota.split('-');
  const anchorDay = parseInt(partes[2] ?? '1', 10);
  return addMonthsAnchored(fechaPrimeraCuota, anchorDay, numeroCuota - 1);
}

export function addMonthsAnchored(isoDate: string, anchorDay: number, months: number): string {
  const partes = isoDate.split('-');
  // String.split siempre devuelve al menos un elemento.
  const year = parseInt(partes[0] as string, 10);
  const month = parseInt(partes[1] ?? '1', 10); // 1-indexed

  const totalMeses = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMeses / 12);
  const targetMonth = (totalMeses % 12) + 1; // 1-indexed

  // Último día del mes: día 0 del mes siguiente
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const day = Math.min(anchorDay, lastDay);

  const y = String(targetYear).padStart(4, '0');
  const m = String(targetMonth).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
