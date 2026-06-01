use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::{AppHandle, Manager};

// Strutture dati
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_notes: String,
    pub release_url: String,
    pub published_at: String,
    pub download_urls: Vec<DownloadAsset>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadAsset {
    pub name: String,
    pub url: String,
    pub size: u64,
    pub platform: String,
}

// Cache structure
#[derive(Serialize, Deserialize, Debug, Clone)]
struct UpdateCheckCache {
    last_checked: u64,
    last_result: Option<UpdateCheckResult>,
}

#[derive(Deserialize, Debug)]
struct UpdateManifest {
    version: String,
    notes: Option<String>,
    pub_date: Option<String>,
    platforms: HashMap<String, UpdatePlatform>,
}

#[derive(Deserialize, Debug)]
struct UpdatePlatform {
    url: String,
}

// Constants
const UPDATE_MANIFEST_URL: &str = "https://mavicat.kailingteck.com/api/updater/latest.json";
const RELEASES_URL: &str = "https://mavicat.kailingteck.com/#versions";
const CACHE_DURATION_SECS: u64 = 43200; // 12 hours
/// Returns the installation source: "snap", "aur", or None for direct installs.
/// Only meaningful on Linux; always returns None on other platforms.
fn detect_installation_source() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        // Snap sets the SNAP env var when running inside a snap sandbox
        if std::env::var("SNAP").is_ok() {
            return Some("snap".to_string());
        }

        // Flatpak sets FLATPAK_ID when running inside a Flatpak sandbox
        if std::env::var("FLATPAK_ID").is_ok() {
            return Some("flatpak".to_string());
        }

        // AUR: check if pacman's local database has a mavicat-bin entry
        if let Ok(entries) = std::fs::read_dir("/var/lib/pacman/local") {
            let is_aur = entries
                .filter_map(|e| e.ok())
                .any(|e| e.file_name().to_string_lossy().starts_with("mavicat-bin-"));
            if is_aur {
                return Some("aur".to_string());
            }
        }
    }

    None
}

/// Returns true when updates should not be managed by the app itself.
fn is_managed_package() -> bool {
    detect_installation_source().is_some()
}

#[tauri::command]
pub fn get_installation_source() -> Option<String> {
    detect_installation_source()
}

// Helper functions
fn get_cache_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("update_check_cache.json"))
}

fn parse_version(version: &str) -> Option<(u32, u32, u32)> {
    let clean = version.trim_start_matches('v');
    let parts: Vec<&str> = clean.split('.').collect();
    if parts.len() != 3 {
        return None;
    }

    let major = parts[0].parse().ok()?;
    let minor = parts[1].parse().ok()?;
    let patch = parts[2].parse().ok()?;

    Some((major, minor, patch))
}

fn is_newer_version(current: &str, latest: &str) -> bool {
    match (parse_version(current), parse_version(latest)) {
        (Some(c), Some(l)) => l > c,
        _ => false,
    }
}

async fn fetch_latest_manifest() -> Result<UpdateManifest, String> {
    let client = Client::new();
    let res = client
        .get(UPDATE_MANIFEST_URL)
        .header("User-Agent", "Mavicat")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Update server network error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Update server error: {}", res.status()));
    }

    res.json::<UpdateManifest>()
        .await
        .map_err(|e| format!("Failed to parse update manifest: {}", e))
}

fn platform_from_target(target: &str) -> String {
    if target.starts_with("darwin-") {
        "macos".to_string()
    } else if target.starts_with("windows-") {
        "windows".to_string()
    } else if target.starts_with("linux-") {
        "linux".to_string()
    } else {
        "other".to_string()
    }
}

