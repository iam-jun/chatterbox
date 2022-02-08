const { defineConfig } = require("vite")
const { resolve } = require("path");
import manifestJSON from "./target/manifest.json";

const cssLink = manifestJSON["index.html"]["css"][0];
module.exports = defineConfig({
    build: {
        rollupOptions: {
            input: {
                parent: resolve(__dirname, "index.html"),
            },
            output: {
                entryFileNames: "assets/[name].js",
            },
        },
        outDir: "./target/parent",
        assetsInlineLimit: 0,
    },
    define: {
        CSS_FILE_NAME: cssLink.replace(/assets\//, ""),
    }
});