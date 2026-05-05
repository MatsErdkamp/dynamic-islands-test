import {
  createEditableFunction,
  createEditableIsland,
  useEditableFunction,
  useEditableView,
} from "@superobjective/tanstack-start";
import { z } from "zod";

export const PlaneFilter = z.object({
  region: z.string().optional(),
  minAltitudeFt: z.number().optional(),
  limit: z.number().default(1000),
});

export type PlaneFilter = z.infer<typeof PlaneFilter>;

export type Plane = {
  id: string;
  callsign: string;
  region: string;
  altitudeFt: number;
  lat: number;
  lon: number;
};

export const getPlanes = createEditableFunction({
  name: "getPlanes",
  description: "Get planes visible on the globe.",
  input: PlaneFilter,
  cache: {
    staleTime: 5_000,
    swr: true,
  },
  run: ({ input }) => ({
    planes: fallbackPlanes(input),
  }),
});

export const setPlaneFilter = createEditableFunction({
  name: "setPlaneFilter",
  description: "Set the active plane filter for this view.",
  input: PlaneFilter,
  run: async ({ input, view }) => {
    await view.set("filter", input);

    return { ok: true };
  },
});

export function DefaultGlobe() {
  const { state } = useEditableView();
  const getPlanesFn = useEditableFunction(getPlanes);
  const setFilter = useEditableFunction(setPlaneFilter);
  const filter = (state.filter as PlaneFilter | undefined) ?? { limit: 1000 };
  const { data, isFetching } = getPlanesFn.useQuery(filter, {
    staleTime: 5_000,
    keepPreviousData: true,
  });

  return (
    <div
      data-so-default-globe
      style={{
        position: "relative",
        minHeight: 700,
        overflow: "hidden",
        borderRadius: 16,
        background:
          "radial-gradient(circle at 50% 48%, #14302b 0, #07130f 42%, #020403 78%)",
        color: "white",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <button
        style={{
          position: "absolute",
          left: 16,
          top: 16,
          zIndex: 10,
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: 8,
          padding: "8px 12px",
          color: "white",
          background: "rgba(3, 20, 15, 0.85)",
          cursor: "pointer",
        }}
        onClick={() =>
          setFilter.call({
            region: "europe",
            minAltitudeFt: 30_000,
            limit: 500,
          })
        }
      >
        Europe above 30k
      </button>
      {isFetching ? (
        <div
          style={{
            position: "absolute",
            right: 16,
            top: 16,
            zIndex: 10,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          Refreshing...
        </div>
      ) : null}
      <GlobeRenderer planes={data?.planes ?? []} />
    </div>
  );
}

export const GlobeIsland = createEditableIsland({
  id: "globe",
  tools: [getPlanes, setPlaneFilter],
  default: DefaultGlobe,
  rendering: {
    editable: true,
    artifactStorage: "orchestrator-sqlite",
    generatedCodeIsolation: "dynamic-worker",
    defaultMode: "client-jsx",
    generatedServerMode: "cached-fragment",
  },
});

function GlobeRenderer({ planes }: { planes: Plane[] }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        data-so-plane-layer
        style={{
          position: "relative",
          width: "min(72vw, 560px)",
          aspectRatio: "1 / 1",
          borderRadius: "50%",
          border: "1px solid rgba(109, 255, 195, 0.36)",
          boxShadow:
            "0 0 70px rgba(66, 255, 179, 0.18), inset 0 0 90px rgba(66, 255, 179, 0.12)",
        }}
      >
        {planes.map((plane) => (
          <span
            key={plane.id}
            title={`${plane.callsign} ${plane.altitudeFt.toLocaleString()} ft`}
            style={{
              position: "absolute",
              left: `${50 + plane.lon * 0.42}%`,
              top: `${50 - plane.lat * 0.42}%`,
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#84ffd0",
              boxShadow: "0 0 14px rgba(132,255,208,0.95)",
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function fallbackPlanes(filter: PlaneFilter): Plane[] {
  return [
    {
      id: "so-101",
      callsign: "SO101",
      region: "europe",
      altitudeFt: 34_200,
      lat: 13,
      lon: 8,
    },
    {
      id: "so-208",
      callsign: "SO208",
      region: "europe",
      altitudeFt: 29_500,
      lat: 2,
      lon: -22,
    },
    {
      id: "so-319",
      callsign: "SO319",
      region: "north-america",
      altitudeFt: 38_100,
      lat: 22,
      lon: -48,
    },
    {
      id: "so-404",
      callsign: "SO404",
      region: "asia",
      altitudeFt: 41_000,
      lat: -10,
      lon: 36,
    },
  ]
    .filter((plane) => !filter.region || plane.region === filter.region)
    .filter(
      (plane) =>
        !filter.minAltitudeFt || plane.altitudeFt >= filter.minAltitudeFt,
    )
    .slice(0, filter.limit);
}
