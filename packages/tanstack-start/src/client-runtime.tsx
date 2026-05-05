import {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
  useQuery as useTanstackQuery,
} from "@tanstack/react-query";
import React, {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  EditableBoot,
  EditableFunction,
  EditableFunctionManifest,
  EditableIsland,
} from "@superobjective/editable-core";
import { createInlineBootScript } from "./boot.js";
import { registerWebMcpTools } from "./webmcp-client.js";

const globalRuntime = globalThis as typeof globalThis & {
  React?: typeof React;
  SuperobjectiveTanStackStart?: Record<string, unknown>;
};

globalRuntime.React ??= React;

export type EditableToolCall = {
  name: string;
  input?: unknown;
  source?: string;
  artifactId?: string;
};

export type EditableRuntimeContextValue = {
  islandId: string;
  boot: EditableBoot;
  state: Record<string, unknown>;
  tools: EditableFunctionManifest[];
  callTool(call: EditableToolCall): Promise<unknown>;
  setViewState(key: string, value: unknown): Promise<void>;
};

export type EditableIslandProviderProps = {
  boot: EditableBoot;
  callEndpoint?: string;
  children: ReactNode;
  onToolCall?: (call: EditableToolCall) => Promise<unknown>;
};

export type EditableIslandShellProps = {
  island: EditableIsland;
  boot: EditableBoot;
  callEndpoint?: string;
  editEndpoint?: string;
  artifactLoader?: (url: string) => Promise<{ default?: React.ComponentType }>;
  inlineBoot?: boolean;
};

const EditableRuntimeContext =
  createContext<EditableRuntimeContextValue | null>(null);

