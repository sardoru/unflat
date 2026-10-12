"use client";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let lib: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  if (!lib) {
    lib = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return lib;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", quality));
}

export interface PdfHandle {
  pages: number;
  /** Render page n (1-based) to a JPEG no wider than `width`. */
  render(n: number, width: number, quality?: number): Promise<Blob>;
  close(): void;
}

export async function openPdf(file: File): Promise<PdfHandle> {
  const m = await pdfjs();
  const task = m.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  return {
    pages: doc.numPages,
    async render(n, width, quality = 0.72) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();
      return canvasToJpeg(canvas, quality);
    },
    close() {
      task.destroy().catch(() => {});
    },
  };
}

/** Re-encode a photo as a JPEG no larger than `maxSide` (also drops EXIF and location data). */
export async function downscale(file: Blob, maxSide: number, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvasToJpeg(canvas, quality);
}
