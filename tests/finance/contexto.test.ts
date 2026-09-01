import { describe, expect, it } from 'vitest';
import { construirContexto } from '@/finance/contexto';
import { calcularBonificacionAplicable } from '@/finance/purchaseCosts';
import { ESTADO_INICIAL } from '@/storage/defaults';
import { toCents } from '@/core/money';
import type { EstadoPersistido } from '@/domain/types';

function estadoCon(cambios: Partial<EstadoPersistido>): EstadoPersistido {
  return { ...ESTADO_INICIAL, ...cambios };
}

describe('construirContexto', () => {
  it('usa la CCAA seleccionada, la mayor edad y una tasación inferior', () => {
    const estado = estadoCon({
      perfil: {
        ...ESTADO_INICIAL.perfil,
        titulares: [
          { ...ESTADO_INICIAL.perfil.titulares[0], edad: 42 },
          { ...ESTADO_INICIAL.perfil.titulares[0], edad: 37 },
        ],
      },
      preferencias: {
        ...ESTADO_INICIAL.preferencias,
        ccaa: 'Aragón',
        valorReferenciaFiscal: toCents(210_000),
      },
    });

    const contexto = construirContexto(estado, toCents(200_000), toCents(180_000));
    expect(contexto.valorTasacion).toBe(toCents(180_000));
    expect(contexto.valorReferenciaFiscal).toBe(toCents(210_000));
    expect(contexto.reduccion.edadMaximaTitular).toBe(42);
    expect(contexto.reduccion.esViviendaHabitual).toBe(true);
    expect(contexto.configFiscal.ccaa).toBe(estado.preferencias.ccaa);
  });

  it('no activa la bonificación joven completa en una compra con un titular de 35 o más', () => {
    const estado = estadoCon({
      perfil: {
        ...ESTADO_INICIAL.perfil,
        titulares: [
          { ...ESTADO_INICIAL.perfil.titulares[0], edad: 30 },
          { ...ESTADO_INICIAL.perfil.titulares[0], edad: 40 },
        ],
      },
    });

    const contexto = construirContexto(estado, toCents(90_000));
    expect(contexto.reduccion.edadMaximaTitular).toBe(40);
    expect(
      calcularBonificacionAplicable(
        contexto.reduccion,
        contexto.configFiscal.itpReducciones,
        90_000,
      ),
    ).toBe(0);
  });

  it('usa la configuración genérica y no eleva la tasación sobre el precio', () => {
    const estado = estadoCon({
      preferencias: {
        ...ESTADO_INICIAL.preferencias,
        ccaa: 'CCAA inexistente',
        destino: 'segunda',
      },
    });

    const contexto = construirContexto(estado, toCents(200_000), toCents(220_000));
    expect(contexto.valorTasacion).toBe(toCents(200_000));
    expect(contexto.reduccion.esViviendaHabitual).toBe(false);
    expect(contexto.configFiscal.ccaa).toMatch(/editable/i);
  });

  it('prioriza los datos del inmueble sobre las preferencias antiguas', () => {
    const estado = estadoCon({
      preferencias: {
        ...ESTADO_INICIAL.preferencias,
        estadoVivienda: 'usada',
        destino: 'habitual',
        esVpoEspecial: false,
        valorReferenciaFiscal: toCents(160_000),
      },
    });

    const contexto = construirContexto(estado, toCents(150_000), undefined, {
      estadoVivienda: 'nueva',
      destino: 'segunda',
      esVpoEspecial: true,
      valorReferenciaFiscal: toCents(175_000),
      ibiAnual: toCents(600),
      comunidadMensual: toCents(75),
    });

    expect(contexto.estadoVivienda).toBe('nueva');
    expect(contexto.esVpoEspecial).toBe(true);
    expect(contexto.reduccion.esViviendaHabitual).toBe(false);
    expect(contexto.valorReferenciaFiscal).toBe(toCents(175_000));
    expect(contexto.costesRecurrentes.ibiAnual).toBe(toCents(600));
    expect(contexto.costesRecurrentes.comunidadMensual).toBe(toCents(75));
  });

  it('usa la primera configuración si no existe la seleccionada ni la genérica', () => {
    const primera = ESTADO_INICIAL.ajustes.fiscal[0]!;
    const estado = estadoCon({
      preferencias: { ...ESTADO_INICIAL.preferencias, ccaa: 'Desconocida' },
      ajustes: { ...ESTADO_INICIAL.ajustes, fiscal: [primera] },
    });

    expect(construirContexto(estado, toCents(100_000)).configFiscal).toBe(primera);
  });

  it('falla de forma explícita si no hay configuración fiscal', () => {
    const estado = estadoCon({
      preferencias: { ...ESTADO_INICIAL.preferencias, ccaa: 'Desconocida' },
      ajustes: { ...ESTADO_INICIAL.ajustes, fiscal: [] },
    });

    expect(() => construirContexto(estado, toCents(100_000))).toThrow(
      'Falta la configuración fiscal',
    );
  });
});
