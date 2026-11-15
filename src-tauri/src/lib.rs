#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use tauri::Manager;

#[tauri::command]
fn get_file_size(path: String) -> u64 {
    if let Ok(metadata) = fs::metadata(&path) {
        metadata.len()
    } else {
        0
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ১. প্লাগইনসমূহ রেজিস্টার করা
        .plugin(tauri_plugin_download::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_android_installer::init())
        // ২. আপডেট চেক করার কমান্ড রেজিস্টার করা
        .invoke_handler(tauri::generate_handler![get_file_size])
        // ৩. ব্যাক বাটন হ্যান্ডেল করা (১০)
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close(); // ফোনের ব্যাক বাটনে অ্যাপ বন্ধ হবে না
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(mobile))]
fn main() {
    run();
}
