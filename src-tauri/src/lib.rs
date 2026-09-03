use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_sql::{Migration, MigrationKind};

mod anki;

const TRAY_ID: &str = "kanjiwidget-tray";

fn build_tray_menu<R: tauri::Runtime, M: Manager<R>>(
    manager: &M,
    language: &str,
) -> tauri::Result<Menu<R>> {
    let russian = language == "ru";
    let show = MenuItem::with_id(
        manager,
        "show",
        if russian {
            "Показать / скрыть виджет"
        } else {
            "Show / hide widget"
        },
        true,
        None::<&str>,
    )?;
    let next = MenuItem::with_id(
        manager,
        "next",
        if russian {
            "Следующая карточка"
        } else {
            "Next card"
        },
        true,
        None::<&str>,
    )?;
    let quiz = MenuItem::with_id(
        manager,
        "quiz",
        if russian {
            "Начать повторение"
        } else {
            "Start review"
        },
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(
        manager,
        "settings",
        if russian {
            "Настройки"
        } else {
            "Settings"
        },
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        manager,
        "quit",
        if russian { "Выход" } else { "Exit" },
        true,
        None::<&str>,
    )?;
    Menu::with_items(manager, &[&show, &next, &quiz, &settings, &quit])
}

fn toggle_widget(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn show_secondary_window(app: &AppHandle, label: &str) -> Result<(), String> {
    if !matches!(label, "quiz" | "settings") {
        return Err("Unknown application window".into());
    }
    if let Some(window) = app.get_webview_window(label) {
        window.show().map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        if label == "quiz" {
            window
                .emit("kanjiwidget:quiz-opened", ())
                .map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    let (title, width, height) = if label == "quiz" {
        ("KanjiWidget - Review", 940.0, 720.0)
    } else {
        ("KanjiWidget - Settings", 1040.0, 760.0)
    };

    let url = PathBuf::from(format!("index.html?view={label}"));
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(url))
        .title(title)
        .inner_size(width, height)
        .min_inner_size(760.0, 600.0)
        .center()
        .decorations(false)
        .resizable(true)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn spawn_secondary_window(app: &AppHandle, label: &'static str) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(error) = show_secondary_window(&app, label) {
            eprintln!("failed to open {label} window: {error}");
        }
    });
}

#[tauri::command]
async fn show_app_window(app: AppHandle, view: String) -> Result<(), String> {
    show_secondary_window(&app, &view)
}

#[tauri::command]
fn set_native_language(app: AppHandle, language: String) -> Result<(), String> {
    if !matches!(language.as_str(), "en" | "ru") {
        return Err("Unsupported interface language".into());
    }

    let menu = build_tray_menu(&app, &language).map_err(|error| error.to_string())?;
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "Application tray icon is unavailable".to_string())?;
    tray.set_menu(Some(menu))
        .map_err(|error| error.to_string())?;

    let russian = language == "ru";
    if let Some(window) = app.get_webview_window("quiz") {
        let _ = window.set_title(if russian {
            "KanjiWidget — Повторение"
        } else {
            "KanjiWidget — Review"
        });
    }
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_title(if russian {
            "KanjiWidget — Настройки"
        } else {
            "KanjiWidget — Settings"
        });
    }
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CardEditorRequest {
    deck_id: String,
    card_id: String,
}

fn validate_editor_id(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 512 {
        return Err("Invalid card identifier".into());
    }
    Ok(())
}

#[tauri::command]
async fn show_card_editor(app: AppHandle, deck_id: String, card_id: String) -> Result<(), String> {
    validate_editor_id(&deck_id)?;
    validate_editor_id(&card_id)?;
    let request = CardEditorRequest {
        deck_id: deck_id.clone(),
        card_id: card_id.clone(),
    };
    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        window
            .emit("kanjiwidget:edit-card", request)
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    let deck_query = url::form_urlencoded::byte_serialize(deck_id.as_bytes()).collect::<String>();
    let card_query = url::form_urlencoded::byte_serialize(card_id.as_bytes()).collect::<String>();
    let url = PathBuf::from(format!(
        "index.html?view=settings&section=decks&deckId={deck_query}&cardId={card_query}"
    ));
    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(url))
        .title("KanjiWidget - Settings")
        .inner_size(1040.0, 760.0)
        .min_inner_size(760.0, 600.0)
        .center()
        .decorations(false)
        .resizable(true)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn write_lockscreen_png(
    folder: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("The image is too large".into());
    }
    if !file_name.ends_with(".png")
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err("Invalid file name".into());
    }
    let directory = Path::new(&folder);
    if !directory.is_absolute() {
        return Err("The path must be absolute".into());
    }
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let output = directory.join(file_name);
    fs::write(&output, bytes).map_err(|error| error.to_string())?;
    Ok(output.to_string_lossy().into_owned())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

