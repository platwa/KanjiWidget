use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Debug, Deserialize)]
pub struct CardState {
    card_id: String,
    due: String,
    stability: f64,
    difficulty: f64,
    elapsed_days: i64,
    scheduled_days: i64,
    learning_steps: i64,
    reps: i64,
    lapses: i64,
    state: i64,
    last_review: Option<String>,
}

async fn pool(instances: &DbInstances) -> Result<SqlitePool, String> {
    instances
        .0
        .read()
        .await
        .get("sqlite:kanjiwidget.db")
        .map(|database| match database {
            DbPool::Sqlite(pool) => pool.clone(),
        })
        .ok_or_else(|| "Database is not initialized".to_string())
}

async fn persist_review(
    pool: &SqlitePool,
    state: CardState,
    rating: u8,
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    sqlx::query("INSERT INTO card_states
        (card_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(card_id) DO UPDATE SET due=excluded.due, stability=excluded.stability,
        difficulty=excluded.difficulty, elapsed_days=excluded.elapsed_days,
        scheduled_days=excluded.scheduled_days, learning_steps=excluded.learning_steps,
        reps=excluded.reps, lapses=excluded.lapses, state=excluded.state, last_review=excluded.last_review")
        .bind(&state.card_id).bind(&state.due).bind(state.stability).bind(state.difficulty)
        .bind(state.elapsed_days).bind(state.scheduled_days).bind(state.learning_steps)
        .bind(state.reps).bind(state.lapses).bind(state.state).bind(&state.last_review)
        .execute(&mut *transaction).await?;
    sqlx::query("INSERT INTO review_logs (card_id, rating, reviewed_at, due) VALUES (?,?,?,?)")
        .bind(&state.card_id)
        .bind(rating)
        .bind(&state.last_review)
        .bind(&state.due)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await
}

#[tauri::command]
pub async fn save_review(
    instances: State<'_, DbInstances>,
    state: CardState,
    rating: u8,
) -> Result<(), String> {
    if !(1..=4).contains(&rating) || state.last_review.is_none() {
        return Err("Invalid review".into());
    }
    persist_review(&pool(&instances).await?, state, rating)
        .await
        .map_err(|error| error.to_string())
}

async fn clear_progress(
    pool: &SqlitePool,
    deck_id: &str,
    card_ids: &[String],
    remove_deck: bool,
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    for id in card_ids {
        sqlx::query("DELETE FROM card_states WHERE card_id = ?")
            .bind(id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query("DELETE FROM review_logs WHERE card_id = ?")
            .bind(id)
            .execute(&mut *transaction)
            .await?;
    }
    let prefix = format!("{deck_id}:");
    sqlx::query("DELETE FROM daily_pools WHERE substr(pool_key, 1, length(?)) = ?")
        .bind(&prefix)
        .bind(&prefix)
        .execute(&mut *transaction)
        .await?;
    if remove_deck {
        // Also remove progress from older versions of an imported deck.
        for table in ["card_states", "review_logs"] {
            sqlx::query(&format!(
                "DELETE FROM {table} WHERE substr(card_id, 1, length(?)) = ?"
            ))
            .bind(&prefix)
            .bind(&prefix)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query("DELETE FROM deck_card_overrides WHERE deck_id = ?")
            .bind(deck_id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query("DELETE FROM custom_decks WHERE id = ?")
            .bind(deck_id)
            .execute(&mut *transaction)
            .await?;
    }
    transaction.commit().await
}

#[tauri::command]
pub async fn clear_deck_progress(
    instances: State<'_, DbInstances>,
    deck_id: String,
    card_ids: Vec<String>,
    remove_deck: bool,
) -> Result<(), String> {
    if remove_deck && !deck_id.starts_with("anki-") {
        return Err("Cannot delete a built-in deck".into());
    }
    clear_progress(&pool(&instances).await?, &deck_id, &card_ids, remove_deck)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Executor;

    async fn database() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        for migration in crate::database_migrations() {
            pool.execute(migration.sql).await.unwrap();
        }
        pool
    }

    fn state() -> CardState {
        CardState {
            card_id: "test".into(),
            due: "2026-10-01T00:00:00Z".into(),
            stability: 1.0,
            difficulty: 5.0,
            elapsed_days: 0,
            scheduled_days: 1,
            learning_steps: 0,
            reps: 1,
            lapses: 0,
            state: 2,
            last_review: Some("2026-09-22T00:00:00Z".into()),
        }
    }

    #[test]
    fn review_and_log_commit_together_and_roll_back_on_failure() {
        tauri::async_runtime::block_on(async {
            let pool = database().await;
            persist_review(&pool, state(), 4).await.unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM review_logs")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                1
            );
            pool.execute("CREATE TRIGGER reject_log BEFORE INSERT ON review_logs BEGIN SELECT RAISE(ABORT, 'test failure'); END").await.unwrap();
            let mut updated = state();
            updated.reps = 2;
            assert!(persist_review(&pool, updated, 3).await.is_err());
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT reps FROM card_states WHERE card_id = 'test'")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                1
            );
        });
    }

    #[test]
    fn failed_reset_keeps_progress_and_successful_reset_is_isolated() {
        tauri::async_runtime::block_on(async {
            let pool = database().await;
            persist_review(&pool, state(), 4).await.unwrap();
            pool.execute("INSERT INTO daily_pools VALUES ('first:today','{}','now'),('second:today','{}','now')").await.unwrap();
            pool.execute("CREATE TRIGGER reject_delete BEFORE DELETE ON review_logs BEGIN SELECT RAISE(ABORT, 'test failure'); END").await.unwrap();
            assert!(clear_progress(&pool, "first", &["test".into()], false)
                .await
                .is_err());
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM card_states")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                1
            );
            pool.execute("DROP TRIGGER reject_delete").await.unwrap();
            clear_progress(&pool, "first", &["test".into()], false)
                .await
                .unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, String>("SELECT pool_key FROM daily_pools")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                "second:today"
            );
        });
    }
}
