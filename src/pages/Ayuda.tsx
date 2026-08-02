import { Icono } from '@/components/Icono';

interface ApartadoManual {
  readonly id: string;
  readonly titulo: string;
  readonly descripcion: string;
  readonly pasos: readonly string[];
  readonly nota?: string;
  readonly ruta?: string;
}

const APARTADOS: readonly ApartadoManual[] = [
  {
    id: 'primeros-pasos',
    titulo: 'Primeros pasos',
    descripcion: 'La aplicación calcula en tu dispositivo y guarda los datos en este navegador.',
    pasos: [
      'Empieza por Tus datos: completa vivienda, titulares, ahorro, deudas y gastos.',
      'Consulta Mi plan hipotecario para saber qué precio es razonable y cuánto te falta.',
      'Cuando tengas propuestas, añádelas en Ofertas bancarias y compáralas.',
      'Guarda una oferta para revisar su cuadro en Amortización.',
    ],
    nota: 'Las cifras son estimaciones para comparar escenarios; la oferta vinculante del banco es la FEIN.',
  },
  {
    id: 'documentacion',
    titulo: 'Documentación que conviene preparar',
    descripcion:
      'Tener los documentos a mano hace que las simulaciones y las conversaciones con el banco sean más precisas.',
    pasos: [
      'Reúne nóminas recientes, declaración de la renta, vida laboral y extractos bancarios de todos los titulares.',
      'Prepara los justificantes de otros ingresos, ahorros y deudas pendientes. Indica en la aplicación los importes realmente disponibles.',
      'Para cada vivienda, guarda anuncio, precio, referencia catastral si la tienes, certificado energético e información de comunidad, IBI y reformas.',
      'Cuando recibas una propuesta, conserva la FEIN y la ficha de productos vinculados. Introduce sus datos en la oferta para comparar propuestas equivalentes.',
    ],
    nota: 'No subas documentación sensible a la aplicación: sirve para calcular y comparar, no para tramitar solicitudes.',
  },
  {
    id: 'datos',
    titulo: 'Tus datos',
    descripcion:
      'Es la base de todos los cálculos. Los cambios se reflejan automáticamente en el resto de secciones.',
    pasos: [
      'En Vivienda, indica el precio objetivo, comunidad autónoma, si es nueva o usada y el destino. Añade el valor de referencia si lo conoces: puede afectar a los impuestos.',
      'En Titulares, introduce el neto de cada paga, 12 o 14 pagas, edad y situación laboral. Añade un segundo titular solo si compra contigo.',
      'En Otros ingresos, incorpora importes periódicos como alquileres o pensiones con su periodicidad.',
      'En Deudas y gastos, registra cuotas de préstamos, tarjetas y gastos fijos. Marca el alquiler actual para excluirlo al estimar la vida tras la compra.',
      'Guarda al terminar cada pestaña. Puedes volver a modificar cualquier dato.',
    ],
    ruta: '/',
  },
  {
    id: 'resumen',
    titulo: 'Resumen y Mi plan hipotecario',
    descripcion:
      'Muestran una fotografía de tu capacidad de compra, tu ahorro y el siguiente paso recomendado.',
    pasos: [
      'Abre Resumen para ver ingresos, ahorro, cuota máxima, gastos actuales y el factor que más limita tu compra.',
      'Abre Mi plan hipotecario para contrastar el precio objetivo con el desembolso inicial, la cuota estimada y la meta de ahorro.',
      'Compara el precio cómodo con el máximo bancario: el primero busca proteger tu presupuesto y el segundo refleja el límite de endeudamiento configurado.',
      'Si hay dinero pendiente, ajusta el ahorro mensual para ver una fecha orientativa de compra.',
    ],
    ruta: '/resumen',
  },
  {
    id: 'ofertas',
    titulo: 'Ofertas bancarias',
    descripcion:
      'Sirve para guardar y comparar hipotecas y viviendas sin fijarse solo en la cuota mensual.',
    pasos: [
      'En la pestaña Hipotecas, pulsa Añadir hipoteca y completa banco, precio, entrada, financiación, plazo y tipo de interés.',
      'Para tipo fijo, informa el TIN. Para variable, revisa Euríbor y diferencial; para mixto, añade el TIN y periodo fijo.',
      'Añade comisión de apertura, TAE oficial de la FEIN si la tienes y las vinculaciones. Una bonificación puede bajar el TIN pero tener un coste anual.',
      'Guarda la simulación y compárala con otras por cuota, TAE oficial/estimada, coste total y desembolso.',
      'En Viviendas puedes registrar inmuebles, sus características, reformas y costes aproximados para compararlos antes de elegir.',
    ],
    nota: 'La TAE de la FEIN es la referencia oficial; la TAE estimada de la aplicación sirve para homogeneizar la comparación.',
    ruta: '/ofertas',
  },
  {
    id: 'antes-firmar',
    titulo: 'Antes de firmar una hipoteca',
    descripcion:
      'Haz esta revisión final con la documentación oficial, no solo con las cifras de una simulación.',
    pasos: [
      'Contrasta TIN, TAE, cuota, plazo, capital concedido y coste total de la aplicación con la FEIN de cada banco.',
      'Confirma todas las comisiones: apertura, amortización parcial o total, novación, subrogación y cualquier coste de productos vinculados.',
      'Comprueba que el desembolso incluye entrada, impuestos, tasación, notaría, registro, gestoría, inmobiliaria y una reserva para imprevistos.',
      'Si la hipoteca es variable o mixta, simula una subida del Euríbor y decide si la cuota seguiría siendo asumible sin recortar gastos esenciales.',
      'Revisa los costes posteriores a la compra: comunidad, IBI, seguros, suministros, mantenimiento y reformas necesarias.',
      'Lleva tus dudas al banco, al notario o a un profesional independiente antes de aceptar una condición que no entiendas.',
    ],
    nota: 'La FEIN y la documentación contractual prevalecen sobre cualquier cálculo orientativo de esta aplicación.',
  },
  {
    id: 'amortizacion',
    titulo: 'Amortización',
    descripcion:
      'Desglosa una hipoteca guardada cuota a cuota y permite valorar aportaciones anticipadas.',
    pasos: [
      'Selecciona una hipoteca guardada. Si no aparece ninguna, crea y guarda una en Ofertas bancarias.',
      'Revisa el cuadro mensual o anual: separa cada cuota en intereses, capital amortizado y saldo pendiente.',
      'Para simular una amortización anticipada, indica importe, fecha y comisión cuando corresponda.',
      'Elige entre reducir cuota o reducir plazo y compara el ahorro de intereses antes de tomar una decisión.',
    ],
    ruta: '/amortizacion',
  },
  {
    id: 'escala',
    titulo: 'Escala de precios',
    descripcion: 'Explora rápidamente qué ocurre al cambiar el precio de compra.',
    pasos: [
      'Consulta las filas de precio para ver entrada, mínimo necesario, dinero faltante y cuota estimada.',
      'Usa esta vista para identificar un intervalo realista, no como sustituto de la valoración del banco.',
      'Cambia precio mínimo, máximo y paso desde Ajustes si quieres explorar otro rango.',
    ],
    ruta: '/escala',
  },
  {
    id: 'glosario',
    titulo: 'Glosario esencial',
    descripcion:
      'Estos conceptos ayudan a interpretar ofertas y evitar comparar cifras que significan cosas distintas.',
    pasos: [
      'TIN: tipo de interés nominal anual. Es el interés aplicado al préstamo, pero no incorpora todos los gastos.',
      'TAE: tasa anual equivalente. Incluye el efecto de intereses y determinados gastos para facilitar la comparación entre ofertas; usa la TAE oficial de la FEIN cuando esté disponible.',
      'LTV: porcentaje financiado sobre el valor de la vivienda o tasación, según el criterio aplicado por el banco. Cuanto mayor es, menor es tu entrada pero puede aumentar el riesgo o el tipo.',
      'Euríbor y diferencial: en una hipoteca variable, el tipo suele ser Euríbor más un margen fijo del banco. La cuota puede cambiar en cada revisión.',
      'FEIN: ficha europea de información normalizada. Resume las condiciones de la oferta y es el documento de referencia para revisarlas.',
      'Valor de referencia: valor fiscal que puede influir en la base de determinados impuestos de compra. No es lo mismo que precio de compraventa ni tasación.',
    ],
  },
  {
    id: 'limites',
    titulo: 'Alcance y privacidad',
    descripcion:
      'Úsala para planificar y comparar; la decisión y la aprobación final dependen de información que puede variar.',
    pasos: [
      'Los resultados cambian con tus datos, la tasación, la política de riesgo del banco, los tipos vigentes y la normativa aplicable.',
      'El tipo medio del INE es una referencia estadística, no un tipo garantizado ni una oferta que puedas contratar.',
      'Los datos se guardan localmente en este navegador. Si cambias de equipo o borras los datos del navegador, puedes perderlos.',
      'Exporta un archivo JSON antes de cambios importantes y guárdalo en un lugar seguro. No lo compartas: puede contener información financiera personal.',
    ],
  },
  {
    id: 'dudas',
    titulo: 'Dudas frecuentes',
    descripcion: 'Soluciones rápidas para los casos más habituales.',
    pasos: [
      '¿Veo importes a cero o no aparece una estimación? Revisa Tus datos: suelen faltar el precio objetivo, ingresos, ahorro o comunidad autónoma.',
      '¿La cuota parece baja pero el coste es alto? Compara el coste total, la TAE y las vinculaciones, además de la cuota inicial.',
      '¿Por qué una oferta no coincide con el banco? Comprueba capital, plazo, tipo, cuota de productos vinculados, comisión y tasación; una diferencia pequeña puede cambiar el resultado.',
      '¿Puedo probar alternativas? Sí. Modifica cualquier dato, guarda varias ofertas y usa la Escala de precios. Exporta antes si quieres conservar una versión concreta.',
      '¿Debo restablecer los datos? Solo si quieres empezar de nuevo. Primero exporta una copia; el restablecimiento elimina perfil, ofertas y simulaciones.',
    ],
  },
  {
    id: 'ajustes',
    titulo: 'Ajustes',
    descripcion: 'Permite adaptar las hipótesis de cálculo y gestionar una copia de tus datos.',
    pasos: [
      'En Gastos de compra, ajusta inmobiliaria, notaría, registro, gestoría, tasación y nota simple a tu caso.',
      'En Parámetros de hipoteca, usa la referencia INE para una estimación media o Manual para introducir tu propio TIN; revisa plazo y porcentaje financiado.',
      'En Ratios y plazos, define el límite bancario, tu objetivo personal y la edad máxima de vencimiento. Un objetivo personal más bajo suele dejar más margen mensual.',
      'En Rango de exploración configura los precios y el salto que verá la Escala de precios. En Fiscalidad por CCAA corrige los tipos si conoces los aplicables.',
      'En Datos y privacidad, exporta un JSON como copia, impórtalo en este navegador o restablece los datos. El restablecimiento conserva la configuración de cálculo.',
    ],
    nota: 'Actualizar ahora consulta el INE y no representa una oferta bancaria vigente.',
  },
];

