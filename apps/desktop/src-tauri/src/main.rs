// Ovalie Manager, desktop application: hides the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ovalie_manager_lib::run()
}
