const fs = require("fs");
const path = require("path");

function rmDir(p) {
  try {
    if (!fs.existsSync(p)) return;
    fs.rmSync(p, { recursive: true, force: true });
  } catch {}
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

function main() {
  const root = process.cwd();
  const srcRenderer = path.join(root, "src", "renderer");
  const distRenderer = path.join(root, "dist", "renderer");

  if (!fs.existsSync(srcRenderer)) {
    console.error("Missing src/renderer");
    process.exit(1);
  }

  rmDir(distRenderer);
  copyDir(srcRenderer, distRenderer);

  const rootAssets = path.join(root, "assets");
  const distAssets = path.join(distRenderer, "assets");
  if (fs.existsSync(rootAssets)) {
    copyDir(rootAssets, distAssets);
  }

  console.log("Copied src/renderer -> dist/renderer");
}

main();