function hrefDeRuta(ruta: string): string {
  return ruta === '/' ? '#/' : `#${ruta}`;
}

function desplazarA(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function Ayuda({ onNavegar }: { readonly onNavegar?: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-grande border border-acento/20 bg-acento-tenue/50 p-5">
        <p className="rotulo text-acento">Manual de uso</p>
        <h2 className="mt-1 font-display text-2xl text-tinta">Tu guía para comprar con criterio</h2>
        <p className="mt-2 text-sm leading-relaxed text-tinta-media">
          Sigue el orden recomendado o consulta directamente el apartado que necesitas. Todos los
          cambios se guardan automáticamente en este dispositivo.
        </p>
      </section>

      <nav
        aria-label="Índice del manual"
        className="rounded-medio border border-linea bg-superficie-2/40 p-3"
      >
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-tinta-suave">
          Índice
        </p>
        <div className="flex flex-wrap gap-1">
          {APARTADOS.map((apartado) => (
            <button
              key={apartado.id}
              type="button"
              onClick={() => desplazarA(`ayuda-${apartado.id}`)}
              className="rounded-chico px-2 py-1.5 text-xs text-acento hover:bg-acento/10 hover:underline"
            >
              {apartado.titulo}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex flex-col gap-4">
        {APARTADOS.map((apartado) => (
          <section
            key={apartado.id}
            id={`ayuda-${apartado.id}`}
            className="scroll-mt-5 rounded-grande border border-linea bg-superficie p-5"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-chico bg-acento-tenue text-acento">
                <Icono nombre="comprobado" tamano={15} />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-lg text-tinta">{apartado.titulo}</h3>
                <p className="mt-1 text-sm leading-relaxed text-tinta-media">
                  {apartado.descripcion}
                </p>
              </div>
            </div>
            <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-tinta-media marker:font-cifra marker:text-acento">
              {apartado.pasos.map((paso) => (
                <li key={paso}>{paso}</li>
              ))}
            </ol>
            {apartado.nota !== undefined && (
              <p className="mt-4 rounded-medio border border-linea bg-superficie-2 px-3 py-2 text-xs leading-relaxed text-tinta-media">
                <span className="font-semibold text-tinta">Importante: </span>
                {apartado.nota}
              </p>
            )}
            {apartado.ruta !== undefined && (
              <a
                href={hrefDeRuta(apartado.ruta)}
                onClick={onNavegar}
                className="mt-4 inline-flex min-h-toque items-center gap-2 rounded-medio border border-linea px-3 text-sm font-medium text-acento transition-colors hover:bg-acento-tenue"
              >
                Ir a {apartado.titulo}
                <span aria-hidden="true">→</span>
              </a>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
