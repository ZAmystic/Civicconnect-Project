import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// Every .html file in src/pages becomes its own page in the production build.
// The root index.html (just a redirect) is NOT a build entry; see the plugin below.
const pagesDir = resolve(root, "src/pages");
const pages = Object.fromEntries(
  readdirSync(pagesDir)
    .filter((file) => file.endsWith(".html"))
    .map((file) => [file.replace(/\.html$/, ""), resolve(pagesDir, file)])
);

// In the build, write a plain redirect page as dist/index.html so "/" still
// lands on the login page. (In dev, the real index.html is served as before.)
function rootRedirect(): Plugin {
  return {
    name: "root-redirect",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "index.html",
        source:
          '<!doctype html><html lang="en"><head><meta charset="utf-8" />' +
          '<meta http-equiv="refresh" content="0; url=/src/pages/login.html" />' +
          "<title>CivicConnect</title></head>" +
          '<body><a href="/src/pages/login.html">Continue to sign in</a></body></html>',
      });
    },
  };
}

export default defineConfig({
  plugins: [rootRedirect()],
  build: {
    rollupOptions: {
      input: pages,
    },
  },
});
