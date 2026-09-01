/**
 * Saves text content as a local file download — the only "upload" a backup
 * ever does is to the user's own downloads folder (see docs/product-spec.md,
 * "PRIVACY" — Prompt 9.5C: "Your FDraft backup is created on this device.
 * It is not uploaded anywhere by FDraft."). Pure browser API plumbing
 * (Blob + object URL + a synthetic anchor click); no network request is
 * made anywhere in this function.
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "application/json",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
