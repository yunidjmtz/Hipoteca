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
    id: 'simulador',
    ruta: 'simulador',
    etiqueta: 'Simulador hipotecario',
    etiquetaCorta: 'Simulador',
    icono: 'simulador',
    fase: 'Fase 1b',
    resumen: 'Simula una hipoteca y guárdala como oferta bancaria para compararla.',
    contenidos: [
      'Tipo fijo por el sistema francés, con la cuota redondeada al céntimo',
      'Tipo variable con Euríbor introducido a mano y suelo del TIN (Fase 2)',
      'Tipo mixto, mostrando siempre las dos cuotas (Fase 2)',
      'Vinculaciones, con su bonificación y su coste real (Fase 2)',
      'Pruebas de estrés: Euríbor +1, +2, +3 y pérdida de bonificaciones (Fase 2)',
      'Guardado directo de la simulación como oferta bancaria',
    ],
  },
  {
    id: 'ofertas',
    ruta: 'ofertas',
    etiqueta: 'Ofertas bancarias',
    etiquetaCorta: 'Ofertas',
    icono: 'ofertas',
    fase: 'Fase 3',
    resumen: 'Compara las simulaciones guardadas de cada entidad, sin quedarse en la cuota.',
    contenidos: [
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
];
