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
    id: 'perfil',
    ruta: '',
    etiqueta: 'Tus datos',
    etiquetaCorta: 'Datos',
    icono: 'perfil',
    fase: 'Fase 1b',
    resumen: 'Los datos básicos que necesitamos para hacer los cálculos.',
    contenidos: [
      'Titulares e ingresos',
      'Ahorros actuales',
      'Deudas y gastos mensuales',
      'Vivienda que buscas',
    ],
  },
  {
    id: 'resumen',
    ruta: 'resumen',
    etiqueta: 'Resumen',
    etiquetaCorta: 'Resumen',
    icono: 'resumen',
    fase: 'Fase 1b',
    resumen: 'Qué puedes comprar hoy, qué te lo limita y cuál es el siguiente paso.',
    contenidos: [
      'Ahorros disponibles y dinero inicial necesario',
      'Precio máximo cómodo, precio máximo bancario y precio máximo absoluto',
      'Dinero que falta para tu precio objetivo y progreso hacia él',
      'Fecha estimada de compra según tu ahorro mensual',
      'Factor limitante y próxima acción recomendada, en una frase completa',
    ],
  },
  {
    id: 'plan-hipotecario',
    ruta: 'plan-hipotecario',
    etiqueta: 'Mi plan hipotecario',
    etiquetaCorta: 'Mi plan',
    icono: 'casa',
    fase: 'Fase 1b',
    resumen: 'El objetivo de compra, el desembolso inicial, el ahorro necesario y tu capacidad.',
    contenidos: [
      'Precio objetivo y cuota estimada',
      'Desembolso inicial y ahorro necesario',
      'Meta de ahorro y fecha orientativa de compra',
      'Capacidad máxima por ahorro e ingresos',
    ],
  },
  {
    id: 'ofertas',
    ruta: 'ofertas',
    etiqueta: 'Ofertas bancarias',
    etiquetaCorta: 'Ofertas',
    icono: 'ofertas',
    fase: 'Fase 1b',
    resumen: 'Añade, simula y compara las propuestas de cada entidad, sin quedarse en la cuota.',
    contenidos: [
      'Simulador de tipo fijo, variable o mixto para introducir cada propuesta',
      'Estado de cada solicitud: pendiente, en estudio, preaprobada, FEIN recibida, firmada',
      'TAE oficial de la FEIN, en un campo aparte de la TAE estimada por la aplicación',
      'Coste real total, desembolso inicial, comisiones y vinculaciones exigidas',
      'Puntuación transparente, configurable y desactivable',
    ],
  },
  {
    id: 'amortizacion',
    ruta: 'amortizacion',
    etiqueta: 'Amortización',
    // La etiqueta corta es siempre un fragmento de la larga (WCAG 2.5.3,
    // «Label in Name»): el nombre accesible del enlace contiene lo que se ve.
    etiquetaCorta: 'Amortización',
    icono: 'amortizacion',
    fase: 'Fase 1b',
    resumen: 'El cuadro mes a mes, cerrando exactamente en 0,00 €.',
    contenidos: [
      'Cuadro mensual y resumen anual: cuota, intereses, principal y pendiente',
      'Vencimientos anclados al día de la primera cuota, sin derivas de calendario',
      'Amortización anticipada: reducir cuota o reducir plazo, con su comisión (Fase 3)',
      'Ahorro neto de intereses de cada amortización simulada (Fase 3)',
    ],
  },
];
