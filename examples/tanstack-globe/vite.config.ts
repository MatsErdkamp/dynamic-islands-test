import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { superobjective } from "@superobjective/tanstack-start";
import { GlobeIsland } from "./app/lib/globe";

export default defineConfig({
  server: {
    allowedHosts: [".trycloudflare.com"],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    superobjective({
      islands: [GlobeIsland],
      workerEntrypoint: "@tanstack/react-start/server-entry",
    }),
    tanstackStart({
      srcDirectory: "app",
      server: {
        entry: "server",
      },
    }),
    viteReact(),
  ],
});
