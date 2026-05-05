// @ts-nocheck
import { EditableIslandShell } from "@superobjective/tanstack-start";
import type { EditableBoot } from "@superobjective/editable-core";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { USER_COOKIE, parseCookie, userFromName } from "../lib/auth";
import { GlobeIsland } from "../lib/globe";

export const Route = createFileRoute("/globe")({
  component: GlobeRoute,
  staleTime: 0,
  gcTime: 0,
  preloadStaleTime: 0,
  shouldReload: true,
});

type GlobeState =
  | { status: "checking" }
  | { status: "loading"; username: string }
  | { status: "ready"; username: string; boot: EditableBoot }
  | { status: "error"; message: string };

function GlobeRoute() {
  const [state, setState] = useState<GlobeState>({ status: "checking" });

  useEffect(() => {
    const username = parseCookie(document.cookie)[USER_COOKIE];

    if (!username || username === "anonymous") {
      window.location.replace("/login");
      return;
    }

    setState({ status: "loading", username });

    fetch("/_so/boot", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ islandId: GlobeIsland.id }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }

        return response.json() as Promise<{ payload: EditableBoot }>;
      })
      .then((payload) => {
        setState({
          status: "ready",
          username,
          boot: payload.payload,
        });
      })
      .catch((error) => {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Boot failed.",
        });
      });
  }, []);

  if (state.status === "ready") {
    const user = userFromName(state.username);

    return (
      <main>
        <SessionBar username={user.name} />
        <EditableIslandShell
          island={GlobeIsland}
          boot={state.boot}
          callEndpoint="/_so/call"
        />
      </main>
    );
  }

  if (state.status === "error") {
    return <StatusScreen title="Unable to open globe" detail={state.message} />;
  }

  return <StatusScreen title="Opening globe" detail="Checking session..." />;
}

function SessionBar({ username }: { username: string }) {
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
}: {
  title: string;
  detail: string;
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
        <a href="/login" style={{ color: "white" }}>
          Login
        </a>
      </div>
    </main>
  );
}
