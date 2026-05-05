import type { EditableIsland } from "@superobjective/editable-core";

export type SuperobjectiveVitePluginOptions = {
  islands: EditableIsland[];
  srcDirectory?: string;
  routesDirectory?: string;
  generatedOutDir?: string;
  generateSoRoute?: boolean;
  outFile?: string;
  alchemyOutFile?: string;
  workerEntrypoint?: string;
  orchestratorClassName?: string;
  orchestratorBinding?: string;
  loaderBinding?: string;
  aiBinding?: string;
  aiGatewayId?: string;
  editModel?: string;
  userCookie?: string;
  loginPath?: string;
};

export type SuperobjectiveManifest = {
  version: 1;
  workerEntrypoint?: string;
  orchestrator: {
    className: string;
    binding: string;
  };
  dynamicWorkerLoader: {
    binding: string;
  };
  ai: {
    binding: string;
    gatewayId: string;
    editModel: string;
  };
  islands: Array<{
    id: string;
    title?: string;
    rendering: EditableIsland["rendering"];
    cache: EditableIsland["cache"];
    tools: EditableIsland["manifest"]["tools"];
  }>;
};

export function superobjective(
  options: SuperobjectiveVitePluginOptions,
): {
  name: string;
  enforce: "pre";
  config(): {
    optimizeDeps: { exclude: string[] };
    ssr: { noExternal: string[] };
  };
  configResolved(config: { root: string }): Promise<void>;
  transform(code: string, id: string): string | undefined;
  buildStart(): Promise<void>;
} {
  let root = ".";
  const srcDirectory = options.srcDirectory ?? "app";
  const routesDirectory = options.routesDirectory ?? `${srcDirectory}/routes`;
  const generatedOutDir = options.generatedOutDir ?? ".superobjective";
  const outFile = options.outFile ?? ".superobjective/manifest.json";
  const alchemyOutFile =
    options.alchemyOutFile ?? ".superobjective/alchemy.generated.ts";

  return {
    name: "superobjective",
    enforce: "pre",
    config() {
      return {
        optimizeDeps: {
          exclude: ["@cloudflare/worker-bundler"],
        },
        ssr: {
          noExternal: [
            "@superobjective/cloudflare",
            "@cloudflare/worker-bundler",
            "es-module-lexer",
            "esbuild-wasm",
            "resolve.exports",
            "semver",
            "smol-toml",
            "sucrase",
          ],
        },
      };
    },
    async configResolved(config) {
      root = config.root;
      await writeGeneratedFiles({
        root,
        srcDirectory,
        routesDirectory,
        generatedOutDir,
        outFile,
        alchemyOutFile,
        options,
      });
    },
    transform(code, id) {
      if (isServerEntry(id, root, srcDirectory)) {
        return injectServerExports(code, {
          id,
          root,
          generatedOutDir,
          orchestratorClassName:
            options.orchestratorClassName ?? "SuperobjectiveOrchestrator",
        });
      }

      if (!/\.[cm]?[jt]sx?$/.test(id) || !code.includes("createEditableIsland")) {
        return undefined;
      }

      return injectDefaultSourceTsx(code);
    },
    async buildStart() {
      await writeGeneratedFiles({
        root,
        srcDirectory,
        routesDirectory,
        generatedOutDir,
        outFile,
        alchemyOutFile,
        options,
      });
    },
  };
}

