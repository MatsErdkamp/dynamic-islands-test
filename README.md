# Superobjective Editable Islands

Greenfield MVP for editable AI-generated UI islands on TanStack Start and Cloudflare.

The workspace contains:

- `@superobjective/editable-core`: host-agnostic primitives, manifests, registry, and generated artifact validation.
- `@superobjective/cloudflare`: Durable Object orchestrator, SQLite schema, artifact store, boot cookies, headers, and Dynamic Worker compile adapter.
- `@superobjective/tanstack-start`: TanStack-facing route helpers, shell, runtime hooks, WebMCP registration, and Cloudflare adapter helpers.
- `examples/globe`: a minimal `/globe` island example with Alchemy and Wrangler parity config.

Run:

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
```
