/**
 * Server-side PDF inspection with pdf.js: page count, encryption, and the text
 * layer (what a reader of the PDF's hidden text would see), for the upload gate.
 */

export interface PdfFacts {
  pages: number;
  /** Visible + hidden text, page by page (1-based index = array index + 1). */
  text: string[];
  /** Characters drawn smaller than ~1.5 pt: invisible to a person, readable to a model. */
  tinyChars: number;
  encrypted: boolean;
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjs: Promise<PdfJs> | null = null;

async function load(): Promise<PdfJs> {
  if (!pdfjs) {
    pdfjs = (async () => {
      // On a server pdf.js runs a "fake worker" by import()ing a path computed at run time, which
      // Vercel's file trace never ships. Importing the worker by name puts it in the trace, and
      // pdf.js uses globalThis.pdfjsWorker instead of importing the file.
      const g = globalThis as { pdfjsWorker?: unknown };
      g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      return import("pdfjs-dist/legacy/build/pdf.mjs");
    })();
  }
  return pdfjs;
}

export async function inspectPdf(data: Uint8Array, maxPages: number): Promise<PdfFacts> {
  const lib = await load();
  const task = lib.getDocument({
    data: new Uint8Array(data), // pdf.js detaches the buffer it is given
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy().catch(() => {});
    const name = (e as { name?: string })?.name ?? "";
    if (name === "PasswordException") return { pages: 0, text: [], tinyChars: 0, encrypted: true };
    throw e;
  }
  try {
    const pages = doc.numPages;
    const text: string[] = [];
    let tinyChars = 0;
    const n = Math.min(pages, maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let s = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        s += item.str + (item.hasEOL ? "\n" : " ");
        const [a, b, c, d] = item.transform as number[];
        const size = Math.max(Math.hypot(a, b), Math.hypot(c, d));
        if (size > 0 && size < 1.5) tinyChars += item.str.length;
      }
      text.push(s);
      page.cleanup();
    }
    return { pages, text, tinyChars, encrypted: false };
  } finally {
    await task.destroy();
  }
}
