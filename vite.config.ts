import { defineConfig } from "vite";

export default defineConfig({
  base: "/fe/",
  build: {
    minify: "terser",
    terserOptions: {
      compress: {
        //生产环境时移除console
        drop_console: true,
        drop_debugger: true,
      },
    },
    lib: {
      entry: "src/index.ts",
      name: "Translator",
      formats: ["umd", "es"],
      fileName: "index",
    },
    outDir: "dist/lib",
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: {
      protocol: "ws",
      host: "localhost",
    },
  },
});
