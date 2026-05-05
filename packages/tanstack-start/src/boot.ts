import type { EditableBoot } from "@superobjective/editable-core";

export const SO_BOOT_SCRIPT_ID = "__SO_BOOT__";

export function createInlineBootScript(boot: EditableBoot): string {
  return `<script id="${SO_BOOT_SCRIPT_ID}" type="application/json">${escapeJsonForHtml(
    boot,
  )}</script>`;
}

export function readInlineBoot(documentRef: Document = document): EditableBoot | undefined {
  const element = documentRef.getElementById(SO_BOOT_SCRIPT_ID);

  if (!element?.textContent) {
    return undefined;
  }

  return JSON.parse(element.textContent) as EditableBoot;
}

export function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
