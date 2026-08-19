// pdfjs-dist is dynamically imported inside extractPdfText below, the same way Recharts is
// lazy-loaded behind the /dashboard route — it's a large parsing engine most page loads never
// touch, so it shouldn't cost every route's initial bundle just because /ask exists.

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Real pages/characters caps, not just "send whatever the file contains" — a 400-page PDF would
 * blow past most models' context window and most local models' patience. Long enough for a real
 * spec or brief; a document past this is expected to be excerpted by the person attaching it. */
const MAX_PDF_PAGES = 30;
const MAX_TEXT_CHARS = 40_000;

export type ProcessedAttachment =
  | { kind: "text"; name: string; text: string }
  | { kind: "image"; name: string; dataUrl: string; mimeType: string };

let workerConfigured = false;

/** Extracts plain text from every page of a PDF, page order preserved — no OCR, so a scanned
 * (image-only) PDF with no embedded text layer comes back empty rather than failing outright;
 * the caller decides whether empty text is worth surfacing as an error. */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  if (!workerConfigured) {
    // Vite's documented pattern for bundling a worker file from a dependency — resolves to a
    // real, fingerprinted asset URL at build time, not a guess at a CDN path. Set once, on first
    // real use, not at module load — matches the dynamic import above.
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
    workerConfigured = true;
  }

  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  const doc = await loadingTask.promise;
  try {
    const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
    const pages: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pages.push(text.trim());
    }
    if (doc.numPages > MAX_PDF_PAGES) pages.push(`[${doc.numPages - MAX_PDF_PAGES} more page(s) not included]`);
    const full = pages.join("\n\n").trim();
    return full.length > MAX_TEXT_CHARS ? full.slice(0, MAX_TEXT_CHARS) + "\n\n[truncated]" : full;
  } finally {
    await loadingTask.destroy();
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file."));
    reader.readAsDataURL(file);
  });
}

/** The one entry point callers use — routes a dropped/picked file to PDF text extraction or
 * image encoding by its MIME type, or rejects anything else with a message naming what IS
 * supported rather than a bare "unsupported type". */
export async function processAttachment(file: File): Promise<ProcessedAttachment> {
  if (file.type === "application/pdf") {
    const text = await extractPdfText(file);
    return { kind: "text", name: file.name, text };
  }
  if (IMAGE_MIME_TYPES.has(file.type)) {
    const dataUrl = await fileToDataUrl(file);
    return { kind: "image", name: file.name, dataUrl, mimeType: file.type };
  }
  throw new Error(`Can't read "${file.name}" — attach a PDF or an image (PNG, JPEG, WebP, or GIF).`);
}
