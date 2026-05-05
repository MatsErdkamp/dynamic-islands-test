import {
  createArtifactId,
  createArtifactIntegrity,
  validateEditableArtifact,
  type CompiledEditableArtifact,
  type EditableArtifactDraft,
} from "@superobjective/editable-core";
import type { WorkerLoader } from "./bindings.js";

export type CompileEditableArtifactInput = {
  loader?: WorkerLoader;
  artifactId?: string;
  draft: EditableArtifactDraft;
  maxBytes?: number;
};

export async function compileEditableArtifact({
  loader,
  artifactId,
  draft,
  maxBytes,
}: CompileEditableArtifactInput): Promise<CompiledEditableArtifact> {
  const id = artifactId ?? createArtifactId(draft);

  if (isCloudflareWorkersRuntime()) {
    try {
      return await compileWithWorkerBundler({ artifactId: id, draft, maxBytes });
    } catch (error) {
      if (isValidationError(error)) {
        throw error;
      }
    }
  }

  try {
    return await compileLocally({ artifactId: id, draft, maxBytes });
  } catch (error) {
    if (!loader || isValidationError(error)) {
      throw error;
    }
  }

  if (loader) {
    const worker = await loader.get(`compile:${id}`, async () => ({
      compatibilityDate: "2026-05-04",
      mainModule: "compiler.js",
      modules: {
        "compiler.js": COMPILER_WORKER_SOURCE,
      },
      globalOutbound: null,
    }));
    const entrypoint =
      "getEntrypoint" in worker ? worker.getEntrypoint() : worker;
    const response = await entrypoint.fetch("https://compiler.local/compile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ artifactId: id, draft, maxBytes }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as CompiledEditableArtifact;
  }

  return compileLocally({ artifactId: id, draft, maxBytes });
}

async function compileWithWorkerBundler(input: {
  artifactId: string;
  draft: EditableArtifactDraft;
  maxBytes?: number;
}): Promise<CompiledEditableArtifact> {
  const validation = validateEditableArtifact(input.draft, {
    maxBytes: input.maxBytes,
    requireRuntimeImports: true,
  });

  if (!validation.ok) {
    throw new Error(
      `Generated artifact validation failed: ${validation.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  const { createWorker } = (await import(
    "@cloudflare/worker-bundler"
  )) as typeof import("@cloudflare/worker-bundler");
  const workspace = createWorkerBundlerWorkspace(input.draft);
  const result = await createWorker({
    files: workspace.files,
    entryPoint: workspace.entrypoint,
    bundle: true,
    target: "es2022",
    minify: true,
    sourcemap: false,
    jsx: "transform",
    conditions: ["browser", "worker", "workerd"],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  });
  const compiledClientJs = moduleToJs(
    result.modules[result.mainModule],
    result.mainModule,
  );

  return {
    id: input.artifactId,
    islandId: input.draft.islandId,
    kind: input.draft.kind ?? "generated-client",
    sourceTsx: input.draft.sourceTsx,
    compiledClientJs,
    integrity: createArtifactIntegrity({
      sourceTsx: input.draft.sourceTsx,
      compiledClientJs,
      kind: input.draft.kind ?? "generated-client",
    }),
    status: "active",
    createdAt: new Date().toISOString(),
    validation,
  };
}

export async function runCodeModeInDynamicWorker(input: {
  loader?: WorkerLoader;
  artifactId?: string;
  draft: EditableArtifactDraft;
}): Promise<CompiledEditableArtifact> {
  return compileEditableArtifact(input);
}

export const COMPILER_WORKER_SOURCE = `
export default {
  async fetch(request) {
    if (new URL(request.url).pathname !== "/compile") {
      return new Response("Not found", { status: 404 });
    }

    const { artifactId, draft, maxBytes } = await request.json();
    const source = draft.files?.[draft.entrypoint ?? "src/GeneratedIsland.tsx"] ?? draft.sourceTsx;
    const issues = [];
    const imports = [...source.matchAll(/\\bimport\\s+(?:type\\s+)?(?:[^"'\\\`]+?\\s+from\\s+)?["']([^"']+)["']/g)].map((match) => match[1]);
    const allowed = new Set(["react", "react/jsx-runtime", "@superobjective/tanstack-start"]);
    const byteLength = new TextEncoder().encode(source).byteLength;

    for (const item of imports) {
      if (!allowed.has(item)) {
        issues.push({ code: "disallowed_import", message: "Disallowed import: " + item });
      }
    }

    if (/\\beval\\s*\\(/.test(source) || /\\bnew\\s+Function\\s*\\(/.test(source)) {
      issues.push({ code: "eval", message: "Generated artifacts may not use eval or new Function." });
    }

    if (/(^|[^\\w.])fetch\\s*\\(/m.test(source)) {
      issues.push({ code: "direct_fetch", message: "Generated artifacts may not call fetch directly." });
    }

    if (byteLength > (maxBytes ?? 131072)) {
      issues.push({ code: "bundle_size", message: "Generated artifact exceeds size limit." });
    }

    if (issues.length) {
      return Response.json({ ok: false, issues }, { status: 400 });
    }

    const compiledClientJs = compileClientModule(source);
    const integrity = "dyn-" + artifactId;

    return Response.json({
      id: artifactId,
      islandId: draft.islandId,
      kind: draft.kind ?? "generated-client",
      sourceTsx: source,
      compiledClientJs,
      integrity,
      status: "active",
      createdAt: new Date().toISOString(),
      validation: { ok: true, issues: [], imports, byteLength },
    });
  }
};

function compileClientModule(source) {
  let code = source.replace(/^\\s*import\\s+(?:\\*\\s+as\\s+)?React(?:\\s*,\\s*\\{[^}]*\\})?\\s+from\\s+["']react["'];?\\s*$/gm, "");
  code = code.replace(/^\\s*import\\s+React\\s+from\\s+["']react["'];?\\s*/gm, "");
  code = rewriteRuntimeImports(code);
  code = code.replace(/return\\s*<([A-Za-z][A-Za-z0-9.-]*)([^>]*)>([^<]*)<\\/\\1>\\s*;/g, (_match, tag, attrs, text) => {
    return "return React.createElement(" + JSON.stringify(tag) + ", " + propsFromAttrs(attrs) + ", " + JSON.stringify(text.trim()) + ");";
  });
  code = code.replace(/return\\s*<([A-Za-z][A-Za-z0-9.-]*)([^>]*)\\/>\\s*;/g, (_match, tag, attrs) => {
    return "return React.createElement(" + JSON.stringify(tag) + ", " + propsFromAttrs(attrs) + ");";
  });

  return "const React = globalThis.React;\\n" + code;
}

function rewriteRuntimeImports(code) {
  return code
    .replace(/^\\s*import\\s+type\\s+[^;]+from\\s+["']@superobjective\\/tanstack-start["'];?\\s*$/gm, "")
    .replace(/^\\s*import\\s+\\{([^}]+)\\}\\s+from\\s+["']@superobjective\\/tanstack-start["'];?\\s*$/gm, (_match, named) => {
      return "const { " + named.replace(/\\s+as\\s+/g, ": ") + " } = globalThis.SuperobjectiveTanStackStart;\\n";
    });
}

function propsFromAttrs(attrs) {
  const props = {};
  const pattern = /([A-Za-z_$][\\w$-]*)=["']([^"']*)["']/g;
  let match;

  while ((match = pattern.exec(attrs))) {
    const key = match[1] === "class" ? "className" : match[1];
    props[key] = match[2];
  }

  return Object.keys(props).length ? JSON.stringify(props) : "null";
}
`;

async function compileLocally(input: {
  artifactId: string;
  draft: EditableArtifactDraft;
  maxBytes?: number;
}): Promise<CompiledEditableArtifact> {
  const validation = validateEditableArtifact(input.draft, {
    maxBytes: input.maxBytes,
    requireRuntimeImports: true,
  });

  if (!validation.ok) {
    throw new Error(
      `Generated artifact validation failed: ${validation.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  const compiledClientJs = normalizeClientModule(await compileTsx(input.draft));

  return {
    id: input.artifactId,
    islandId: input.draft.islandId,
    kind: input.draft.kind ?? "generated-client",
    sourceTsx: input.draft.sourceTsx,
    compiledClientJs,
    integrity: createArtifactIntegrity({
      sourceTsx: input.draft.sourceTsx,
      compiledClientJs,
      kind: input.draft.kind ?? "generated-client",
    }),
    status: "active",
    createdAt: new Date().toISOString(),
    validation,
  };
}

async function compileTsx(draft: EditableArtifactDraft): Promise<string> {
  const esbuildModuleName = "esbuild";
  const esbuild = (await import(/* @vite-ignore */ esbuildModuleName)) as typeof import("esbuild");

  return draft.files
    ? await bundleWorkspace(esbuild, draft)
    : (
        await esbuild.transform(draft.sourceTsx, {
          loader: "tsx",
          jsx: "transform",
          jsxFactory: "React.createElement",
          jsxFragment: "React.Fragment",
          format: "esm",
          target: "es2022",
          sourcemap: "inline",
        })
      ).code;
}

async function bundleWorkspace(
  esbuild: typeof import("esbuild"),
  draft: EditableArtifactDraft,
): Promise<string> {
  const files = normalizeWorkspaceFiles(draft);
  const entrypoint = draft.entrypoint ?? "src/GeneratedIsland.tsx";
  const resolvePath = (path: string, importer?: string): string => {
    if (!path.startsWith(".")) {
      return path;
    }

    const base = importer?.split("/").slice(0, -1).join("/") || "";
    const parts = `${base}/${path}`.split("/");
    const resolved: string[] = [];

    for (const part of parts) {
      if (!part || part === ".") {
        continue;
      }

      if (part === "..") {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }

    const bare = resolved.join("/");
    return (
      [bare, `${bare}.tsx`, `${bare}.ts`, `${bare}.jsx`, `${bare}.js`].find(
        (candidate) => files[candidate] !== undefined,
      ) ?? bare
    );
  };

  const result = await esbuild.build({
    entryPoints: [entrypoint],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    sourcemap: "inline",
    external: ["react", "react/jsx-runtime", "@superobjective/tanstack-start"],
    plugins: [
      {
        name: "superobjective-workspace",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const path = resolvePath(args.path, args.importer);

            if (files[path] !== undefined) {
              return { path, namespace: "so-workspace" };
            }

            return undefined;
          });

          build.onLoad({ filter: /.*/, namespace: "so-workspace" }, (args) => ({
            contents: files[args.path],
            loader: loaderForPath(args.path),
          }));
        },
      },
    ],
  });

  return result.outputFiles[0]?.text ?? "";
}

function normalizeWorkspaceFiles(draft: EditableArtifactDraft): Record<string, string> {
  const entrypoint = draft.entrypoint ?? "src/GeneratedIsland.tsx";

  return {
    [entrypoint]: draft.sourceTsx,
    ...(draft.files ?? {}),
  };
}

const WORKER_BUNDLER_RUNTIME_PATH = "src/__so_runtime.ts";
const WORKER_BUNDLER_JSX_RUNTIME_PATH = "src/__so_jsx_runtime.ts";

function createWorkerBundlerWorkspace(draft: EditableArtifactDraft): {
  files: Record<string, string>;
  entrypoint: string;
} {
  const entrypoint = draft.entrypoint ?? "src/GeneratedIsland.tsx";
  const files = normalizeWorkspaceFiles(draft);
  const rewrittenFiles = Object.fromEntries(
    Object.entries(files).map(([path, source]) => [
      path,
      rewriteWorkspaceRuntimeImports(source, path),
    ]),
  );

  return {
    entrypoint,
    files: {
      ...rewrittenFiles,
      [WORKER_BUNDLER_RUNTIME_PATH]: WORKER_BUNDLER_RUNTIME_SOURCE,
      [WORKER_BUNDLER_JSX_RUNTIME_PATH]: WORKER_BUNDLER_JSX_RUNTIME_SOURCE,
      "package.json": JSON.stringify({
        type: "module",
        private: true,
        dependencies: {},
      }),
    },
  };
}

function rewriteWorkspaceRuntimeImports(source: string, importer: string): string {
  const runtimeImport = relativeImportSpecifier(
    importer,
    WORKER_BUNDLER_RUNTIME_PATH,
  );
  const jsxRuntimeImport = relativeImportSpecifier(
    importer,
    WORKER_BUNDLER_JSX_RUNTIME_PATH,
  );

  return source
    .replace(
      /(\b(?:import|export)\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)?["'])react(["'])/g,
      `$1${runtimeImport}$2`,
    )
    .replace(
      /(\b(?:import|export)\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)?["'])react\/jsx-runtime(["'])/g,
      `$1${jsxRuntimeImport}$2`,
    )
    .replace(
      /(\b(?:import|export)\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)?["'])@superobjective\/tanstack-start(["'])/g,
      `$1${runtimeImport}$2`,
    );
}

function relativeImportSpecifier(importer: string, target: string): string {
  const fromParts = importer.split("/").slice(0, -1);
  const targetParts = target.split("/");

  while (
    fromParts.length &&
    targetParts.length &&
    fromParts[0] === targetParts[0]
  ) {
    fromParts.shift();
    targetParts.shift();
  }

  const prefix = fromParts.map(() => "..");
  const specifier = [...prefix, ...targetParts].join("/");

  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

function moduleToJs(
  module: string | { js?: string; cjs?: string; text?: string } | undefined,
  moduleName: string,
): string {
  if (typeof module === "string") {
    return module;
  }

  if (module?.js) {
    return module.js;
  }

  if (module?.cjs) {
    return module.cjs;
  }

  if (module?.text) {
    return module.text;
  }

  throw new Error(`Worker bundler did not return JavaScript for ${moduleName}.`);
}

const WORKER_BUNDLER_RUNTIME_SOURCE = `
const React = globalThis.React;
const runtime = globalThis.SuperobjectiveTanStackStart;

export default React;
export const Children = React.Children;
export const Component = React.Component;
export const Fragment = React.Fragment;
export const Profiler = React.Profiler;
export const PureComponent = React.PureComponent;
export const StrictMode = React.StrictMode;
export const Suspense = React.Suspense;
export const cloneElement = React.cloneElement;
export const createContext = React.createContext;
export const createElement = React.createElement;
export const createRef = React.createRef;
export const forwardRef = React.forwardRef;
export const isValidElement = React.isValidElement;
export const lazy = React.lazy;
export const memo = React.memo;
export const startTransition = React.startTransition;
export const use = React.use;
export const useActionState = React.useActionState;
export const useCallback = React.useCallback;
export const useContext = React.useContext;
export const useDebugValue = React.useDebugValue;
export const useDeferredValue = React.useDeferredValue;
export const useEffect = React.useEffect;
export const useId = React.useId;
export const useImperativeHandle = React.useImperativeHandle;
export const useInsertionEffect = React.useInsertionEffect;
export const useLayoutEffect = React.useLayoutEffect;
export const useMemo = React.useMemo;
export const useOptimistic = React.useOptimistic;
export const useReducer = React.useReducer;
export const useRef = React.useRef;
export const useState = React.useState;
export const useSyncExternalStore = React.useSyncExternalStore;
export const useTransition = React.useTransition;

export const EditableIslandShell = runtime.EditableIslandShell;
export const createCloudflareEditableAdapter = runtime.createCloudflareEditableAdapter;
export const createEditableFunction = runtime.createEditableFunction;
export const createEditableIsland = runtime.createEditableIsland;
export const createEditableRoute = runtime.createEditableRoute;
export const createEditableServerFunction = runtime.createEditableServerFunction;
export const useEditableFunction = runtime.useEditableFunction;
export const useEditableToolManifest = runtime.useEditableToolManifest;
export const useEditableView = runtime.useEditableView;
`;

const WORKER_BUNDLER_JSX_RUNTIME_SOURCE = `
const React = globalThis.React;

export const Fragment = React.Fragment;
export function jsx(type, props, key) {
  return React.createElement(type, key === undefined ? props : { ...props, key });
}
export const jsxs = jsx;
export const jsxDEV = jsx;
`;

function loaderForPath(path: string): "js" | "jsx" | "ts" | "tsx" | "css" {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".css")) return "css";
  return "js";
}

function normalizeClientModule(code: string): string {
  const withoutReactImport = rewriteRuntimeImports(
    code
      .replace(
        /^\s*import\s+(?:\*\s+as\s+)?React(?:\s*,\s*\{[^}]*\})?\s+from\s+["']react["'];?\s*$/gm,
        "",
      )
      .replace(/^\s*import\s+React\s+from\s+["']react["'];?\s*/gm, ""),
  );

  return `const React = globalThis.React;\n${withoutReactImport}`;
}

function rewriteRuntimeImports(code: string): string {
  return code
    .replace(
      /^\s*import\s+type\s+[^;]+from\s+["']@superobjective\/tanstack-start["'];?\s*$/gm,
      "",
    )
    .replace(
      /^\s*import\s+\{([^}]+)\}\s+from\s+["']@superobjective\/tanstack-start["'];?\s*$/gm,
      (_match, named: string) =>
        `const { ${named.replace(/\s+as\s+/g, ": ")} } = globalThis.SuperobjectiveTanStackStart;\n`,
    );
}

function isValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Generated artifact validation failed/.test(error.message)
  );
}

function isCloudflareWorkersRuntime(): boolean {
  return /\bCloudflare-Workers\b|workerd/i.test(
    globalThis.navigator?.userAgent ?? "",
  );
}