async function writeGeneratedFiles(input: {
  root: string;
  srcDirectory: string;
  routesDirectory: string;
  generatedOutDir: string;
  outFile: string;
  alchemyOutFile: string;
  options: SuperobjectiveVitePluginOptions;
}) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, resolve } = await import("node:path");
  const manifest = createSuperobjectiveManifest(input.options);
  const manifestPath = resolve(input.root, input.outFile);
  const alchemyPath = resolve(input.root, input.alchemyOutFile);
  const generatedDir = resolve(input.root, input.generatedOutDir);
  const generatedServerPath = resolve(generatedDir, "superobjective.server.ts");
  const routePath = resolve(input.root, input.routesDirectory, "_so.$.ts");
  const islandExports = await discoverIslandExports(input.root, input.srcDirectory);

  await mkdir(dirname(manifestPath), { recursive: true });
  await mkdir(dirname(alchemyPath), { recursive: true });
  await mkdir(dirname(generatedServerPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(alchemyPath, createAlchemyGeneratedModule(manifest));
  await writeFile(
    generatedServerPath,
    createGeneratedServerModule({
      manifest,
      islandExports,
      root: input.root,
      generatedServerPath,
      userCookie: input.options.userCookie ?? "so_user",
    }),
  );

  if (input.options.generateSoRoute !== false) {
    await mkdir(dirname(routePath), { recursive: true });
    await writeFile(
      routePath,
      createGeneratedSoRoute({
        routePath,
        generatedServerPath,
      }),
    );
  }
}

export function createSuperobjectiveManifest(
  options: SuperobjectiveVitePluginOptions,
): SuperobjectiveManifest {
  return {
    version: 1,
    workerEntrypoint: options.workerEntrypoint,
    orchestrator: {
      className: options.orchestratorClassName ?? "SuperobjectiveOrchestrator",
      binding: options.orchestratorBinding ?? "SO_ORCHESTRATOR",
    },
    dynamicWorkerLoader: {
      binding: options.loaderBinding ?? "SO_LOADER",
    },
    ai: {
      binding: options.aiBinding ?? "AI",
      gatewayId: options.aiGatewayId ?? "default",
      editModel: options.editModel ?? "@cf/qwen/qwen2.5-coder-32b-instruct",
    },
    islands: options.islands.map((island) => ({
      id: island.id,
      title: island.title,
      rendering: island.rendering,
      cache: island.cache,
      tools: island.manifest.tools,
    })),
  };
}

function createAlchemyGeneratedModule(manifest: SuperobjectiveManifest): string {
  return `// Generated by superobjective() Vite plugin.
export const superobjectiveManifest = ${JSON.stringify(manifest, null, 2)} as const;
`;
}

type IslandExport = {
  name: string;
  path: string;
};

async function discoverIslandExports(
  root: string,
  srcDirectory: string,
): Promise<IslandExport[]> {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const srcRoot = resolve(root, srcDirectory);
  const files: string[] = [];

  async function walk(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const path = resolve(dir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            await walk(path);
          }
          continue;
        }

        if (/\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.endsWith(".gen.ts")) {
          files.push(path);
        }
      }
    } catch {
      return;
    }
  }

  if (!(await stat(srcRoot).catch(() => undefined))?.isDirectory()) {
    return [];
  }

  await walk(srcRoot);

  const exports: IslandExport[] = [];

  for (const path of files) {
    const source = await readFile(path, "utf8");

    if (!source.includes("createEditableIsland")) {
      continue;
    }

    for (const match of source.matchAll(
      /\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*createEditableIsland\s*\(/g,
    )) {
      const name = match[1];

      if (name) {
        exports.push({ name, path });
      }
    }
  }

  return exports;
}

function isServerEntry(id: string, root: string, srcDirectory: string): boolean {
  const normalizedId = id.replace(/\\/g, "/");
  const normalizedRoot = root.replace(/\\/g, "/");

  return (
    normalizedId === `${normalizedRoot}/${srcDirectory}/server.ts` ||
    normalizedId === `${normalizedRoot}/${srcDirectory}/server.tsx`
  );
}

function injectServerExports(
  code: string,
  input: {
    id: string;
    root: string;
    generatedOutDir: string;
    orchestratorClassName: string;
  },
): string | undefined {
  if (code.includes(input.orchestratorClassName)) {
    return undefined;
  }

  const generatedServerPath = `${input.root.replace(/\\/g, "/")}/${input.generatedOutDir}/superobjective.server.ts`;
  const importPath = relativeImportPath(input.id, generatedServerPath);

  return `${code}
export { ${input.orchestratorClassName} } from ${JSON.stringify(importPath)};
`;
}

function createGeneratedSoRoute(input: {
  routePath: string;
  generatedServerPath: string;
}): string {
  const importPath = relativeImportPath(input.routePath, input.generatedServerPath);

  return `// Generated by superobjective() Vite plugin. Do not edit.
// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { handleSuperobjectiveRequest } from ${JSON.stringify(importPath)};

export const Route = createFileRoute("/_so/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleSuperobjectiveRequest(request),
      POST: ({ request }) => handleSuperobjectiveRequest(request),
    },
  },
});
`;
}

