// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createLoginCookie } from "../lib/auth";

export const Route = createFileRoute("/auth/login")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const username = url.searchParams.get("username");

        if (!username) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: "/login",
            },
          });
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: safeRedirect(url.searchParams.get("redirect")),
            "Set-Cookie": createLoginCookie(username),
          },
        });
      },
      POST: async ({ request }: { request: Request }) => {
        const { username, redirect } = await readLoginSubmission(request);
        const headers = {
          "Set-Cookie": createLoginCookie(username),
        };

        if (!isJsonRequest(request)) {
          return new Response(null, {
            status: 302,
            headers: {
              ...headers,
              Location: redirect,
            },
          });
        }

        return Response.json(
          { ok: true, username, redirect },
          {
            headers,
          },
        );
      },
    },
  },
});

async function readLoginSubmission(
  request: Request,
): Promise<{ username: string; redirect: string }> {
  const url = new URL(request.url);
  const contentType = request.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      username?: unknown;
      redirect?: unknown;
    };

    return {
      username: typeof body.username === "string" ? body.username : "anonymous",
      redirect: safeRedirect(
        typeof body.redirect === "string"
          ? body.redirect
          : url.searchParams.get("redirect"),
      ),
    };
  }

  const form = await request.formData();
  const username = form.get("username");
  const redirect = form.get("redirect");

  return {
    username: typeof username === "string" ? username : "anonymous",
    redirect: safeRedirect(typeof redirect === "string" ? redirect : undefined),
  };
}

function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("Content-Type") ?? "";
  const accept = request.headers.get("Accept") ?? "";

  return contentType.includes("application/json") || accept.includes("application/json");
}

function safeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/globe";
  }

  return value;
}
