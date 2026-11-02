#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;

struct CounterState(Mutex<i32>);

#[tauri::command]
fn increment(state: tauri::State<CounterState>, value: i32) -> i32 {
    let mut c = state.0.lock().unwrap();
    *c += value;
    *c
}

fn note_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    let dir = app.path().app_data_dir().expect("no app data dir");
    std::fs::create_dir_all(&dir).ok();
    dir.join("note.txt")
}

#[tauri::command]
fn save_note(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let path = note_path(&app);
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_note(app: tauri::AppHandle) -> Result<String, String> {
    let path = note_path(&app);
    if path.exists() {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CounterState(Mutex::new(0)))
        .invoke_handler(tauri::generate_handler![increment, save_note, load_note])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ডেস্কটপ এন্ট্রি পয়েন্ট (main ফাংশন)
#[cfg(not(mobile))]
fn main() {
    run();
}
