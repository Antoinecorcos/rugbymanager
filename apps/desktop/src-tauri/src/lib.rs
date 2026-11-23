//! Desktop shell of Ovalie Manager (M8). The game itself is the web application (apps/game),
//! bundled as is: the shell only adds a native window and native file dialogs (save export and
//! import, editor corrections). Saves live in the webview's IndexedDB, in the app data folder.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("impossible de lancer Ovalie Manager");
}
