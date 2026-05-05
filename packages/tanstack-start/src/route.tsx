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
  beforeLoad?: (ctx: any) => unknown | Promise<unknown>;
  loader?: (ctx: any) => unknown | Promise<unknown>;
  [key: string]: unknown;
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
  return createEditableFileRoute(path)({
    ...options,
    component: island,
  });
}

export function createEditableFileRoute(path: string) {
  return (options: EditableFileRouteOptions): any => {
    const {
      component: island,
      beforeLoad: userBeforeLoad,
      loader: userLoader,
      loadBoot,
      prewarm,
      runtimeHref,
      callEndpoint,
      staleTime,
      gcTime,
      preloadStaleTime,
      staleReloadMode,
      bootEndpoint,
      loginPath,
      userCookie,
      showSessionBar,
      ...tanstackOptions
    } = options;
    const editableOptions: EditableRouteOptions = {
      loadBoot,
      prewarm,
      runtimeHref,
      callEndpoint,
      staleTime,
      gcTime,
      preloadStaleTime,
      staleReloadMode,
      bootEndpoint,
      loginPath,
      userCookie,
      showSessionBar,
    };
    let route: any;

    route = createFileRoute(path as never)({
      ...tanstackOptions,
      beforeLoad: async (ctx: any) => {
        const userContext = userBeforeLoad
          ? await userBeforeLoad(ctx)
          : undefined;

        return userContext;
      },
      loader: async (ctx: any) => {
        await prewarm?.({ path, island });

        const [userData, boot] = await Promise.all([
          userLoader ? userLoader(ctx) : undefined,
          loadBoot
            ? loadBoot({ path, island })
            : fetchBoot({
                endpoint: bootEndpoint ?? "/_so/boot",
                islandId: island.id,
                pageId: path,
              }),
        ]);

        return mergeRouteData(userData, {
          editableBoot: boot,
          editablePreloads: createModulePreloads(boot, {
            runtimeHref,
          }),
        });
      },
      component: () => (
        <EditableIslandRoute
          route={route}
          island={island}
          options={editableOptions}
        />
      ),
      staleTime: staleTime ?? 10_000,
      gcTime: gcTime ?? 30 * 60_000,
      preloadStaleTime: preloadStaleTime ?? 30_000,
      staleReloadMode: staleReloadMode ?? "background",
    } as never) as any;

    return route;
  };
}

function mergeRouteData(
  userData: unknown,
  editableData: {
    editableBoot: EditableBoot;
    editablePreloads: ReturnType<typeof createModulePreloads>;
  },
): unknown {
  if (userData && typeof userData === "object" && !Array.isArray(userData)) {
    return {
      ...userData,
      ...editableData,
    };
  }

  if (typeof userData !== "undefined") {
    return {
      userData,
      ...editableData,
    };
  }

  return editableData;
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
  route,
  island,
  options,
}: {
  route: any;
  island: EditableIsland;
  options: EditableRouteOptions;
}) {
  const routeData = route.useLoaderData() as
    | { editableBoot?: EditableBoot }
    | undefined;
  const boot = routeData?.editableBoot;
  const userCookie = options.userCookie === false ? false : options.userCookie ?? "so_user";
  const loginPath = options.loginPath ?? "/login";
  const username = userCookie && typeof document !== "undefined"
    ? parseCookie(document.cookie)[userCookie]
    : undefined;

  React.useEffect(() => {
    if (userCookie && (!username || username === "anonymous")) {
      window.location.replace(loginPath);
    }
  }, [loginPath, userCookie, username]);

  if (boot && (!userCookie || (username && username !== "anonymous"))) {
    return (
      <main>
        {options.showSessionBar !== false && username ? (
          <DefaultSessionBar username={username} />
        ) : null}
        <EditableIslandShell
          island={island}
          boot={boot}
          callEndpoint={options.callEndpoint}
        />
      </main>
    );
  }

  if (!boot) {
    return (
      <StatusScreen
        title={`Unable to open ${island.title ?? island.id}`}
        detail="Boot data was not returned by the route loader."
        loginPath={loginPath}
      />
    );
  }

  return (
    <StatusScreen
      title={`Opening ${island.title ?? island.id}`}
      detail="Redirecting to login..."
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
