/**
 * OCR local con Tesseract/WebAssembly. Los modelos y el motor se sirven desde
 * `public/ocr`, por lo que la captura nunca abandona el dispositivo.
 */
export async function textoDeCapturaInmobiliaria(image: File): Promise<string | null> {
  const { createWorker, OEM } = await import('tesseract.js');
  const baseOcr = new URL('ocr/', window.location.href).toString();
  const worker = await createWorker('spa', OEM.LSTM_ONLY, {
    workerPath: new URL('worker.min.js', baseOcr).toString(),
    corePath: new URL('tesseract-core.wasm.js', baseOcr).toString(),
    langPath: new URL('lang', baseOcr).toString(),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'write',
  });
  try {
    const resultado = await worker.recognize(image);
    const texto = resultado.data.text.trim();
    return texto === '' ? null : texto;
  } finally {
    await worker.terminate();
  }
}
