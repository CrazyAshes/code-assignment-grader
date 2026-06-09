const fs = require("node:fs/promises");
const path = require("node:path");

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findFilesRecursive(dir, predicate, results = []) {
  if (!(await pathExists(dir))) return results;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await findFilesRecursive(fullPath, predicate, results);
    } else if (predicate(fullPath, entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function collectMacRelease(root, pkg, releaseRoot) {
  const makeDir = path.join(root, "out", "make");
  const releaseDir = path.join(releaseRoot, "mac-arm64");
  await fs.rm(releaseDir, { recursive: true, force: true });
  await fs.mkdir(releaseDir, { recursive: true });

  const dmgFiles = await findFilesRecursive(makeDir, (_p, name) => name.endsWith(".dmg"));
  if (dmgFiles.length === 0) {
    console.warn("⚠ 未找到 macOS DMG，跳过 mac-arm64 发布包整理");
    return;
  }

  const releaseDmgName = `Code-Assignment-Grader-${pkg.version}-arm64.dmg`;
  await fs.copyFile(dmgFiles[0], path.join(releaseDir, releaseDmgName));
  await fs.copyFile(
    path.join(root, "scripts/fix-mac-quarantine.command"),
    path.join(releaseDir, "fix-mac-quarantine.command")
  );
  await fs.chmod(path.join(releaseDir, "fix-mac-quarantine.command"), 0o755);
  await fs.copyFile(
    path.join(root, "scripts/install-macos.txt"),
    path.join(releaseDir, "INSTALL.txt")
  );

  console.log(`\nmacOS 发布文件: ${releaseDir}`);
  console.log(`  - ${releaseDmgName}`);
  console.log("  - fix-mac-quarantine.command");
  console.log("  - INSTALL.txt");
}

async function collectWindowsRelease(root, pkg, releaseRoot) {
  const makeDir = path.join(root, "out", "make");
  const releaseDir = path.join(releaseRoot, "win-x64");
  await fs.rm(releaseDir, { recursive: true, force: true });
  await fs.mkdir(releaseDir, { recursive: true });

  const zipFiles = await findFilesRecursive(
    makeDir,
    (_p, name) => name.endsWith(".zip") && name.toLowerCase().includes("win32")
  );
  if (zipFiles.length === 0) {
    console.warn("⚠ 未找到 Windows ZIP，跳过 win-x64 发布包整理");
    return;
  }

  const releaseZipName = `Code-Assignment-Grader-${pkg.version}-win-x64.zip`;
  await fs.copyFile(zipFiles[0], path.join(releaseDir, releaseZipName));
  await fs.copyFile(
    path.join(root, "scripts/install-windows.txt"),
    path.join(releaseDir, "INSTALL.txt")
  );

  console.log(`\nWindows 发布文件: ${releaseDir}`);
  console.log(`  - ${releaseZipName}`);
  console.log("  - INSTALL.txt");
}

async function collectRelease() {
  const root = path.join(__dirname, "..");
  const pkg = require(path.join(root, "package.json"));
  const releaseRoot = path.join(root, "release");

  await fs.mkdir(releaseRoot, { recursive: true });

  await collectMacRelease(root, pkg, releaseRoot);
  await collectWindowsRelease(root, pkg, releaseRoot);

  if (!(await pathExists(path.join(releaseRoot, "mac-arm64"))) &&
      !(await pathExists(path.join(releaseRoot, "win-x64")))) {
    throw new Error("未找到任何可发布的安装包，请先运行 npm run release 或 npm run release:win");
  }
}

module.exports = { collectRelease };

if (require.main === module) {
  collectRelease().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
