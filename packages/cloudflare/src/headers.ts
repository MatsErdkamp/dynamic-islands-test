export function artifactHeaders(input: {
  integrity: string;
  immutable?: boolean;
}): Headers {
  return new Headers({
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": input.immutable
      ? "private, max-age=31536000, immutable"
      : "private, max-age=60",
    ETag: quoteEtag(input.integrity),
  });
}

export function bootHeaders(input: {
  etag: string;
  privateMaxAge: number;
  swr: number;
}): Headers {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `private, max-age=${input.privateMaxAge}, stale-while-revalidate=${input.swr}`,
    ETag: quoteEtag(input.etag),
  });
}

export function noStoreJsonHeaders(): Headers {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

export function quoteEtag(value: string): string {
  return value.startsWith("\"") ? value : `"${value}"`;
}

export function unquoteEtag(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.replace(/^W\//, "").replace(/^"|"$/g, "");
}
