import type { ConfigFiscalCcaa } from '@/domain/types';

/**
 * Configuración fiscal de Aragón.
 *
 * ITP — tarifa progresiva por tramos (DLeg 1/2005 Aragón).
 * Fuente: https://www.aragon.es/-/transmisiones-patrimoniales-onerosas
 *
 * AJD — tipo general 1,5 % sobre documentos notariales.
 * Fuente: https://www.aragon.es/-/actos-juridicos-documentados-documentos-notariales-y-judiciales-
 *
 * IVA vivienda nueva — nacional (LIVA art. 91).
 * 10 % libre / 4 % VPO régimen especial o promoción pública (primera entrega).
 * Fuente: https://sede.agenciatributaria.gob.es/Sede/iva/iva-operaciones-inmobiliarias/compro-vivienda-tengo-que-pagar-itp.html
 *
 * Verificado el 16/08/2026 contra los portales oficiales y el texto
 * consolidado del Decreto Legislativo 1/2005.
 */
export const FISCAL_ARAGON: ConfigFiscalCcaa = {
  ccaa: 'Aragón',
  revisadoEl: '16/08/2026',

  // ITP: tarifa progresiva. Tramos sobre la base imponible (precio de compraventa).
  // La cuota se acumula tramo a tramo, igual que el IRPF (R2).
  itpTramos: [
    { hasta: 400_000, tipo: 0.08 },
    { hasta: 450_000, tipo: 0.085 },
    { hasta: 500_000, tipo: 0.09 },
    { hasta: 750_000, tipo: 0.095 },
    { hasta: null, tipo: 0.1 },
  ],

  // Bonificaciones ITP en cuota (12,5 %). Requisito: valor inmueble ≤ 100.000 €.
  // Son compatibles entre sí según el portal tributario de Aragón.
  itpReducciones: [
    {
      id: 'aragon-joven',
      descripcion: 'Menor de 35 años — vivienda habitual ≤ 100.000 €',
      edadMaxima: 35,
      valorMaximoInmueble: 100_000,
      bonificacionCuota: 0.125,
    },
    {
      id: 'aragon-discapacidad',
      descripcion: 'Discapacidad ≥ 65 % — vivienda habitual ≤ 100.000 €',
      discapacidadMinima: 65,
      valorMaximoInmueble: 100_000,
      bonificacionCuota: 0.125,
    },
    {
      id: 'aragon-violencia-genero',
      descripcion:
        'Víctima de violencia de género (orden de protección o sentencia firme en los 10 años anteriores) — vivienda habitual ≤ 100.000 €',
      victimaViolenciaGenero: true,
      valorMaximoInmueble: 100_000,
      bonificacionCuota: 0.125,
    },
  ],

  // AJD compraventa: tipo general 1,5 %.
  ajdCompraventa: 0.015,

  // Bonificaciones AJD en cuota (30 % para <35 años / discap. / VG).
  // La bonificación de familia numerosa (60 %) no se automatiza: también
  // exige renta, venta/primera vivienda y aumento de superficie, datos que el
  // modelo aún no recoge. Aplicarla solo por declarar familia numerosa daría
  // una cifra fiscal incorrecta. Lo mismo afecta a su bonificación ITP (50 %).
  ajdReducciones: [
    {
      id: 'aragon-ajd-joven',
      descripcion: 'Menor de 35 años — AJD vivienda habitual ≤ 100.000 €',
      edadMaxima: 35,
      valorMaximoInmueble: 100_000,
      bonificacionCuota: 0.3,
    },
    {
      id: 'aragon-ajd-discapacidad',
      descripcion: 'Discapacidad ≥ 65 % — AJD vivienda habitual ≤ 100.000 €',
      discapacidadMinima: 65,
      valorMaximoInmueble: 100_000,
      bonificacionCuota: 0.3,
    },
    {
      id: 'aragon-ajd-violencia-genero',
      descripcion: 'Víctima de violencia de género — AJD vivienda habitual ≤ 100.000 €',
      victimaViolenciaGenero: true,
      valorMaximoInmueble: 100_000,
      bonificacionCuota: 0.3,
    },
  ],

  // IVA vivienda nueva (LIVA art. 91). Mismo en todas las CCAA (IVA es estatal).
  ivaViviendaNueva: 0.1, // Primera entrega vivienda libre
  ivaVpoEspecial: 0.04, // VPO régimen especial / promoción pública (primera entrega)
};

/**
 * Configuración genérica/editable por defecto para CCAA no implementadas.
 * El usuario debe revisar y actualizar los valores desde la pantalla Ajustes.
 * Usa ITP plano al 8 % (tarifa mínima habitual) como punto de partida neutral.
 */
export const FISCAL_GENERICA: ConfigFiscalCcaa = {
  ccaa: 'Genérica (editable)',
  revisadoEl: '30/07/2026',
  itpTramos: [{ hasta: null, tipo: 0.08 }],
  itpReducciones: [],
  ajdCompraventa: 0.015,
  ajdReducciones: [],
  ivaViviendaNueva: 0.1,
  ivaVpoEspecial: 0.04,
};

export const FISCAL_POR_DEFECTO: ConfigFiscalCcaa[] = [FISCAL_ARAGON, FISCAL_GENERICA];
