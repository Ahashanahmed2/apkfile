#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ১. SQL প্লাগইন রেজিস্টার করুন
        .plugin(tauri_plugin_sql::Builder::default().build())
        // ২. অ্যাপ চালু হওয়ার সময় ডেটাবেস কপি করার সেটআপ
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("AppData ডিরেক্টরি পাওয়া যায়নি");
            let target_db = app_data_dir.join("tafsir.db");

            // যদি ডেটাবেস আগে থেকে না থাকে, তবে রিসোর্স থেকে কপি করুন
            if !target_db.exists() {
                // রিসোর্স ডিরেক্টরি থেকে tafsir.db এর পাথ বের করুন
                let resource_db = app.path()
                    .resolve("tafsir.db", tauri::path::BaseDirectory::Resource)
                    .expect("রিসোর্স ডেটাবেস পাওয়া যায়নি");
                
                // AppData ডিরেক্টরি তৈরি করুন এবং ফাইল কপি করুন
                fs::create_dir_all(&app_data_dir).ok();
                fs::copy(resource_db, &target_db).expect("ডেটাবেস কপি ব্যর্থ হয়েছে");
                println!("✅ ডেটাবেস সফলভাবে AppData-তে কপি হয়েছে।");
            } else {
                println!("ℹ️ ডেটাবেস ইতিমধ্যে AppData-তে বিদ্যমান আছে।");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ডেস্কটপ এন্ট্রি পয়েন্ট
#[cfg(not(mobile))]
fn main() {
    run();
}