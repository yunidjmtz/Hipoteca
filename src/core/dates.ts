/**
 * Calcula la fecha de vencimiento de la cuota k (1-indexado) anclándose SIEMPRE
 * al día original de la primera cuota — nunca iterando sobre el vencimiento anterior.
 * R8: vencimiento(k) = min(diaOriginal, ultimoDiaDelMes(mes_base + k-1))
 */
export function fechaVencimiento(fechaPrimeraCuota: string, numeroCuota: number): string {
  const partes = fechaPrimeraCuota.split('-');
  const anchorDay = parseInt(partes[2] ?? '1', 10);
  return addMonthsAnchored(fechaPrimeraCuota, anchorDay, numeroCuota - 1);
}

export function addMonthsAnchored(isoDate: string, anchorDay: number, months: number): string {
  const partes = isoDate.split('-');
  const year = parseInt(partes[0] ?? '1970', 10);
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
