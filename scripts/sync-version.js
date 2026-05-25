import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { buildPackageVersions } from "./set-package-version.js";

// File paths
const paths = {
  package: resolve("package.json"),
  tauri: resolve("src-tauri/tauri.conf.json"),
  cargo: resolve("src-tauri/Cargo.toml"),
  appVersion: resolve("src/version.ts"),
  readme: resolve("README.md"),
};

const pkg = JSON.parse(readFileSync(paths.package, "utf-8"));
const isDailyVersion = process.argv.includes("--daily");
const { packageVersion, displayVersion } = isDailyVersion
  ? buildPackageVersions(pkg.version)
  : { packageVersion: pkg.version, displayVersion: `v${pkg.version}` };

console.log(`🔄 Syncing version to ${packageVersion}...`);

// 2. Update tauri.conf.json
if (isDailyVersion) {
  pkg.version = packageVersion;
  writeFileSync(paths.package, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log("✅ Updated package.json");
}

const tauriConf = JSON.parse(readFileSync(paths.tauri, "utf-8"));
tauriConf.version = packageVersion;
// Also update the version in the package node if present
if (tauriConf.package) tauriConf.package.version = packageVersion;
writeFileSync(paths.tauri, JSON.stringify(tauriConf, null, 2));
console.log("✅ Updated tauri.conf.json");

// 3. Update Cargo.toml
let cargo = readFileSync(paths.cargo, "utf-8");
// Use a regex to replace only the version in the [package] block
cargo = cargo.replace(/^version = ".*"/m, `version = "${packageVersion}"`);
writeFileSync(paths.cargo, cargo);
console.log("✅ Updated Cargo.toml");

// 4. Update src/version.ts
const versionContent = `export const APP_VERSION = "${packageVersion}";\nexport const APP_DISPLAY_VERSION = "${displayVersion}";\n`;
writeFileSync(paths.appVersion, versionContent);
console.log("✅ Updated src/version.ts");

let readme = readFileSync(paths.readme, "utf-8");

// Update download links in README
readme = readme.replace(
  /releases\/download\/v.*?\//g,
  `releases/download/v${packageVersion}/`,
);

readme = readme.replace(
  /mavicat_\d+\.\d+\.\d+_/g,
  `mavicat_${packageVersion}_`,
);

writeFileSync(paths.readme, readme);
console.log("✅ Updated README.md");
