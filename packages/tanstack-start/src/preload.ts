import type { EditableBoot } from "@superobjective/editable-core";

export type ModulePreloadDescriptor = {
  rel: "modulepreload";
  href: string;
  integrity?: string;
};

export function createModulePreloads(
  boot: EditableBoot,
  options: {
    runtimeHref?: string;
  } = {},
): ModulePreloadDescriptor[] {
  const preloads: ModulePreloadDescriptor[] = [];

  if (options.runtimeHref) {
    preloads.push({
      rel: "modulepreload",
      href: options.runtimeHref,
    });
  }

  if (boot.activeArtifact.url) {
    preloads.push({
      rel: "modulepreload",
      href: boot.activeArtifact.url,
      integrity: boot.activeArtifact.integrity,
    });
  }

  return preloads;
}

export function createModulePreloadLinks(
  boot: EditableBoot,
  options: {
    runtimeHref?: string;
  } = {},
): string {
  return createModulePreloads(boot, options)
    .map((preload) => {
      const integrity = preload.integrity
        ? ` integrity="${escapeAttribute(preload.integrity)}"`
        : "";

      return `<link rel="${preload.rel}" href="${escapeAttribute(
        preload.href,
      )}"${integrity} />`;
    })
    .join("");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
