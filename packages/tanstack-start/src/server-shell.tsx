import React from "react";
import type { EditableBoot } from "@superobjective/editable-core";
import { createInlineBootScript } from "./boot.js";
import { createModulePreloadLinks } from "./preload.js";

export function EditableServerShell({
  boot,
  children,
  runtimeHref,
}: {
  boot: EditableBoot;
  children: React.ReactNode;
  runtimeHref?: string;
}) {
  return (
    <>
      <div
        dangerouslySetInnerHTML={{
          __html: createModulePreloadLinks(boot, { runtimeHref }),
        }}
      />
      <div
        dangerouslySetInnerHTML={{
          __html: createInlineBootScript(boot),
        }}
      />
      {children}
    </>
  );
}