// SQLx hashes migration text byte-for-byte. Keep the original v1 literal
// unchanged so existing 1.0 installations can apply newer migrations.
#[rustfmt::skip]
fn database_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: r#"
            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS card_states (
                card_id TEXT PRIMARY KEY, due TEXT NOT NULL, stability REAL NOT NULL,
                difficulty REAL NOT NULL, elapsed_days INTEGER NOT NULL, scheduled_days INTEGER NOT NULL,
                learning_steps INTEGER NOT NULL DEFAULT 0, reps INTEGER NOT NULL, lapses INTEGER NOT NULL,
                state INTEGER NOT NULL, last_review TEXT
            );
            CREATE TABLE IF NOT EXISTS daily_pools (
                pool_key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS review_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL, rating INTEGER NOT NULL,
                reviewed_at TEXT NOT NULL, due TEXT NOT NULL
            );
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "custom_anki_decks",
            sql: r#"
                CREATE TABLE IF NOT EXISTS custom_decks (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    cards TEXT NOT NULL,
                    imported_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_decks_name ON custom_decks(name);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "editable_deck_cards",
            sql: r#"
                CREATE TABLE IF NOT EXISTS deck_card_overrides (
                    deck_id TEXT NOT NULL,
                    card_id TEXT NOT NULL,
                    card TEXT,
                    hidden INTEGER NOT NULL DEFAULT 0,
                    created INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (deck_id, card_id)
                );
                CREATE INDEX IF NOT EXISTS idx_deck_card_overrides_deck
                    ON deck_card_overrides(deck_id);
            "#,
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:kanjiwidget.db", database_migrations())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        spawn_secondary_window(app, "quiz");
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            write_lockscreen_png,
            quit_app,
            show_app_window,
            set_native_language,
            show_card_editor,
            anki::inspect_anki_package,
            anki::import_anki_cards
        ])
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            if let Some(window) = app.get_webview_window("main") {
                window.set_min_size(Some(LogicalSize::new(280.0, 270.0)))?;
                let size = window
                    .inner_size()?
                    .to_logical::<f64>(window.scale_factor()?);
                if size.height < 270.0 {
                    window.set_size(LogicalSize::new(size.width.max(280.0), 300.0))?;
                }
            }
            let menu = build_tray_menu(app, "en")?;

            let mut tray = TrayIconBuilder::with_id(TRAY_ID)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("KanjiWidget")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => toggle_widget(app),
                    "next" => {
                        let _ = app.emit("kanjiwidget:next-card", ());
                    }
                    "quiz" => {
                        spawn_secondary_window(app, "quiz");
                    }
                    "settings" => {
                        spawn_secondary_window(app, "settings");
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        toggle_widget(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            app.global_shortcut().register("Ctrl+Shift+J")?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                } else if window.label() == "quiz" {
                    let _ = window.emit("kanjiwidget:quiz-session-ended", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run KanjiWidget");
}

#[cfg(test)]
mod migration_tests {
    use sha2::{Digest, Sha384};

    use super::database_migrations;

    #[test]
    fn initial_migration_checksum_stays_compatible_with_v1() {
        let digest = Sha384::digest(database_migrations()[0].sql.as_bytes());
        let checksum = digest
            .iter()
            .map(|byte| format!("{byte:02X}"))
            .collect::<String>();
        assert_eq!(
            checksum,
            "834584C1AFE8A62E8FBD35102057D58A5CDC84B44FA160F671557E5C4B7AC01A699A2DD5A32DBCC285677B297CE13722"
        );
    }

    #[test]
    fn editable_cards_migration_keeps_expected_schema() {
        let migrations = database_migrations();
        assert_eq!(migrations.len(), 3);
        assert_eq!(migrations[2].version, 3);
        assert_eq!(migrations[2].description, "editable_deck_cards");
        assert!(migrations[2].sql.contains("deck_card_overrides"));
        assert!(migrations[2].sql.contains("PRIMARY KEY (deck_id, card_id)"));
    }
}
