const fs = require("fs");
const path = require("path");
const pngToIco = require("png-to-ico");

async function main() {
  const root = process.cwd();
  const pngPath = path.join(root, "assets", "icon.png");
  const icoPath = path.join(root, "assets", "icon.ico");

  if (!fs.existsSync(pngPath)) {
    console.error("Missing assets/icon.png");
    process.exit(1);
  }

  const buf = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, buf);
  process.stdout.write("Generated assets/icon.ico\n");
}

main().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
