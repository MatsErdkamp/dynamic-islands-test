# Superobjective Editable Islands

Greenfield MVP for editable AI-generated UI islands on TanStack Start and Cloudflare.

The workspace contains:

- `@superobjective/editable-core`: host-agnostic primitives, manifests, registry, and generated artifact validation.
- `@superobjective/cloudflare`: Durable Object orchestrator, SQLite schema, artifact store, boot cookies, headers, and Dynamic Worker compile adapter.
- `@superobjective/tanstack-start`: TanStack-facing route helpers, shell, runtime hooks, WebMCP registration, Cloudflare adapter helpers, and the `superobjective()` Vite plugin.
- `examples/globe`: a minimal `/globe` island example with Alchemy and Wrangler parity config.
- `examples/tanstack-globe`: the canonical TanStack Start demo with login, editable prompt flow, Workers AI, and Cloudflare bindings.

The TanStack Vite plugin injects editable source seeds at build time, so app code can keep the normal shape:

```tsx
export const GlobeIsland = createEditableIsland({
  id: "globe",
  tools: [getPlanes, setPlaneFilter],
  default: DefaultGlobe,
});
```

Routes stay compact too:

```tsx
export const Route = createEditableFileRoute("/globe")({
  component: GlobeIsland,
});
```

The `superobjective()` Vite plugin generates the TanStack `/_so/*` route, Cloudflare Durable Object runtime module, manifests, and Alchemy resource metadata during dev/build.

Generated edits are compiled as normal TSX. In Node-based tests the Cloudflare package uses local esbuild; in `wrangler dev` and production workerd runtimes it uses Cloudflare's `@cloudflare/worker-bundler` before loading generated JavaScript through the Worker Loader binding.

Run:

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
```
