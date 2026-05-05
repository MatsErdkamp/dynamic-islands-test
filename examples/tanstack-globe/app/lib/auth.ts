export const USER_COOKIE = "so_user";

export type SessionUser = {
  id: string;
  name: string;
};

export function getUserFromRequest(request: Request): SessionUser {
  const username =
    parseCookie(request.headers.get("Cookie") ?? "")[USER_COOKIE] ??
    request.headers.get("x-so-actor") ??
    "anonymous";

  return userFromName(username);
}

export function getAuthenticatedUserFromRequest(
  request: Request,
): SessionUser | undefined {
  const username = parseCookie(request.headers.get("Cookie") ?? "")[
    USER_COOKIE
  ];

  if (!username || username === "anonymous") {
    return undefined;
  }

  return userFromName(username);
}

export function userFromName(username: string): SessionUser {
  const name = sanitizeUsername(username);

  return {
    id: name.toLowerCase(),
    name,
  };
}

export function createLoginCookie(username: string): string {
  const user = userFromName(username);

  return `${USER_COOKIE}=${encodeURIComponent(user.name)}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

export function createLogoutCookie(): string {
  return `${USER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function parseCookie(header: string): Record<string, string> {
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

function sanitizeUsername(value: string): string {
  const clean = value
    .trim()
    .replace(/[^A-Za-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);

  return clean || "anonymous";
}
