// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createLogoutCookie } from "../lib/auth";

export const Route = createFileRoute("/auth/logout")({
  server: {
    handlers: {
      GET: async () => logoutResponse(),
      POST: async ({ request }: { request: Request }) => {
        const accept = request.headers.get("Accept") ?? "";

        if (accept.includes("application/json")) {
          return Response.json(
            { ok: true },
            {
              headers: {
                "Set-Cookie": createLogoutCookie(),
              },
            },
          );
        }

        return logoutResponse();
      },
    },
  },
});

function logoutResponse(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login",
      "Set-Cookie": createLogoutCookie(),
    },
  });
}
