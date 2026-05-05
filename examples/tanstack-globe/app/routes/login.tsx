// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: LoginRoute,
});

function LoginRoute() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        color: "white",
        background:
          "radial-gradient(circle at 50% 34%, rgba(50,185,143,0.24), transparent 34%), #020403",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <form
        aria-label="Login"
        action="/auth/login"
        method="post"
        style={{
          width: "min(100%, 380px)",
          display: "grid",
          gap: 14,
          padding: 24,
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: 12,
          background: "rgba(2,8,7,0.86)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.34)",
          backdropFilter: "blur(14px)",
        }}
      >
        <input type="hidden" name="redirect" value="/globe" />
        <div style={{ display: "grid", gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
            Superobjective
          </h1>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.68)" }}>
            Pick a username to open your editable globe workspace.
          </p>
        </div>
        <label
          style={{
            display: "grid",
            gap: 8,
            color: "rgba(255,255,255,0.78)",
            fontSize: 13,
          }}
        >
          Username
          <input
            aria-label="Username"
            name="username"
            autoComplete="username"
            autoFocus
            required
            placeholder="mat"
            style={{
              height: 42,
              minWidth: 0,
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 8,
              padding: "0 12px",
              color: "white",
              background: "rgba(255,255,255,0.08)",
              outline: "none",
              font: "inherit",
            }}
          />
        </label>
        <button
          type="submit"
          style={{
            height: 42,
            border: "1px solid rgba(255,255,255,0.24)",
            borderRadius: 8,
            color: "white",
            background: "rgba(27,118,96,0.95)",
            cursor: "pointer",
            font: "inherit",
            fontWeight: 650,
          }}
        >
          Continue
        </button>
      </form>
    </main>
  );
}
