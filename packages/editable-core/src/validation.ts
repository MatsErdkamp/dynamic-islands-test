import type {
  EditableArtifactDraft,
  EditableArtifactValidationIssue,
  EditableArtifactValidationResult,
} from "./types.js";

export type EditableArtifactValidationOptions = {
  allowedImports?: string[];
  maxBytes?: number;
  requireRuntimeImports?: boolean;
  allowDirectFetch?: boolean;
  allowBrowserStorage?: boolean;
};

const DEFAULT_ALLOWED_IMPORTS = [
  "react",
  "react/jsx-runtime",
  "@superobjective/tanstack-start",
];

const DEFAULT_MAX_BYTES = 128 * 1024;

export function validateEditableArtifact(
  draft: EditableArtifactDraft | string,
  options: EditableArtifactValidationOptions = {},
): EditableArtifactValidationResult {
  const sourceTsx = typeof draft === "string" ? draft : sourceForValidation(draft);
  const allowedImports = options.allowedImports ?? DEFAULT_ALLOWED_IMPORTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const byteLength = new TextEncoder().encode(sourceTsx).byteLength;
  const imports = collectImports(sourceTsx);
  const issues: EditableArtifactValidationIssue[] = [];

  if (byteLength > maxBytes) {
    issues.push({
      code: "bundle_size",
      message: `Generated artifact is ${byteLength} bytes, above the ${maxBytes} byte limit.`,
      detail: { byteLength, maxBytes },
    });
  }

  for (const importPath of imports) {
    if (
      !importPath.startsWith(".") &&
      !allowedImports.some((allowed) => importPath === allowed)
    ) {
      issues.push({
        code: "disallowed_import",
        message: `Import "${importPath}" is not allowed in generated editable artifacts.`,
        detail: { importPath },
      });
    }
  }

  if (/\beval\s*\(/.test(sourceTsx) || /\bnew\s+Function\s*\(/.test(sourceTsx)) {
    issues.push({
      code: "eval",
      message: "Generated artifacts may not use eval or new Function.",
    });
  }

  if (!options.allowDirectFetch && /(^|[^\w.])fetch\s*\(/m.test(sourceTsx)) {
    issues.push({
      code: "direct_fetch",
      message:
        "Generated artifacts may not call fetch directly; expose data through editable tools.",
    });
  }

  if (
    !options.allowBrowserStorage &&
    /\b(localStorage|sessionStorage|document\.cookie)\b/.test(sourceTsx)
  ) {
    issues.push({
      code: "browser_storage",
      message:
        "Generated artifacts may not access browser storage or cookies directly.",
    });
  }

  if (/<\s*script\b/i.test(sourceTsx)) {
    issues.push({
      code: "raw_script",
      message: "Generated artifacts may not inject raw script tags.",
    });
  }

  if (/\b(process\.env|import\.meta\.env|ctx\.env)\b/.test(sourceTsx)) {
    issues.push({
      code: "env_access",
      message:
        "Generated artifacts may not access environment bindings or secrets directly.",
    });
  }

  const renderMutationLine = findRenderMutationLine(sourceTsx);

  if (renderMutationLine) {
    issues.push({
      code: "render_mutation",
      message:
        "Generated artifacts may not call mutation tools during render; call them from event handlers or effects.",
      line: renderMutationLine,
    });
  }

  if (
    options.requireRuntimeImports &&
    usesEditableRuntime(sourceTsx) &&
    !imports.includes("@superobjective/tanstack-start")
  ) {
    issues.push({
      code: "missing_runtime_import",
      message:
        "Generated artifacts using editable hooks must import them from @superobjective/tanstack-start.",
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    imports,
    byteLength,
  };
}

function sourceForValidation(draft: EditableArtifactDraft): string {
  if (!draft.files) {
    return draft.sourceTsx;
  }

  return Object.entries(draft.files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, source]) => `// ${path}\n${source}`)
    .join("\n\n");
}

export function collectImports(source: string): string[] {
  const imports = new Set<string>();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^"'`]+?\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source))) {
      const importPath = match[1];

      if (importPath) {
        imports.add(importPath);
      }
    }
  }

  return [...imports].sort();
}

function findRenderMutationLine(source: string): number | undefined {
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!/\.call\s*\(/.test(line)) {
      continue;
    }

    const nearbyContext = lines
      .slice(Math.max(0, index - 30), index + 1)
      .join("\n");

    if (/\bon[A-Z][A-Za-z]*\s*=|\buseEffect\s*\(|\buseTransition\s*\(/.test(nearbyContext)) {
      continue;
    }

    return index + 1;
  }

  return undefined;
}

function usesEditableRuntime(source: string): boolean {
  return /\b(useEditableFunction|useEditableView|useEditableToolManifest)\b/.test(
    source,
  );
}
