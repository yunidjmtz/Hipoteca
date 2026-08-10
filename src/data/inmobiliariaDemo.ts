import { toCents, type Cents } from '@/core/money';

export interface InmobiliariaDemo {
  readonly id: string;
  readonly nombre: string;
  readonly marca: string;
  readonly codigo: string;
}

export interface ViviendaCatalogoDemo {
  readonly id: string;
  readonly nombre: string;
  readonly precioVenta: Cents;
  readonly zona: string;
  readonly superficieM2: number;
  readonly habitaciones: number;
  readonly banos: number;
  readonly imagenUrl: string;
  readonly anuncioUrl: string;
  readonly descripcion: string;
  readonly tieneGaraje: boolean;
  readonly tieneTrastero: boolean;
}

export const INMOBILIARIA_DEMO: InmobiliariaDemo = {
  id: 'inmobiliaria-sol',
  nombre: 'Inmobiliaria Sol',
  marca: 'SOL',
  codigo: 'CASA-7K3P',
};

export const VIVIENDAS_CATALOGO_DEMO: readonly ViviendaCatalogoDemo[] = [
  {
    id: 'sol-centro-atico',
    nombre: 'Ático luminoso junto al centro',
    precioVenta: toCents(285_000),
    zona: 'Centro · Zaragoza',
    superficieM2: 92,
    habitaciones: 3,
    banos: 2,
    imagenUrl:
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
    anuncioUrl: 'https://www.idealista.com/',
    descripcion: 'Terraza orientada al sur, salón abierto y plaza de garaje incluida.',
    tieneGaraje: true,
    tieneTrastero: false,
  },
  {
    id: 'sol-romareda-familiar',
    nombre: 'Vivienda familiar con terraza',
    precioVenta: toCents(249_000),
    zona: 'La Romareda · Zaragoza',
    superficieM2: 108,
    habitaciones: 4,
    banos: 2,
    imagenUrl:
      'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80',
    anuncioUrl: 'https://www.idealista.com/',
    descripcion: 'Distribución familiar, terraza tranquila y trastero en la misma finca.',
    tieneGaraje: false,
    tieneTrastero: true,
  },
  {
    id: 'sol-actur-nueva',
    nombre: 'Piso exterior listo para entrar',
    precioVenta: toCents(218_000),
    zona: 'Actur · Zaragoza',
    superficieM2: 76,
    habitaciones: 2,
    banos: 1,
    imagenUrl:
      'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80',
    anuncioUrl: 'https://www.idealista.com/',
    descripcion: 'Reforma reciente, mucha luz natural y excelente conexión con el centro.',
    tieneGaraje: false,
    tieneTrastero: false,
  },
];
