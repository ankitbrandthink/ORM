import { api } from "@/lib/api";

/** Download HTML as a real PDF via the backend WeasyPrint endpoint.
 *  Falls back to opening a new window for manual print if the endpoint fails.
 */
export async function downloadAsPdf(html: string, filename: string): Promise<void> {
  const safe = filename.replace(/[^\w\s\-\.]/g, "").replace(/\s+/g, "_");
  const fname = safe.endsWith(".pdf") ? safe : safe + ".pdf";
  try {
    const resp = await api.post(
      "/analytics/html-to-pdf",
      { html, filename: fname },
      { responseType: "arraybuffer" },
    );
    const blob = new Blob([resp.data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {
    previewInWindow(html);
  }
}

/** Open HTML in a new browser window for preview. */
export function previewInWindow(html: string, dims = "width=1200,height=850,scrollbars=yes"): void {
  const w = window.open("", "_blank", dims);
  if (!w) {
    alert("Allow pop-ups to preview the report.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
}
