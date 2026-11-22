// Reads the text and the file details of a PDF, on the laptop.
//
// The file is handed over as bytes and never leaves: nothing in here makes a
// request, and the PDF library is given the bytes directly so it has nothing
// to download. The library is passed in, so the same code runs in the side
// panel and in tests.

/** What the file says about itself. */
export interface PdfDetails {
  /** The program that wrote the file as it is now. */
  producer: string;
  /** The program the document was first made with. */
  creator: string;
  createdAt: number | null;
  modifiedAt: number | null;
}

export interface PdfContents extends PdfDetails {
  /** The text, one entry per line, top to bottom. */
  lines: string[];
  text: string;
  pages: number;
}

interface TextItem {
  str?: string;
  transform?: number[];
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<{ getTextContent(): Promise<{ items: TextItem[] }> }>;
  getMetadata(): Promise<{ info?: unknown }>;
}

/** The part of the PDF library this needs. */
export interface PdfLibrary {
  getDocument(source: Record<string, unknown>): { promise: Promise<PdfDocument>; destroy?(): unknown };
}

const MAX_BYTES = 20 * 1024 * 1024;
// An invoice's payment details are on its first pages. Reading more only costs time.
const MAX_PAGES = 5;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Reads a PDF date such as "D:20261118084700+07'00'". Null if it is not one. */
export function parsePdfDate(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz+-])(\d{2})?'?(\d{2})?'?)?/.exec(value.trim());
  if (!match) {
    return null;
  }
  const part = (index: number, fallback: number): number => (match[index] === undefined ? fallback : Number(match[index]));
  const local = Date.UTC(part(1, 0), part(2, 1) - 1, part(3, 1), part(4, 0), part(5, 0), part(6, 0));
  const sign = match[7] === '+' ? 1 : match[7] === '-' ? -1 : 0;
  return local - sign * (part(8, 0) * 60 + part(9, 0)) * 60_000;
}

/** Text items that sit on the same line, joined left to right; lines top to bottom. */
function toLines(items: readonly TextItem[]): string[] {
  const rows = new Map<number, { x: number; str: string }[]>();
  for (const item of items) {
    if (typeof item.str !== 'string' || item.str.trim() === '') {
      continue;
    }
    const y = Math.round(item.transform?.[5] ?? 0);
    const row = rows.get(y) ?? [];
    row.push({ x: item.transform?.[4] ?? 0, str: item.str });
    rows.set(y, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, row]) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((entry) => entry.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line !== '');
}

export async function readPdf(pdfjs: PdfLibrary, bytes: Uint8Array): Promise<PdfContents> {
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error('This file is too large to check. The limit is 20 MB.');
  }
  let task: ReturnType<PdfLibrary['getDocument']> | undefined;
  try {
    // A copy, because the library takes ownership of the bytes it is given.
    task = pdfjs.getDocument({
      data: bytes.slice(),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    });
    const document = await task.promise;
    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, MAX_PAGES); pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      lines.push(...toLines((await page.getTextContent()).items));
    }
    const { info } = await document.getMetadata();
    const details = (typeof info === 'object' && info !== null ? info : {}) as Record<string, unknown>;
    return {
      lines,
      text: lines.join('\n'),
      pages: document.numPages,
      producer: text(details.Producer),
      creator: text(details.Creator),
      createdAt: parsePdfDate(details.CreationDate),
      modifiedAt: parsePdfDate(details.ModDate),
    };
  } catch {
    throw new Error('This file could not be read as a PDF.');
  } finally {
    await task?.destroy?.();
  }
}