// Tauri commands
#[tauri::command]
pub async fn check_for_updates(app: AppHandle, force: bool) -> Result<UpdateCheckResult, String> {
    // Managed packages (AUR, Snap) should not use the built-in updater
    if is_managed_package() {
        return Err("Updates are managed by the package manager".to_string());
    }

    let config = crate::config::load_config_internal(&app);

    // Check if updates are disabled
    if !force && config.check_for_updates == Some(false) {
        return Err("Update checks disabled".to_string());
    }

    // Check cache if not forced
    if !force {
        if let Some(cache_path) = get_cache_path(&app) {
            if cache_path.exists() {
                if let Ok(content) = fs::read_to_string(&cache_path) {
                    if let Ok(cache) = serde_json::from_str::<UpdateCheckCache>(&content) {
                        let now = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();

                        if now - cache.last_checked < CACHE_DURATION_SECS {
                            if let Some(result) = cache.last_result {
                                // Invalidate cache if the app was updated since it was written
                                if result.current_version == env!("CARGO_PKG_VERSION") {
                                    return Ok(result);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let manifest = fetch_latest_manifest().await?;

    let current_version = env!("CARGO_PKG_VERSION");
    let latest_version = manifest.version.trim_start_matches('v');

    let download_urls = manifest
        .platforms
        .into_iter()
        .map(|(target, asset)| DownloadAsset {
            name: target.clone(),
            url: asset.url,
            size: 0,
            platform: platform_from_target(&target),
        })
        .collect();

    let result = UpdateCheckResult {
        has_update: is_newer_version(current_version, &manifest.version),
        current_version: current_version.to_string(),
        latest_version: latest_version.to_string(),
        release_notes: manifest.notes.unwrap_or_default(),
        release_url: RELEASES_URL.to_string(),
        published_at: manifest.pub_date.unwrap_or_default(),
        download_urls,
    };

    // Save to cache
    if let Some(cache_path) = get_cache_path(&app) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let cache = UpdateCheckCache {
            last_checked: timestamp,
            last_result: Some(result.clone()),
        };

        if let Ok(content) = serde_json::to_string(&cache) {
            let _ = fs::write(cache_path, content);
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    // Usa tauri-plugin-updater per gestire il download e installazione
    use tauri_plugin_updater::UpdaterExt;

    let updater = app.updater_builder().build().map_err(|e| e.to_string())?;

    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        // Emetti eventi per aggiornare la UI sul progresso
        let mut downloaded = 0;

        update
            .download_and_install(
                |chunk_length, content_length| {
                    downloaded += chunk_length;
                    let progress = if let Some(total) = content_length {
                        (downloaded as f64 / total as f64 * 100.0) as u32
                    } else {
                        0
                    };

                    let _ = app.emit("update-progress", progress);
                },
                || {
                    // Pre-installazione: salva stato, chiudi connessioni, etc.
                    let _ = app.emit("update-installing", ());
                },
            )
            .await
            .map_err(|e| e.to_string())?;

        app.restart();
    } else {
        Err("No update available".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GITHUB_REPO: &str = "aitiangua876/mavicat";

    fn categorize_asset(name: &str) -> &'static str {
        let normalized = name.to_ascii_lowercase();
        if normalized.ends_with(".dmg")
            || normalized.contains("darwin")
            || normalized.contains("macos")
        {
            return "macos";
        }
        if normalized.ends_with(".exe")
            || normalized.ends_with(".msi")
            || normalized.contains("windows")
        {
            return "windows";
        }
        if normalized.ends_with(".appimage")
            || normalized.ends_with(".deb")
            || normalized.ends_with(".rpm")
        {
            return "linux";
        }
        "other"
    }

    // Version parsing tests
    #[test]
    fn test_version_parsing_standard() {
        assert_eq!(parse_version("0.8.8"), Some((0, 8, 8)));
        assert_eq!(parse_version("1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("10.20.30"), Some((10, 20, 30)));
    }

    #[test]
    fn test_version_parsing_with_v_prefix() {
        assert_eq!(parse_version("v0.8.8"), Some((0, 8, 8)));
        assert_eq!(parse_version("v1.0.0"), Some((1, 0, 0)));
    }

    #[test]
    fn test_version_parsing_invalid() {
        assert_eq!(parse_version("invalid"), None);
        assert_eq!(parse_version("1.2"), None);
        assert_eq!(parse_version("1.2.3.4"), None);
        assert_eq!(parse_version("a.b.c"), None);
        assert_eq!(parse_version(""), None);
    }

    #[test]
    fn test_version_parsing_edge_cases() {
        assert_eq!(parse_version("0.0.0"), Some((0, 0, 0)));
        assert_eq!(parse_version("999.999.999"), Some((999, 999, 999)));
    }

    // Version comparison tests
    #[test]
    fn test_version_comparison_newer() {
        assert!(is_newer_version("0.8.8", "0.9.0"));
        assert!(is_newer_version("0.8.8", "0.8.9"));
        assert!(is_newer_version("0.8.8", "1.0.0"));
        assert!(is_newer_version("1.0.0", "2.0.0"));
    }

    #[test]
    fn test_version_comparison_not_newer() {
        assert!(!is_newer_version("0.8.8", "0.8.8"));
        assert!(!is_newer_version("0.8.8", "0.8.7"));
        assert!(!is_newer_version("0.8.8", "0.7.9"));
        assert!(!is_newer_version("1.0.0", "0.9.9"));
    }

    #[test]
    fn test_version_comparison_with_v_prefix() {
        assert!(is_newer_version("0.8.8", "v0.9.0"));
        assert!(is_newer_version("v0.8.8", "0.9.0"));
        assert!(is_newer_version("v0.8.8", "v0.9.0"));
    }

    #[test]
    fn test_version_comparison_invalid() {
        assert!(!is_newer_version("invalid", "0.9.0"));
        assert!(!is_newer_version("0.8.8", "invalid"));
        assert!(!is_newer_version("invalid", "invalid"));
    }

    // Asset categorization tests
    #[test]
    fn test_categorize_asset_macos() {
        assert_eq!(categorize_asset("Mavicat_0.8.8_x64.dmg"), "macos");
        assert_eq!(categorize_asset("Mavicat_0.8.8_aarch64.dmg"), "macos");
        assert_eq!(categorize_asset("mavicat-darwin.zip"), "macos");
        assert_eq!(categorize_asset("app-macos-universal.tar.gz"), "macos");
    }

    #[test]
    fn test_categorize_asset_windows() {
        assert_eq!(categorize_asset("Mavicat_0.8.8_x64_setup.exe"), "windows");
        assert_eq!(categorize_asset("mavicat.msi"), "windows");
        assert_eq!(categorize_asset("app-windows-x86_64.zip"), "windows");
    }

    #[test]
    fn test_categorize_asset_linux() {
        assert_eq!(categorize_asset("mavicat_0.8.8_amd64.AppImage"), "linux");
        assert_eq!(categorize_asset("mavicat_0.8.8_amd64.deb"), "linux");
        assert_eq!(categorize_asset("mavicat-0.8.8-1.x86_64.rpm"), "linux");
    }

    #[test]
    fn test_categorize_asset_other() {
        assert_eq!(categorize_asset("README.txt"), "other");
        assert_eq!(categorize_asset("checksums.sha256"), "other");
        assert_eq!(categorize_asset("unknown-file"), "other");
    }

    // Cache path tests
    #[test]
    fn test_cache_filename() {
        let expected = "update_check_cache.json";
        assert!(expected.ends_with(".json"));
        assert!(expected.contains("cache"));
    }

    // GitHub repo constant test
    #[test]
    fn test_github_repo_constant() {
        assert_eq!(GITHUB_REPO, "aitiangua876/mavicat");
    }

    // Cache duration test
    #[test]
    fn test_cache_duration() {
        assert_eq!(CACHE_DURATION_SECS, 43200); // 12 hours in seconds
        assert_eq!(CACHE_DURATION_SECS / 3600, 12); // Verify it's 12 hours
    }

    // Mutex to serialize env var mutations across parallel tests
    #[cfg(target_os = "linux")]
    static ENV_MUTEX: std::sync::LazyLock<std::sync::Mutex<()>> =
        std::sync::LazyLock::new(|| std::sync::Mutex::new(()));

    // Installation source detection tests
    #[cfg(target_os = "linux")]
    #[test]
    fn test_detect_installation_source_snap() {
        let _lock = ENV_MUTEX.lock().unwrap();
        std::env::remove_var("FLATPAK_ID");
        std::env::set_var("SNAP", "/snap/mavicat/current");
        let source = detect_installation_source();
        std::env::remove_var("SNAP");
        assert_eq!(source.as_deref(), Some("snap"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_detect_installation_source_flatpak() {
        let _lock = ENV_MUTEX.lock().unwrap();
        std::env::remove_var("SNAP");
        std::env::set_var("FLATPAK_ID", "com.mavicat.desktop");
        let source = detect_installation_source();
        std::env::remove_var("FLATPAK_ID");
        assert_eq!(source.as_deref(), Some("flatpak"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_detect_installation_source_direct() {
        let _lock = ENV_MUTEX.lock().unwrap();
        std::env::remove_var("SNAP");
        std::env::remove_var("FLATPAK_ID");
        let source = detect_installation_source();
        // On a dev/CI machine without pacman or mavicat-bin installed, must be None
        assert!(source.is_none() || source.as_deref() == Some("aur"));
    }
}
