import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const paths = {
  package: resolve("package.json"),
  tauri: resolve("src-tauri/tauri.conf.json"),
  cargo: resolve("src-tauri/Cargo.toml"),
  appVersion: resolve("src/version.ts"),
};

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function buildPackageVersions(currentVersion) {
  const { major, minor, patch } = parseSemver(currentVersion);
  const packageVersion = `${major}.${minor}.${patch + 1}`;

  return {
    packageVersion,
    displayVersion: `v${packageVersion}`,
  };
}

function applyPackageVersions() {
  const pkg = JSON.parse(readFileSync(paths.package, "utf-8"));
  const { packageVersion, displayVersion } = buildPackageVersions(pkg.version);
  pkg.version = packageVersion;
  writeFileSync(paths.package, `${JSON.stringify(pkg, null, 2)}\n`);

  const tauriConf = JSON.parse(readFileSync(paths.tauri, "utf-8"));
  tauriConf.version = packageVersion;
  if (tauriConf.package) tauriConf.package.version = packageVersion;
  writeFileSync(paths.tauri, `${JSON.stringify(tauriConf, null, 2)}\n`);

  let cargo = readFileSync(paths.cargo, "utf-8");
  cargo = cargo.replace(/^version = ".*"/m, `version = "${packageVersion}"`);
  writeFileSync(paths.cargo, cargo);

  writeFileSync(
    paths.appVersion,
    `export const APP_VERSION = "${packageVersion}";\nexport const APP_DISPLAY_VERSION = "${displayVersion}";\n`,
  );

  console.log(`✅ Package version: ${packageVersion}`);
  console.log(`✅ Display version: ${displayVersion}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  applyPackageVersions();
}
