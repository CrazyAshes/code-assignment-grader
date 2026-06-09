const os = require("node:os");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const electronCache = path.join(os.homedir(), "Library/Caches/electron");

module.exports = {
  packagerConfig: {
    name: "Code Assignment Grader",
    appBundleId: "com.codeassignmentgrader.app",
    appCategoryType: "public.app-category.education",
    asar: true,
    osxSign: {
      identity: "-"
    },
    download: {
      cacheRoot: electronCache
    },
    ignore: [
      /^\/src\/renderer(\/|$)/,
      /^\/config(\/|$)/,
      /^\/scripts(\/|$)/,
      /^\/release(\/|$)/,
      /^\/out(\/|$)/,
      /^\/\.git(\/|$)/,
      /^\/\.env$/,
      /^\/\.env\./
    ]
  },
  outDir: path.join(projectRoot, "out"),
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        format: "ULFO"
      }
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"]
    }
  ],
  hooks: {
    postMake: async () => {
      const { collectRelease } = require(path.join(projectRoot, "scripts/collect-release.js"));
      await collectRelease();
    }
  }
};
