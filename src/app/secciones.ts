import type { NombreIcono } from '@/components/Icono';

/**
 * Las secciones principales de §6, en un único sitio: de aquí salen las rutas, la
 * navegación lateral, la navegación inferior de la tableta y el contenido
 * previsto de cada pantalla. Sin duplicar la lista en cuatro archivos.
 */
export interface Seccion {
  readonly id: string;
  /** Ruta relativa dentro del router por hash. La cadena vacía es el índice. */
  readonly ruta: string;
  readonly etiqueta: string;
  readonly etiquetaCorta: string;
  readonly icono: NombreIcono;
  readonly fase: 'Fase 1b' | 'Fase 2' | 'Fase 3';
  readonly resumen: string;
  readonly contenidos: readonly string[];
}

export function seccionPorId(id: string): Seccion {
  const seccion = SECCIONES.find((candidata) => candidata.id === id);
  if (seccion === undefined) throw new Error(`Sección desconocida: ${id}`);
  return seccion;
}

export const SECCIONES: readonly Seccion[] = [
  {
    id: 'resumen',
    ruta: 'resumen',
    etiqueta: 'Resumen',
    etiquetaCorta: 'Resumen',
    icono: 'resumen',
    fase: 'Fase 1b',
    resumen: 'Tu capacidad económica actual, qué te la limita y el siguiente paso.',
    contenidos: [
      'Ingresos, gastos, deudas y ahorro disponibles',
      'Precio máximo cómodo y máximo bancario',
      'Capacidad económica y próxima acción recomendada',
    ],
  },
  {
    id: 'ofertas',
    ruta: 'ofertas',
    etiqueta: 'Inmuebles',
    etiquetaCorta: 'Inmuebles',
    icono: 'casa',
    fase: 'Fase 1b',
    resumen: 'Guarda y compara las viviendas que estás valorando.',
    contenidos: [
      'Viviendas candidatas, sus características, reformas y costes aproximados',
      'Comparación del coste real y del encaje de cada inmueble con tu plan',
    ],
  },
  {
    id: 'hipoteca',
    ruta: 'hipoteca',
    etiqueta: 'Hipoteca',
    etiquetaCorta: 'Hipoteca',
    icono: 'hipoteca',
    fase: 'Fase 1b',
    resumen: 'Añade, simula y compara las propuestas de cada entidad, sin quedarte en la cuota.',
    contenidos: [
      'Simulador de tipo fijo, variable o mixto para introducir cada propuesta',
      'Estado de cada solicitud: pendiente, en estudio, preaprobada, FEIN recibida, firmada',
      'TAE oficial de la FEIN, en un campo aparte de la TAE estimada por la aplicación',
      'Coste real total, desembolso inicial, comisiones y vinculaciones exigidas',
      'Puntuación transparente, configurable y desactivable',
    ],
  },
  {
    id: 'comparador',
    ruta: 'comparador',
    etiqueta: 'Comparador',
    etiquetaCorta: 'Comparador',
    icono: 'comparador',
    fase: 'Fase 1b',
    resumen: 'Compara hasta tres viviendas o hipotecas con todos sus costes y riesgos.',
    contenidos: [
      'Comparación de viviendas por precio, coste completo, reforma y precio por metro cuadrado',
      'Comparación de hipotecas por cuota, TAE, coste total, vinculaciones y resistencia a subidas',
      'Lectura adaptada a móvil con un máximo de tres alternativas',
    ],
  },
  {
    id: 'perfil',
    ruta: '',
    etiqueta: 'Mis finanzas',
    etiquetaCorta: 'Datos',
    icono: 'perfil',
    fase: 'Fase 1b',
    resumen: 'Tus ingresos, gastos, deudas y ahorro para calcular una compra cómoda.',
    contenidos: ['Titulares e ingresos', 'Ahorros actuales', 'Deudas y gastos mensuales'],
  },
];