export function EditableIslandProvider({
  boot,
  callEndpoint = "/_so/call",
  children,
  onToolCall,
}: EditableIslandProviderProps) {
  const [state, setState] = useState<Record<string, unknown>>(boot.viewState);

  useEffect(() => {
    setState(boot.viewState);
  }, [boot]);

  const callTool = useCallback(
    async (call: EditableToolCall): Promise<unknown> => {
      if (onToolCall) {
        return onToolCall(call);
      }

      const response = await fetch(callEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          islandId: boot.islandId,
          name: call.name,
          input: call.input,
          source: call.source ?? "browser",
          artifactId: call.artifactId ?? boot.activeArtifact.id,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as {
        output?: unknown;
        viewState?: Record<string, unknown>;
      };

      if (payload.viewState) {
        setState(payload.viewState);
      }

      return payload.output;
    },
    [boot.activeArtifact.id, boot.islandId, callEndpoint, onToolCall],
  );

  const setViewState = useCallback(
    async (key: string, value: unknown): Promise<void> => {
      await callTool({
        name: "__view.set",
        input: { key, value },
        source: "browser",
      });
      setState((current) => ({ ...current, [key]: value }));
    },
    [callTool],
  );

  const value = useMemo<EditableRuntimeContextValue>(
    () => ({
      islandId: boot.islandId,
      boot,
      state,
      tools: boot.tools,
      callTool,
      setViewState,
    }),
    [boot, callTool, setViewState, state],
  );

  useEffect(() => {
    registerWebMcpTools({
      tools: boot.tools,
      callTool: (name, input) =>
        callTool({
          name,
          input,
          source: "webmcp",
        }),
    });
  }, [boot.tools, callTool]);

  return (
    <EditableRuntimeContext.Provider value={value}>
      {children}
    </EditableRuntimeContext.Provider>
  );
}

export function EditableIslandShell({
  island,
  boot,
  callEndpoint,
  editEndpoint = "/_so/edit",
  artifactLoader,
  inlineBoot = true,
}: EditableIslandShellProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [currentBoot, setCurrentBoot] = useState(boot);
  const [prompt, setPrompt] = useState("");
  const [editState, setEditState] = useState<
    "idle" | "submitting" | "error"
  >("idle");
  const [editError, setEditError] = useState<string>();
  const [hydrated, setHydrated] = useState(false);
  const editable = island.rendering.editable !== false;
  const shouldRenderGenerated =
    hydrated &&
    currentBoot.activeArtifact.kind !== "trusted-default" &&
    Boolean(currentBoot.activeArtifact.url);
  const content =
    currentBoot.activeArtifact.kind === "trusted-default" ||
    !currentBoot.activeArtifact.url ? (
      createElement(island.default as React.ComponentType)
    ) : shouldRenderGenerated ? (
      <GeneratedArtifact
        url={currentBoot.activeArtifact.url}
        loader={artifactLoader}
      />
    ) : (
      <div
        data-so-generated-placeholder={currentBoot.activeArtifact.id}
        style={{ minHeight: 700 }}
      />
    );

  useEffect(() => {
    setCurrentBoot(boot);
  }, [boot]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intent = prompt.trim();

    if (!intent || editState === "submitting") {
      return;
    }

    setEditState("submitting");
    setEditError(undefined);

    try {
      const response = await fetch(editEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          islandId: currentBoot.islandId,
          intent,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as { boot?: EditableBoot };

      if (payload.boot) {
        setCurrentBoot(payload.boot);
      } else {
        window.location.reload();
      }

      setPrompt("");
      setEditState("idle");
    } catch (error) {
      setEditState("error");
      setEditError(error instanceof Error ? error.message : "Edit failed.");
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <EditableIslandProvider boot={currentBoot} callEndpoint={callEndpoint}>
        {inlineBoot ? (
          <script
            id="__SO_BOOT__"
            type="application/json"
            dangerouslySetInnerHTML={{
              __html: createInlineBootScript(currentBoot)
                .replace(/^<script[^>]*>/, "")
                .replace(/<\/script>$/, ""),
            }}
          />
        ) : null}
        <div data-so-island={island.id} style={{ position: "relative" }}>
          {editable ? (
            <form
              aria-label="Edit island"
              onSubmit={submitEdit}
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                bottom: 16,
                zIndex: 20,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 8,
                padding: 8,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(2,8,7,0.82)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
              }}
            >
              <input
                aria-label="Prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.currentTarget.value)}
                placeholder="Describe a change"
                style={{
                  minWidth: 0,
                  height: 38,
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "0 12px",
                  color: "white",
                  background: "rgba(255,255,255,0.08)",
                  outline: "none",
                  font: "inherit",
                }}
              />
              <button
                type="submit"
                disabled={!prompt.trim() || editState === "submitting"}
                style={{
                  height: 38,
                  border: "1px solid rgba(255,255,255,0.24)",
                  borderRadius: 8,
                  padding: "0 14px",
                  color: "white",
                  background:
                    editState === "submitting"
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(27, 118, 96, 0.95)",
                  cursor:
                    !prompt.trim() || editState === "submitting"
                      ? "default"
                      : "pointer",
                  font: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                {editState === "submitting" ? "Applying" : "Apply"}
              </button>
              {editState === "error" && editError ? (
                <div
                  role="alert"
                  style={{
                    gridColumn: "1 / -1",
                    color: "#fecaca",
                    fontSize: 12,
                  }}
                >
                  {editError}
                </div>
              ) : null}
            </form>
          ) : null}
          {content}
        </div>
      </EditableIslandProvider>
    </QueryClientProvider>
  );
}

export function useEditableView(): {
  state: Record<string, unknown>;
  setState(key: string, value: unknown): Promise<void>;
} {
  const runtime = useEditableRuntime();

  return {
    state: runtime.state,
    setState: runtime.setViewState,
  };
}

export function useEditableToolManifest(): EditableFunctionManifest[] {
  return useEditableRuntime().tools;
}

export function useEditableFunction<I = unknown, O = unknown>(
  fnOrName: EditableFunction<I, O> | string,
): {
  call(input: I): Promise<O>;
  useQuery(
    input: I,
    options?: {
      staleTime?: number;
      keepPreviousData?: boolean;
      refetchInterval?: number;
    },
  ): {
    data?: O;
    error?: unknown;
    isLoading: boolean;
    isFetching: boolean;
  };
} {
  const runtime = useEditableRuntime();
  const name = typeof fnOrName === "string" ? fnOrName : fnOrName.name;

  const call = useCallback(
    async (input: I): Promise<O> =>
      (await runtime.callTool({
        name,
        input,
        source: "browser",
      })) as O,
    [name, runtime],
  );

  return {
    call,
    useQuery(input, options) {
      const query = useTanstackQuery({
        queryKey: ["so-editable", runtime.islandId, name, input],
        queryFn: async () =>
          (await runtime.callTool({
            name,
            input,
            source: "query",
          })) as O,
        staleTime: options?.staleTime,
        refetchInterval: options?.refetchInterval,
        placeholderData: options?.keepPreviousData
          ? keepPreviousData
          : undefined,
      });

      return {
        data: query.data,
        error: query.error,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
      };
    },
  };
}

export function useEditableRuntime(): EditableRuntimeContextValue {
  const runtime = useContext(EditableRuntimeContext);

  if (!runtime) {
    throw new Error(
      "Editable runtime hooks must be used inside EditableIslandProvider.",
    );
  }

  return runtime;
}

function GeneratedArtifact({
  url,
  loader,
}: {
  url: string;
  loader?: (url: string) => Promise<{ default?: React.ComponentType }>;
}) {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let cancelled = false;
    const load = loader ?? ((href: string) => import(/* @vite-ignore */ href));

    load(url)
      .then((module) => {
        if (!cancelled) {
          setComponent(() => module.default ?? null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loader, url]);

  if (error) {
    throw error;
  }

  return Component ? createElement(Component) : null;
}

globalRuntime.SuperobjectiveTanStackStart = {
  useEditableFunction,
  useEditableRuntime,
  useEditableToolManifest,
  useEditableView,
};
