import type { EditableBoot, EditableIsland } from "@superobjective/editable-core";
import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { EditableIslandShell } from "./client-runtime.js";
import { createModulePreloads } from "./preload.js";

export type EditableRouteOptions = {
  loadBoot?: (args: { path: string; island: EditableIsland }) => Promise<EditableBoot>;
  prewarm?: (args: { path: string; island: EditableIsland }) => Promise<void>;
  runtimeHref?: string;
  callEndpoint?: string;
  staleTime?: number;
  gcTime?: number;
  preloadStaleTime?: number;
  staleReloadMode?: "background" | "sync";
  bootEndpoint?: string;
  loginPath?: string;
  userCookie?: string | false;
  showSessionBar?: boolean;
};

export type EditableFileRouteOptions = EditableRouteOptions & {
  component: EditableIsland;
};

export type LegacyEditableRouteObject = {
  path: string;
  staleTime: number;
  gcTime: number;
  preloadStaleTime: number;
  staleReloadMode: "background" | "sync";
  preload: () => Promise<void>;
  loader: () => Promise<{
    boot: EditableBoot;
    preloads: ReturnType<typeof createModulePreloads>;
  }>;
  component: (props: { boot: EditableBoot }) => React.ReactElement;
};

export type EditableRouteObject =
  | any
  | LegacyEditableRouteObject;

export function createEditableRoute(
  island: EditableIsland,
  path: string,
  options: EditableRouteOptions = {},
): any {
  return createFileRoute(path as never)({
    component: () => (
      <EditableIslandRoute island={island} path={path} options={options} />
    ),
    staleTime: options.staleTime ?? 10_000,
    gcTime: options.gcTime ?? 30 * 60_000,
    preloadStaleTime: options.preloadStaleTime ?? 30_000,
    staleReloadMode: options.staleReloadMode ?? "background",
  } as never) as any;
}

export function createEditableFileRoute(path: string) {
  return (options: EditableFileRouteOptions): any => {
    const { component, ...routeOptions } = options;

    return createEditableRoute(component, path, routeOptions);
  };
}

export function createLegacyEditableRoute(
  island: EditableIsland,
  path: string,
  options: EditableRouteOptions = {},
): LegacyEditableRouteObject {
  return {
    path,
    staleTime: options.staleTime ?? 10_000,
    gcTime: options.gcTime ?? 30 * 60_000,
    preloadStaleTime: options.preloadStaleTime ?? 30_000,
    staleReloadMode: options.staleReloadMode ?? "background",
    async preload() {
      await options.prewarm?.({ path, island });
    },
    async loader() {
      const boot = options.loadBoot
        ? await options.loadBoot({ path, island })
        : await fetchBoot({
            endpoint: options.bootEndpoint ?? "/_so/boot",
            islandId: island.id,
            pageId: path,
          });

      return {
        boot,
        preloads: createModulePreloads(boot, {
          runtimeHref: options.runtimeHref,
        }),
      };
    },
    component({ boot }) {
      return (
        <EditableIslandShell
          island={island}
          boot={boot}
          callEndpoint={options.callEndpoint}
        />
      );
    },
  };
}

function EditableIslandRoute({
  island,
  path,
  options,
}: {
  island: EditableIsland;
  path: string;
  options: EditableRouteOptions;
}) {
  const [state, setState] = React.useState<
    | { status: "checking" }
    | { status: "loading"; username?: string }
    | { status: "ready"; username?: string; boot: EditableBoot }
    | { status: "error"; message: string }
  >({ status: "checking" });
  const userCookie = options.userCookie === false ? false : options.userCookie ?? "so_user";
  const loginPath = options.loginPath ?? "/login";

  React.useEffect(() => {
    const username = userCookie ? parseCookie(document.cookie)[userCookie] : undefined;

    if (userCookie && (!username || username === "anonymous")) {
      window.location.replace(loginPath);
      return;
    }

    setState({ status: "loading", username });

    const bootPromise = options.loadBoot
      ? options.loadBoot({ path, island })
      : fetchBoot({
          endpoint: options.bootEndpoint ?? "/_so/boot",
          islandId: island.id,
          pageId: path,
        });

    bootPromise
      .then((boot) => {
        setState({
          status: "ready",
          username,
          boot,
        });
      })
      .catch((error) => {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Boot failed.",
        });
      });
  }, [island, loginPath, options, path, userCookie]);

  if (state.status === "ready") {
    return (
      <main>
        {options.showSessionBar !== false && state.username ? (
          <DefaultSessionBar username={state.username} />
        ) : null}
        <EditableIslandShell
          island={island}
          boot={state.boot}
          callEndpoint={options.callEndpoint}
        />
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <StatusScreen
        title={`Unable to open ${island.title ?? island.id}`}
        detail={state.message}
        loginPath={loginPath}
      />
    );
  }

  return (
    <StatusScreen
      title={`Opening ${island.title ?? island.id}`}
      detail="Checking session..."
      loginPath={loginPath}
    />
  );
}

async function fetchBoot(input: {
  endpoint: string;
  islandId: string;
  pageId: string;
}): Promise<EditableBoot> {
  const response = await fetch(input.endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      islandId: input.islandId,
      pageId: input.pageId,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = (await response.json()) as { payload: EditableBoot };

  return payload.payload;
}

function DefaultSessionBar({ username }: { username: string }) {
  return (
    <form
      action="/auth/logout"
      method="post"
      style={{
        position: "fixed",
        top: 14,
        right: 14,
        zIndex: 50,
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: 8,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(2,8,7,0.84)",
        color: "white",
        backdropFilter: "blur(12px)",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
        User: {username}
      </span>
      <button
        type="submit"
        style={{
          height: 32,
          border: "1px solid rgba(255,255,255,0.24)",
          borderRadius: 8,
          padding: "0 10px",
          color: "white",
          background: "rgba(27,118,96,0.95)",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        Logout
      </button>
    </form>
  );
}

function StatusScreen({
  title,
  detail,
  loginPath,
}: {
  title: string;
  detail: string;
  loginPath: string;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        color: "white",
        background: "#020403",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ display: "grid", gap: 8, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.66)" }}>{detail}</p>
        <a href={loginPath} style={{ color: "white" }}>
          Login
        </a>
      </div>
    </main>
  );
}

function parseCookie(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    const key = rawKey?.trim();

    if (!key) {
      continue;
    }

    cookies[key] = decodeURIComponent(rawValue.join("="));
  }

  return cookies;
}
