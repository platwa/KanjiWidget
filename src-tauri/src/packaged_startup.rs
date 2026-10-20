#[tauri::command]
pub async fn packaged_autostart(enabled: Option<bool>) -> Result<Option<bool>, String> {
    tauri::async_runtime::spawn_blocking(move || configure(enabled))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(not(windows))]
fn configure(_enabled: Option<bool>) -> Result<Option<bool>, String> {
    Ok(None)
}

#[cfg(windows)]
fn configure(enabled: Option<bool>) -> Result<Option<bool>, String> {
    use windows::ApplicationModel::{Package, StartupTask, StartupTaskState};
    use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

    // The worker thread needs a WinRT apartment before accessing StartupTask.
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(|error| error.to_string())?;
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe { RoUninitialize() };
        }
    }
    let _apartment = Apartment;
    match Package::Current() {
        Ok(_) => {}
        Err(error) if error.code() == windows::core::HRESULT::from_win32(15700) => {
            return Ok(None);
        }
        Err(error) => return Err(error.to_string()),
    }
    let task = StartupTask::GetAsync(&windows::core::HSTRING::from("KanjiWidgetStartup"))
        .and_then(|operation| operation.get())
        .map_err(|error| error.to_string())?;
    match enabled {
        Some(true) => {
            let state = task
                .RequestEnableAsync()
                .and_then(|operation| operation.get())
                .map_err(|error| error.to_string())?;
            if state != StartupTaskState::Enabled {
                return Err("Автозапуск отключён в Windows. Включите KanjiWidget в Параметры → Приложения → Автозагрузка.".into());
            }
        }
        Some(false) => task.Disable().map_err(|error| error.to_string())?,
        None => {}
    }
    task.State()
        .map(|state| Some(state == StartupTaskState::Enabled))
        .map_err(|error| error.to_string())
}
