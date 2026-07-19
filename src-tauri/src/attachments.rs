use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub fn write_temp_attachment(name: String, data_b64: String) -> Result<String, String> {
    let bytes = general_purpose::STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|e| e.to_string())?;

    let safe_name = Path::new(&name)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "attachment".to_string());

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    let mut dir: PathBuf = std::env::temp_dir();
    dir.push("vault-notes-attachments");
    dir.push(nanos.to_string());
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut path = dir;
    path.push(safe_name);
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_attachment_to_path(dest_path: String, data_b64: String) -> Result<(), String> {
    let bytes = general_purpose::STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|e| e.to_string())?;
    fs::write(&dest_path, &bytes).map_err(|e| e.to_string())
}
