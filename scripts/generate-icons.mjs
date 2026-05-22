import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const source = join(root, "public", "logo-source.png");
const publicDir = join(root, "public");
const iconDir = join(root, "src-tauri", "icons");
const iconset = join(iconDir, "Mavicat.iconset");

function renderPng(size, out) {
  execFileSync("sips", ["-s", "format", "png", "-z", String(size), String(size), source, "--out", out], {
    stdio: "inherit",
  });
}

function writeIco(entries, out) {
  const images = entries.map((file) => readFileSync(file));
  const headerSize = 6 + images.length * 16;
  const buffer = Buffer.alloc(headerSize + images.reduce((sum, item) => sum + item.length, 0));

  buffer.writeUInt16LE(0, 0);
  buffer.writeUInt16LE(1, 2);
  buffer.writeUInt16LE(images.length, 4);

  let imageOffset = headerSize;
  images.forEach((image, index) => {
    const size = entries[index].match(/(\d+)x\1/)?.[1] ?? "256";
    const directoryOffset = 6 + index * 16;
    const iconSize = Number(size);
    buffer.writeUInt8(iconSize >= 256 ? 0 : iconSize, directoryOffset);
    buffer.writeUInt8(iconSize >= 256 ? 0 : iconSize, directoryOffset + 1);
    buffer.writeUInt8(0, directoryOffset + 2);
    buffer.writeUInt8(0, directoryOffset + 3);
    buffer.writeUInt16LE(1, directoryOffset + 4);
    buffer.writeUInt16LE(32, directoryOffset + 6);
    buffer.writeUInt32LE(image.length, directoryOffset + 8);
    buffer.writeUInt32LE(imageOffset, directoryOffset + 12);
    image.copy(buffer, imageOffset);
    imageOffset += image.length;
  });

  writeFileSync(out, buffer);
}

mkdirSync(iconDir, { recursive: true });
mkdirSync(join(iconDir, "light"), { recursive: true });
mkdirSync(join(iconDir, "ios"), { recursive: true });
mkdirSync(join(iconDir, "android"), { recursive: true });

renderPng(512, join(publicDir, "logo.png"));
renderPng(120, join(publicDir, "logo-sm.png"));
renderPng(32, join(iconDir, "32x32.png"));
renderPng(64, join(iconDir, "64x64.png"));
renderPng(128, join(iconDir, "128x128.png"));
renderPng(256, join(iconDir, "128x128@2x.png"));
renderPng(512, join(iconDir, "icon.png"));
copyFileSync(join(iconDir, "icon.png"), join(iconDir, "light", "icon.png"));

const windowsSizes = {
  "Square30x30Logo.png": 30,
  "Square44x44Logo.png": 44,
  "Square71x71Logo.png": 71,
  "Square89x89Logo.png": 89,
  "Square107x107Logo.png": 107,
  "Square142x142Logo.png": 142,
  "Square150x150Logo.png": 150,
  "Square284x284Logo.png": 284,
  "Square310x310Logo.png": 310,
  "StoreLogo.png": 50,
};

for (const [name, size] of Object.entries(windowsSizes)) {
  renderPng(size, join(iconDir, name));
}

rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });
const iconsetSizes = [16, 32, 128, 256, 512];
for (const size of iconsetSizes) {
  renderPng(size, join(iconset, `icon_${size}x${size}.png`));
  renderPng(size * 2, join(iconset, `icon_${size}x${size}@2x.png`));
}
execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(iconDir, "icon.icns")], {
  stdio: "inherit",
});
rmSync(iconset, { recursive: true, force: true });

writeIco(
  [32, 64, 128, 256].map((size) => join(iconDir, size === 256 ? "128x128@2x.png" : `${size}x${size}.png`)),
  join(iconDir, "icon.ico"),
);
