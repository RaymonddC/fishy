// Loads the PDF library in the side panel, only when an invoice is first
// checked. Both the library and its worker ship inside the extension: an
// extension page may not run code from anywhere else.

import type { PdfLibrary } from './pdf.ts';

let loading: Promise<PdfLibrary> | undefined;

export function pdfLibrary(): Promise<PdfLibrary> {
  loading ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs as unknown as PdfLibrary;
  })();
  return loading;
}
