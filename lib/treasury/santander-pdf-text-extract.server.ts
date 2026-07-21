import "server-only";

// Debe importarse ANTES que "pdf-parse": ver el comentario en ese archivo.
// pdfjs-dist evalúa `new DOMMatrix()` a nivel de módulo; sin este polyfill,
// en un runtime donde @napi-rs/canvas no resuelve (Vercel serverless), esa
// línea lanza ReferenceError y rompe la importación completa del PDF.
import "@/lib/treasury/pdf-node-dom-polyfills.server";
import { PDFParse } from "pdf-parse";

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}
