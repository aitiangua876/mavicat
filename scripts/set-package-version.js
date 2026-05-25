import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const paths = {
  package: resolve("package.json"),
  tauri: resolve("src-tauri/tauri.conf.json"),
  cargo: resolve("src-tauri/Cargo.toml"),
  appVersion: resolve("src/version.ts"),
};

function currentDateStamp() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date()).replaceAll("-", "");
}

export function buildPackageVersions(dateStamp = currentDateStamp()) {
  return {
    packageVersion: `1.0.0-${dateStamp}`,
    displayVersion: `v1.0-${dateStamp}`,
  };
}

const { packageVersion, displayVersion } = buildPackageVersions();

function applyPackageVersions() {
  const pkg = JSON.parse(readFileSync(paths.package, "utf-8"));
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
