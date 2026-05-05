import { stableHash } from "./stable.js";
import type {
  EditableArtifact,
  EditableArtifactDraft,
  EditableArtifactKind,
} from "./types.js";

export function createDefaultArtifact({
  islandId,
  sourceTsx = "",
  createdAt = new Date(0).toISOString(),
}: {
  islandId: string;
  sourceTsx?: string;
  createdAt?: string;
}): EditableArtifact {
  return {
    id: "default",
    islandId,
    kind: "trusted-default",
    sourceTsx,
    integrity: stableHash({ islandId, kind: "trusted-default", sourceTsx }),
    status: "active",
    createdAt,
  };
}

export function createArtifactId(draft: EditableArtifactDraft): string {
  return (
    draft.id ??
    `art_${stableHash({
      islandId: draft.islandId,
      kind: draft.kind ?? "generated-client",
      sourceTsx: draft.sourceTsx,
      files: draft.files,
      entrypoint: draft.entrypoint,
    }).slice(1)}`
  );
}

export function createArtifactIntegrity(input: {
  sourceTsx: string;
  compiledClientJs?: string;
  compiledServerJs?: string;
  kind?: EditableArtifactKind;
}): string {
  return stableHash(input);
}

export function artifactUrl(islandId: string, artifactId: string): string {
  return `/_so/artifacts/${encodeURIComponent(islandId)}/${encodeURIComponent(
    artifactId,
  )}.js`;
}
