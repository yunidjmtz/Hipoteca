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

/**
 * Una oferta no tiene un cálculo hipotecario propio: es una simulación guardada
 * con los datos de seguimiento del banco.
 */
export function ofertaDesdeSimulacion(
  escenario: EscenarioHipoteca,
  datos: DatosOferta,
): OfertaBancaria {
  const escenarioGuardado = normalizarEscenarioHipoteca({
    ...escenario,
    titulo: datos.nombre.trim(),
  });

  return {
    id: datos.id,
    viviendaId: datos.viviendaId,
    banco: datos.banco.trim(),
    nombre: datos.nombre.trim(),
    fecha: datos.fecha,
    estado: datos.estado,
    escenario: escenarioGuardado,
    ...(escenarioGuardado.taeOficial !== undefined
      ? { taeOficial: escenarioGuardado.taeOficial }
      : {}),
    notas: datos.notas.trim(),
  };
}

/** Conserva la TAE de ofertas antiguas que todavía la guardaban fuera del escenario. */
export function simulacionDesdeOferta(oferta: OfertaBancaria): EscenarioHipoteca {
  return normalizarEscenarioHipoteca({
    ...oferta.escenario,
    ...(oferta.taeOficial !== undefined ? { taeOficial: oferta.taeOficial } : {}),
  });
}
