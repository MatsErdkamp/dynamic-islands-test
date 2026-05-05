import { describe, expect, it } from "vitest";
import { compileEditableArtifact } from "../src/index.js";

describe("@superobjective/cloudflare dynamic worker compiler", () => {
  it("compiles valid generated JSX locally", async () => {
    const compiled = await compileEditableArtifact({
      draft: {
        islandId: "globe",
        sourceTsx: `
          import React from "react";
          export default function Generated() {
            return <div>ok</div>;
          }
        `,
      },
    });

    expect(compiled.compiledClientJs).toContain("ok");
    expect(compiled.validation.ok).toBe(true);
  });

  it("bundles a workspace artifact with normal TSX", async () => {
    const compiled = await compileEditableArtifact({
      draft: {
        islandId: "globe",
        entrypoint: "src/GeneratedGlobeIsland.tsx",
        sourceTsx: `
          import React from "react";
          import { Badge } from "./Badge";

          export default function GeneratedGlobeIsland() {
            return (
              <section>
                <Badge label="OPERATIONS ONLINE" />
              </section>
            );
          }
        `,
        files: {
          "src/GeneratedGlobeIsland.tsx": `
            import React from "react";
            import { Badge } from "./Badge";

            export default function GeneratedGlobeIsland() {
              return (
                <section>
                  <Badge label="OPERATIONS ONLINE" />
                </section>
              );
            }
          `,
          "src/Badge.tsx": `
            import React from "react";

            export function Badge({ label }) {
              return <strong>{label}</strong>;
            }
          `,
        },
      },
    });

    expect(compiled.compiledClientJs).toContain("OPERATIONS ONLINE");
    expect(compiled.compiledClientJs).not.toContain("./Badge");
    expect(compiled.validation.ok).toBe(true);
  });

  it("fails disallowed imports, eval, direct fetch, and bundle size", async () => {
    await expect(
      compileEditableArtifact({
        maxBytes: 10,
        draft: {
          islandId: "globe",
          sourceTsx: `
            import fs from "node:fs";
            export default function Bad() {
              eval("1");
              fetch("/x");
              return <div />;
            }
          `,
        },
      }),
    ).rejects.toThrow(/validation failed/);
  });
});
