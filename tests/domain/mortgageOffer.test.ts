import { describe, expect, it } from 'vitest';
import { ofertaDesdeSimulacion, simulacionDesdeOferta } from '@/domain/mortgageOffer';
import { ESTADO_INICIAL } from '@/storage/defaults';

describe('conversión entre simulación y oferta', () => {
  it('guarda las mismas condiciones hipotecarias con los datos del banco', () => {
    const escenario = {
      ...ESTADO_INICIAL.escenarioSimulador,
      tinFijo: 0.0275,
      taeOficial: 0.031,
    };

    const oferta = ofertaDesdeSimulacion(escenario, {
      id: 'oferta-1',
      viviendaId: 'vivienda-1',
      banco: ' Banco Ejemplo ',
      nombre: ' Hipoteca fija ',
      fecha: '2026-07-31',
      estado: 'fein_recibida',
      notas: ' Vigente 30 días ',
    });

    expect(oferta.banco).toBe('Banco Ejemplo');
    expect(oferta.nombre).toBe('Hipoteca fija');
    expect(oferta.notas).toBe('Vigente 30 días');
    expect(oferta.escenario.tinFijo).toBe(0.0275);
    expect(oferta.escenario.taeOficial).toBe(0.031);
    expect(oferta.taeOficial).toBe(0.031);
  });

  it('recupera la TAE superior de una oferta antigua dentro de la simulación', () => {
    const oferta = ofertaDesdeSimulacion(ESTADO_INICIAL.escenarioSimulador, {
      id: 'oferta-antigua',
      viviendaId: 'vivienda-1',
      banco: 'Banco',
      nombre: 'Oferta',
      fecha: '2026-07-31',
      estado: 'pendiente',
      notas: '',
    });

    expect(simulacionDesdeOferta({ ...oferta, taeOficial: 0.034 }).taeOficial).toBe(0.034);
  });
});
