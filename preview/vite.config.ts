import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  publicDir: "../public",
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(""),
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(""),
  },
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  build: { target: "es2020", outDir: "dist", emptyOutDir: true },
});