function createGeneratedServerModule(input: {
  manifest: SuperobjectiveManifest;
  islandExports: IslandExport[];
  root: string;
  generatedServerPath: string;
  userCookie: string;
}): string {
  const imports = input.islandExports
    .map((item) => {
      const importPath = relativeImportPath(input.generatedServerPath, item.path);

      return `import { ${item.name} } from ${JSON.stringify(importPath)};`;
    })
    .join("\n");
  const islandNames = input.islandExports.map((item) => item.name).join(", ");
  const routePaths = Object.fromEntries(
    input.manifest.islands.map((island) => [island.id, `/${island.id}`]),
  );

  return `// Generated by superobjective() Vite plugin. Do not edit.
// @ts-nocheck
import {
  createCloudflareEditableAdapter,
} from "@superobjective/tanstack-start/cloudflare";
import {
  createOrchestratorDurableObject,
} from "@superobjective/cloudflare";
${imports}

export const superobjectiveIslands = [${islandNames}];
export const superobjectiveRoutePaths = ${JSON.stringify(routePaths, null, 2)};

export class ${input.manifest.orchestrator.className} extends createOrchestratorDurableObject({
  islands: superobjectiveIslands,
  deriveActor: ({ request }) => getSuperobjectiveUserFromRequest(request),
  createExecutionContext: ({ env }) => ({ env }),
}) {}

export const editableAdapter = createCloudflareEditableAdapter({
  actorId: (request) => getSuperobjectiveUserFromRequest(request).id,
  pageId: async (request) => resolveSuperobjectivePageId(request),
});

export async function handleSuperobjectiveRequest(request) {
  const { env } = await import("cloudflare:workers");
  const islandId = await resolveSuperobjectiveIslandId(request);
  const response = await editableAdapter.handleSoRequest({
    request,
    env,
    islandId,
  });

  return response ?? new Response("Not found", { status: 404 });
}

async function resolveSuperobjectivePageId(request) {
  const islandId = await resolveSuperobjectiveIslandId(request);

  return (islandId && superobjectiveRoutePaths[islandId]) || "/";
}

async function resolveSuperobjectiveIslandId(request) {
  const url = new URL(request.url);
  const artifactMatch = url.pathname.match(/^\\/_so\\/artifacts\\/([^/]+)\\//);

  if (artifactMatch?.[1]) {
    return artifactMatch[1];
  }

  if (request.method !== "GET") {
    try {
      const body = await request.clone().json();

      if (typeof body?.islandId === "string") {
        return body.islandId;
      }
    } catch {}
  }

  return superobjectiveIslands[0]?.id;
}

function getSuperobjectiveUserFromRequest(request) {
  const username =
    parseCookie(request.headers.get("Cookie") ?? "")[${JSON.stringify(input.userCookie)}] ??
    request.headers.get("x-so-actor") ??
    "anonymous";
  const name = sanitizeUsername(username);

  return {
    id: name.toLowerCase(),
    name,
  };
}

function parseCookie(header) {
  const cookies = {};

  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    const key = rawKey?.trim();

    if (key) {
      cookies[key] = decodeURIComponent(rawValue.join("="));
    }
  }

  return cookies;
}

function sanitizeUsername(value) {
  const clean = String(value)
    .trim()
    .replace(/[^A-Za-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);

  return clean || "anonymous";
}
`;
}

function relativeImportPath(fromFile: string, toFile: string): string {
  const withoutExtension = relativePath(dirnamePath(fromFile), toFile).replace(
    /\.[cm]?[jt]sx?$/,
    "",
  );
  const normalized = withoutExtension.replace(/\\/g, "/");

  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function dirnamePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");

  return index === -1 ? "." : normalized.slice(0, index);
}

function relativePath(fromDir: string, toFile: string): string {
  const fromParts = fromDir.replace(/\\/g, "/").split("/").filter(Boolean);
  const toParts = toFile.replace(/\\/g, "/").split("/").filter(Boolean);

  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }

  return [...fromParts.map(() => ".."), ...toParts].join("/") || ".";
}

