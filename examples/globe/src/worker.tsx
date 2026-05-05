import {
  createCloudflareEditableAdapter,
  createModulePreloads,
  EditableIslandShell,
} from "@superobjective/tanstack-start";
import { renderToReadableStream } from "react-dom/server.browser";
import { GlobeIsland } from "./globe.js";
import { SuperobjectiveOrchestrator, type Env } from "./superobjective.js";

export { SuperobjectiveOrchestrator };

const adapter = createCloudflareEditableAdapter({
  actorId: (request) => request.headers.get("x-so-actor") ?? "anonymous",
  pageId: () => "/globe",
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const soResponse = await adapter.handleSoRequest({
      request,
      env,
      islandId: GlobeIsland.id,
    });

    if (soResponse) {
      return soResponse;
    }

    const url = new URL(request.url);

    if (url.pathname !== "/globe") {
      return Response.redirect(new URL("/globe", request.url), 302);
    }

    const boot = await adapter.boot({
      request,
      env,
      islandId: GlobeIsland.id,
      etag: request.headers.get("If-None-Match") ?? undefined,
    });

    const stream = await renderToReadableStream(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Superobjective Globe</title>
          {createModulePreloads(boot).map((preload) => (
            <link
              key={preload.href}
              rel={preload.rel}
              href={preload.href}
              integrity={preload.integrity}
            />
          ))}
        </head>
        <body style={{ margin: 0, background: "#020403" }}>
          <div id="root">
            <EditableIslandShell island={GlobeIsland} boot={boot} />
          </div>
          <script dangerouslySetInnerHTML={{ __html: createGlobeClientScript() }} />
        </body>
      </html>,
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=10, stale-while-revalidate=60",
      },
    });
  },
};

function createGlobeClientScript(): string {
  return `
const bootEl = document.getElementById("__SO_BOOT__");
const boot = bootEl ? JSON.parse(bootEl.textContent || "{}") : { islandId: "globe", viewState: {} };
const statusEl = document.querySelector("[data-so-status='planes']");
const layerEl = document.querySelector("[data-so-plane-layer]");
const button = document.querySelector("[data-so-action='europe-filter']");
const islandRoot = document.querySelector("[data-so-island]");

async function callEditable(name, input, source) {
  const response = await fetch("/_so/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ islandId: boot.islandId || "globe", name, input, source: source || "browser" })
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

function renderPlanes(planes) {
  if (!layerEl) return;
  layerEl.replaceChildren(...planes.map((plane) => {
    const marker = document.createElement("span");
    marker.title = plane.callsign + " " + plane.altitudeFt.toLocaleString() + " ft";
    marker.style.position = "absolute";
    marker.style.left = (50 + plane.lon * 0.42) + "%";
    marker.style.top = (50 - plane.lat * 0.42) + "%";
    marker.style.width = "7px";
    marker.style.height = "7px";
    marker.style.borderRadius = "50%";
    marker.style.background = "#84ffd0";
    marker.style.boxShadow = "0 0 14px rgba(132,255,208,0.95)";
    marker.style.transform = "translate(-50%, -50%)";
    return marker;
  }));
}

async function refreshPlanes(input) {
  if (statusEl) statusEl.textContent = "Refreshing...";
  const result = await callEditable("getPlanes", input, "query");
  renderPlanes((result.output && result.output.planes) || []);
  if (statusEl) statusEl.textContent = "";
}

button?.addEventListener("click", async () => {
  const next = { region: "europe", minAltitudeFt: 30000, limit: 500 };
  await callEditable("setPlaneFilter", next, "browser");
  await refreshPlanes(next);
});

refreshPlanes(boot.viewState?.filter || { limit: 1000 }).catch((error) => {
  if (statusEl) statusEl.textContent = "Failed to load planes";
  console.error(error);
});

function createDomElement(type, props, ...children) {
  const element = document.createElement(type);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === "className") element.setAttribute("class", value);
    else if (key === "style" && value && typeof value === "object") Object.assign(element.style, value);
    else if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) element.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

if (boot.activeArtifact?.url && islandRoot) {
  globalThis.React ||= { createElement: createDomElement, Fragment: "fragment" };
  import(boot.activeArtifact.url).then((module) => {
    const rendered = module.default?.();
    if (rendered instanceof Node) islandRoot.replaceChildren(rendered);
  }).catch(console.error);
}
`;
}
