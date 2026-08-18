import { normalizarEscenarioHipoteca } from '@/domain/mortgageScenario';
import type { EscenarioHipoteca, EstadoOferta, OfertaBancaria } from '@/domain/types';

export interface DatosOferta {
  id: string;
  viviendaId: string;
  banco: string;
  nombre: string;
  fecha: string;
  estado: EstadoOferta;
  notas: string;
}

function normalizarTaeOficial(valor: number | undefined): number | undefined {
  return valor !== undefined && Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

/**
 * Una oferta no tiene un cálculo hipotecario propio: es una simulación guardada
 * con los datos de seguimiento del banco.
 */
export function ofertaDesdeSimulacion(
  escenario: EscenarioHipoteca,
  datos: DatosOferta,
): OfertaBancaria {
  const escenarioNormalizado = normalizarEscenarioHipoteca({
    ...escenario,
    titulo: datos.nombre.trim(),
  });
  const taeOficial = normalizarTaeOficial(escenarioNormalizado.taeOficial);
  const escenarioGuardado: EscenarioHipoteca = { ...escenarioNormalizado };
  if (taeOficial === undefined) delete escenarioGuardado.taeOficial;

  return {
    id: datos.id,
    viviendaId: datos.viviendaId,
    banco: datos.banco.trim(),
    nombre: datos.nombre.trim(),
    fecha: datos.fecha,
    estado: datos.estado,
    escenario: escenarioGuardado,
    ...(taeOficial !== undefined ? { taeOficial } : {}),
    notas: datos.notas.trim(),
  };
}

/** Conserva la TAE de ofertas antiguas que todavía la guardaban fuera del escenario. */
export function simulacionDesdeOferta(oferta: OfertaBancaria): EscenarioHipoteca {
  const taeOficial =
    normalizarTaeOficial(oferta.taeOficial) ?? normalizarTaeOficial(oferta.escenario.taeOficial);
  const escenarioSinTae = { ...oferta.escenario };
  delete escenarioSinTae.taeOficial;

  return normalizarEscenarioHipoteca({
    ...escenarioSinTae,
    ...(taeOficial !== undefined ? { taeOficial } : {}),
  });
}