function injectDefaultSourceTsx(code: string): string | undefined {
  let output = code;
  let changed = false;
  const islandCalls = [...code.matchAll(/createEditableIsland\s*\(\s*\{/g)].reverse();

  for (const match of islandCalls) {
    if (match.index === undefined) {
      continue;
    }

    const objectStart = match.index + match[0].lastIndexOf("{");
    const objectEnd = findMatchingBrace(code, objectStart);

    if (objectEnd === -1) {
      continue;
    }

    const objectSource = code.slice(objectStart, objectEnd + 1);

    if (/\bdefaultSourceTsx\s*:/.test(objectSource)) {
      continue;
    }

    const islandId = objectSource.match(/\bid\s*:\s*["']([^"']+)["']/)?.[1];
    const defaultName = objectSource.match(/\bdefault\s*:\s*([A-Za-z_$][\w$]*)/)?.[1];

    if (!islandId || !defaultName) {
      continue;
    }

    const source = createDefaultSourceSeed({
      code,
      componentName: defaultName,
      islandId,
    });

    if (!source) {
      continue;
    }

    const defaultMatch = objectSource.match(/\bdefault\s*:\s*[A-Za-z_$][\w$]*\s*,?/);

    if (defaultMatch?.index === undefined) {
      continue;
    }

    const insertionPoint =
      objectStart + defaultMatch.index + defaultMatch[0].length;
    const needsComma = defaultMatch[0].trimEnd().endsWith(",") ? "" : ",";
    const insertion = `${needsComma}\n  defaultSourceTsx: ${JSON.stringify(source)},`;

    output = `${output.slice(0, insertionPoint)}${insertion}${output.slice(insertionPoint)}`;
    changed = true;
  }

  return changed ? output : undefined;
}

function createDefaultSourceSeed(input: {
  code: string;
  componentName: string;
  islandId: string;
}): string | undefined {
  const componentSource = extractFunctionDeclaration(
    input.code,
    input.componentName,
  );

  if (!componentSource) {
    return undefined;
  }

  const helperSources = collectReferencedLocalComponents(input.code, componentSource)
    .map((name) => extractFunctionDeclaration(input.code, name))
    .filter((source): source is string => Boolean(source));
  const generatedName = `Generated${toIdentifier(input.islandId)}Island`;
  const rewrittenComponent = rewriteComponentForArtifact(
    componentSource,
    input.componentName,
    generatedName,
  );

  return [
    'import React from "react";',
    'import { useEditableFunction, useEditableView } from "@superobjective/tanstack-start";',
    "",
    rewrittenComponent,
    ...helperSources.flatMap((source) => ["", source]),
    "",
  ].join("\n");
}

function rewriteComponentForArtifact(
  source: string,
  componentName: string,
  generatedName: string,
): string {
  return source
    .replace(
      new RegExp(`export\\s+function\\s+${componentName}\\s*\\(`),
      `export default function ${generatedName}(`,
    )
    .replace(
      new RegExp(`function\\s+${componentName}\\s*\\(`),
      `export default function ${generatedName}(`,
    )
    .replace(/\buseEditableFunction\(\s*([A-Za-z_$][\w$]*)\s*\)/g, (_match, name) =>
      `useEditableFunction(${JSON.stringify(name)})`,
    );
}

function collectReferencedLocalComponents(code: string, source: string): string[] {
  const names = new Set<string>();

  for (const match of source.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)) {
    const name = match[1];

    if (name && extractFunctionDeclaration(code, name)) {
      names.add(name);
    }
  }

  return [...names].sort();
}

function extractFunctionDeclaration(
  code: string,
  name: string,
): string | undefined {
  const pattern = new RegExp(
    `(?:export\\s+)?function\\s+${escapeRegExp(name)}\\s*\\(`,
    "g",
  );
  const match = pattern.exec(code);

  if (!match) {
    return undefined;
  }

  const paramsStart = code.indexOf("(", match.index);

  if (paramsStart === -1) {
    return undefined;
  }

  const paramsEnd = findMatchingParen(code, paramsStart);

  if (paramsEnd === -1) {
    return undefined;
  }

  const bodyStart = code.indexOf("{", paramsEnd);

  if (bodyStart === -1) {
    return undefined;
  }

  const bodyEnd = findMatchingBrace(code, bodyStart);

  if (bodyEnd === -1) {
    return undefined;
  }

  return code.slice(match.index, bodyEnd + 1).trim();
}

function findMatchingBrace(code: string, openIndex: number): number {
  return findMatchingDelimiter(code, openIndex, "{", "}");
}

function findMatchingParen(code: string, openIndex: number): number {
  return findMatchingDelimiter(code, openIndex, "(", ")");
}

function findMatchingDelimiter(
  code: string,
  openIndex: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  let quote: '"' | "'" | "`" | undefined;
  let escaped = false;

  for (let index = openIndex; index < code.length; index += 1) {
    const char = code[index];
    const previous = code[index - 1];
    const next = code[index + 1];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }

      continue;
    }

    if (char === "/" && next === "/") {
      index = code.indexOf("\n", index);
      if (index === -1) break;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = code.indexOf("*/", index + 2);
      if (end === -1) break;
      index = end + 1;
      continue;
    }

    if ((char === '"' || char === "'" || char === "`") && previous !== "\\") {
      quote = char;
      continue;
    }

    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function toIdentifier(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_$]/g, " ");
  const pascal = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");

  return pascal || "Editable";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
