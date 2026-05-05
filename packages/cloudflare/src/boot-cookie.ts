import { stableHash } from "@superobjective/editable-core";

export type BootCookieInput = {
  pageId: string;
  orchestratorName: string;
  version: number;
  artifactId: string;
  etag: string;
  secret: string;
};

export type ParsedBootCookie = {
  versionTag: "v1";
  orchestratorNameHash: string;
  version: number;
  artifactId: string;
  etag: string;
  verified: boolean;
};

export function deriveOrchestratorName(input: {
  actorId: string;
  pageId: string;
  islandId?: string;
}): string {
  return [
    "so",
    stableHash({
      actorId: input.actorId,
      pageId: input.pageId,
      islandId: input.islandId,
    }).slice(1),
  ].join(":");
}

export async function createBootCookie(input: BootCookieInput): Promise<string> {
  const unsigned = [
    "v1",
    stableHash(input.orchestratorName),
    String(input.version),
    encodeURIComponent(input.artifactId),
    encodeURIComponent(input.etag),
  ].join(".");
  const signature = await sign(unsigned, input.secret);

  return `${unsigned}.${signature}`;
}

export async function parseBootCookie(
  value: string,
  secret?: string,
): Promise<ParsedBootCookie | undefined> {
  const parts = value.split(".");

  if (parts.length !== 6 || parts[0] !== "v1") {
    return undefined;
  }

  const [versionTag, orchestratorNameHash, rawVersion, artifactId, etag, sig] =
    parts as [string, string, string, string, string, string];
  const unsigned = parts.slice(0, 5).join(".");
  const expected = secret ? await sign(unsigned, secret) : undefined;

  return {
    versionTag: versionTag as "v1",
    orchestratorNameHash,
    version: Number(rawVersion),
    artifactId: decodeURIComponent(artifactId),
    etag: decodeURIComponent(etag),
    verified: Boolean(secret && timingSafeEqual(sig, expected)),
  };
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return base64Url(new Uint8Array(signature));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function timingSafeEqual(left: string | undefined, right: string | undefined) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}
