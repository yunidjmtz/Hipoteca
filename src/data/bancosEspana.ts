export interface BancoEspana {
  readonly nombre: string;
  readonly iniciales: string;
  readonly color: string;
  readonly dominio: string;
  readonly aliases?: readonly string[];
}

type DatosBanco = readonly [
  nombre: string,
  iniciales: string,
  color: string,
  dominio: string,
  aliases?: readonly string[],
];

/** Marcas con actividad minorista o hipotecaria habitual en España. */
const DATOS_BANCOS: readonly DatosBanco[] = [
  ['Abanca', 'A', '#007f86', 'abanca.com', ['abanca corporación']],
  ['A&G Banco', 'A&G', '#1d3557', 'ag-banco.com'],
  ['Andbank', 'A', '#174a8b', 'andbank.es'],
  ['Arquia Banca', 'a', '#db1f2c', 'arquia.com'],
  ['Banco Caminos', 'BC', '#e3003c', 'bancocaminos.es'],
  ['Banco Cetelem', 'C', '#00a88e', 'cetelem.es'],
  ['Banco Mediolanum', 'M', '#002e6d', 'mediolanum.es'],
  ['Banco Pichincha', 'P', '#00549f', 'pichincha.es', ['pibank']],
  ['Banco Sabadell', 'S', '#0067b1', 'bancsabadell.com', ['sabadell']],
  ['Banco Santander', 'S', '#ec0000', 'santander.es', ['santander']],
  ['Bankinter', 'B', '#ef7d00', 'bankinter.com'],
  ['BBVA', 'BB', '#072146', 'bbva.es'],
  ['Banca March', 'BM', '#0c5b46', 'bancamarch.es'],
  ['Banca Pueyo', 'BP', '#007a33', 'bancapueyo.es'],
  ['BNP Paribas Personal Finance', 'BNP', '#008c5a', 'bnpparibas-pf.es', ['cetelem']],
  ['CaixaBank', 'C', '#0066b3', 'caixabank.es', ['imagin']],
  ['Caja de Ingenieros', 'CI', '#007a68', 'caixaenginyers.com'],
  ['Caja Rural Central', 'CR', '#00853f', 'ruralcentral.es'],
  ['Caja Rural de Granada', 'CR', '#00853f', 'cajaruralgranada.com'],
  ['Caja Rural de Navarra', 'CR', '#00853f', 'ruralvia.com'],
  ['Caja Rural del Sur', 'CR', '#00853f', 'cajaruraldelsur.com'],
  ['Cajamar', 'C', '#008f4c', 'cajamar.es', ['banco de crédito social cooperativo']],
  ['Cajasur', 'CS', '#005ca9', 'cajasur.es'],
  ['Colonya Caixa Pollença', 'C', '#007f5f', 'colonya.es'],
  ['Deutsche Bank', 'DB', '#0067a0', 'db.com'],
  ['EBN Banco', 'EBN', '#1c365d', 'ebnbanco.com'],
  ['EVO Banco', 'E', '#00a6a6', 'evobanco.com'],
  ['Eurocaja Rural', 'ER', '#00843d', 'eurocajarural.es'],
  ['Ibercaja', 'I', '#e83529', 'ibercaja.es'],
  ['ING', 'ING', '#ff6200', 'ing.es'],
  ['Kutxabank', 'K', '#1f9c9a', 'kutxabank.es'],
  ['Laboral Kutxa', 'LK', '#ef7d00', 'laboralkutxa.com'],
  ['MyInvestor', 'M', '#121f3d', 'myinvestor.es'],
  ['N26', 'N', '#3b8c87', 'n26.com'],
  ['Openbank', 'O', '#ec0000', 'openbank.es'],
  ['Renta 4 Banco', 'R4', '#004f9e', 'r4.com'],
  ['Revolut', 'R', '#191c1f', 'revolut.com'],
  ['Unicaja', 'U', '#008a83', 'unicajabanco.es'],
  ['Unión de Créditos Inmobiliarios', 'UCI', '#007a87', 'uci.es'],
  ['Wizink', 'W', '#00a2e0', 'wizink.es'],
];

export const BANCOS_ESPANA: readonly BancoEspana[] = DATOS_BANCOS.map(
  ([nombre, iniciales, color, dominio, aliases]) =>
    aliases === undefined
      ? { nombre, iniciales, color, dominio }
      : { nombre, iniciales, color, dominio, aliases },
);
