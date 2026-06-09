const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig({
  // Required for Electron packaged app (file://) so assets load from relative paths.
  base: "./",
  plugins: [react()]
});
