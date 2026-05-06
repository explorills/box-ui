import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { resolve } from "path";

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname;

// Mirrors the other ONE-ecosystem consumers' vite.config.ts. The `dedupe`
// list ensures only one copy of React + the Web3 stack ships in the bundle,
// which @explorills/one-ecosystem-ui assumes.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(projectRoot, "src"),
    },
    dedupe: ["react", "react-dom", "wagmi", "viem", "@tanstack/react-query"],
  },
});
