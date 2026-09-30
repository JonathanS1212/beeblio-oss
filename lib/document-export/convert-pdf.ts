import { gotenbergRequest } from "@/lib/document-export/gotenberg-sandbox";
import { integerEnv } from "@/lib/env-config";

const GOTENBERG_TIMEOUT_MS = integerEnv("GOTENBERG_TIMEOUT_MS", 120_000, 1_000);

// Chromium renders header/footer templates in a bare context: page CSS does
// not apply and images must be inlined, so all styling is inline.
const FOOTER_HTML = [
  "<!doctype html>",
  "<html>",
  "<head><meta charset=\"utf-8\" /></head>",
  "<body>",
  '<div style="width: 100%; text-align: center; font-size: 8.5px; font-family: \'Liberation Sans\', Arial, sans-serif; color: #57606a;">',
  '<span class="pageNumber"></span> / <span class="totalPages"></span>',
  "</div>",
  "</body>",
  "</html>",
].join("\n");

export class PdfServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfServiceError";
  }
}

function unreachableError(kind: string, error: unknown): PdfServiceError {
  const cause = error instanceof Error ? error.message : String(error);
  return new PdfServiceError(
    `The ${kind} conversion service is unavailable. Gotenberg on Blaxel: ${cause.slice(0, 300)}`,
  );
}

/**
 * Prints a self-contained HTML document to a vector A4 PDF through Gotenberg
 * (Chromium) in its Blaxel sandbox. The page carries no scripts; fonts are
 * data URIs, so the only wait is for font decoding to finish.
 */
export async function convertHtmlToPdf(html: string): Promise<Uint8Array<ArrayBuffer>> {
  const form = new FormData();
  form.append(
    "files",
    new Blob([html], { type: "text/html" }),
    "index.html",
  );
  form.append(
    "files",
    new Blob([FOOTER_HTML], { type: "text/html" }),
    "footer.html",
  );
  form.set("paperWidth", "210mm");
  form.set("paperHeight", "297mm");
  form.set("marginTop", "20mm");
  form.set("marginBottom", "20mm");
  form.set("marginLeft", "18mm");
  form.set("marginRight", "18mm");
  form.set("printBackground", "true");
  form.set("preferCssPageSize", "false");
  form.set("emulatedMediaType", "print");
  form.set("waitForExpression", "document.fonts.status === 'loaded'");

  let response: Response;
  try {
    response = await gotenbergRequest("/forms/chromium/convert/html", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(GOTENBERG_TIMEOUT_MS),
    });
  } catch (error) {
    throw unreachableError("PDF", error);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 400);
    throw new PdfServiceError(detail || `PDF conversion failed with status ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Converts an Office document through Gotenberg's LibreOffice endpoint. */
export async function convertOfficeToPdf(
  content: Uint8Array,
  filename: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const form = new FormData();
  form.append(
    "files",
    new Blob([content as Uint8Array<ArrayBuffer>], { type: "application/octet-stream" }),
    filename,
  );
  let response: Response;
  try {
    response = await gotenbergRequest("/forms/libreoffice/convert", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(GOTENBERG_TIMEOUT_MS),
    });
  } catch (error) {
    throw unreachableError("Office", error);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 400);
    throw new PdfServiceError(detail || `Office conversion failed with status ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
