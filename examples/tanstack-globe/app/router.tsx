import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultStaleTime: 10_000,
    defaultPreloadStaleTime: 30_000,
    defaultGcTime: 30 * 60_000,
  });
}

let router: ReturnType<typeof createRouter> | undefined;

export function getRouter() {
  router ??= createRouter();
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
