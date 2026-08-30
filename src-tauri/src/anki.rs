use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;

use regex::{Captures, Regex};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
use sqlx::{Connection, Row};
use tempfile::NamedTempFile;
use zip::ZipArchive;

const MAX_COLLECTION_BYTES: u64 = 256 * 1024 * 1024;
const MAX_FIELD_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiPackagePreview {
    pub deck_name: String,
    pub format: String,
    pub total_notes: usize,
    pub note_types: Vec<AnkiNoteTypePreview>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiNoteTypePreview {
    pub id: String,
    pub name: String,
    pub fields: Vec<String>,
    pub note_count: usize,
    pub suggested: AnkiFieldMapping,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiFieldMapping {
    pub note_type_id: String,
    pub headword_field: Option<usize>,
    pub reading_field: Option<usize>,
    pub meaning_field: Option<usize>,
    pub sentence_field: Option<usize>,
    pub sentence_reading_field: Option<usize>,
    pub sentence_meaning_field: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAnkiCard {
    pub source_id: String,
    pub headword: String,
    pub reading: String,
    pub meaning: String,
    pub sentence: String,
    pub sentence_reading: String,
    pub sentence_meaning: String,
}

#[derive(Debug)]
struct NoteType {
    id: i64,
    name: String,
    fields: Vec<String>,
    note_count: usize,
}

struct ExtractedCollection {
    file: NamedTempFile,
    format: &'static str,
}

fn extract_collection(package_path: &str) -> Result<ExtractedCollection, String> {
    let path = Path::new(package_path);
    if !path.is_absolute() || !path.is_file() {
        return Err("Файл Anki не найден".into());
    }
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("apkg"))
    {
        return Err("Поддерживаются только колоды .apkg".into());
    }

    let source = File::open(path).map_err(|error| format!("Не удалось открыть .apkg: {error}"))?;
    let mut archive =
        ZipArchive::new(source).map_err(|_| "Повреждённый архив .apkg".to_string())?;
    let names: Vec<String> = archive.file_names().map(str::to_owned).collect();
    let (entry_name, format, compressed) = if names.iter().any(|name| name == "collection.anki21b")
    {
        ("collection.anki21b", "Anki 2.1.50+", true)
    } else if names.iter().any(|name| name == "collection.anki21") {
        ("collection.anki21", "Anki 2.1", false)
    } else if names.iter().any(|name| name == "collection.anki2") {
        ("collection.anki2", "Anki legacy", false)
    } else {
        return Err("В архиве нет коллекции Anki".into());
    };

    let mut entry = archive
        .by_name(entry_name)
        .map_err(|_| "Не удалось прочитать коллекцию Anki".to_string())?;
    if !compressed && entry.size() > MAX_COLLECTION_BYTES {
        return Err("Коллекция Anki слишком велика".into());
    }

    let mut output = NamedTempFile::new().map_err(|error| error.to_string())?;
    if compressed {
        let mut decoder = zstd::stream::read::Decoder::new(entry)
            .map_err(|_| "Не удалось распаковать современную коллекцию Anki".to_string())?;
        io::copy(
            &mut decoder.by_ref().take(MAX_COLLECTION_BYTES + 1),
            &mut output,
        )
        .map_err(|error| error.to_string())?;
    } else {
        io::copy(
            &mut entry.by_ref().take(MAX_COLLECTION_BYTES + 1),
            &mut output,
        )
        .map_err(|error| error.to_string())?;
    }
    output.flush().map_err(|error| error.to_string())?;
    if output
        .as_file()
        .metadata()
        .map_err(|error| error.to_string())?
        .len()
        > MAX_COLLECTION_BYTES
    {
        return Err("Коллекция Anki слишком велика".into());
    }

    let mut header = [0_u8; 16];
    output
        .as_file_mut()
        .seek(SeekFrom::Start(0))
        .and_then(|_| output.as_file_mut().read_exact(&mut header))
        .map_err(|_| "Коллекция Anki обрезана".to_string())?;
    if &header != b"SQLite format 3\0" {
        return Err("В .apkg находится неподдерживаемый формат коллекции".into());
    }
    Ok(ExtractedCollection {
        file: output,
        format,
    })
}

async fn open_collection(collection: &ExtractedCollection) -> Result<SqliteConnection, String> {
    let options = SqliteConnectOptions::new()
        .filename(collection.file.path())
        .read_only(true)
        .immutable(true);
    SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| format!("Не удалось прочитать базу Anki: {error}"))
}

async fn table_exists(connection: &mut SqliteConnection, name: &str) -> Result<bool, String> {
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?")
            .bind(name)
            .fetch_one(connection)
            .await
            .map_err(|error| error.to_string())?;
    Ok(count > 0)
}

async fn load_note_types(connection: &mut SqliteConnection) -> Result<Vec<NoteType>, String> {
    let count_rows = sqlx::query("SELECT mid, COUNT(*) AS note_count FROM notes GROUP BY mid")
        .fetch_all(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    let counts: HashMap<i64, usize> = count_rows
        .into_iter()
        .filter_map(|row| {
            Some((
                row.try_get::<i64, _>("mid").ok()?,
                row.try_get::<i64, _>("note_count").ok()? as usize,
            ))
        })
        .collect();

    if table_exists(connection, "notetypes").await? && table_exists(connection, "fields").await? {
        let rows = sqlx::query("SELECT id, name FROM notetypes ORDER BY name")
            .fetch_all(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
        let mut result = Vec::new();
        for row in rows {
            let id: i64 = row.try_get("id").map_err(|error| error.to_string())?;
            let fields = sqlx::query("SELECT name FROM fields WHERE ntid = ? ORDER BY ord")
                .bind(id)
                .fetch_all(&mut *connection)
                .await
                .map_err(|error| error.to_string())?
                .into_iter()
                .filter_map(|field| field.try_get::<String, _>("name").ok())
                .collect();
            result.push(NoteType {
                id,
                name: row.try_get("name").map_err(|error| error.to_string())?,
                fields,
                note_count: *counts.get(&id).unwrap_or(&0),
            });
        }
        return Ok(result);
    }

    let models: String = sqlx::query_scalar("SELECT models FROM col LIMIT 1")
        .fetch_one(&mut *connection)
        .await
        .map_err(|error| format!("В коллекции Anki нет описания полей: {error}"))?;
    let value: Value =
        serde_json::from_str(&models).map_err(|_| "Повреждены типы заметок Anki".to_string())?;
    let mut result = Vec::new();
    if let Some(models) = value.as_object() {
        for (fallback_id, model) in models {
            let id = model
                .get("id")
                .and_then(Value::as_i64)
                .or_else(|| fallback_id.parse().ok())
                .unwrap_or_default();
            let mut ordered: Vec<(usize, String)> = model
                .get("flds")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|field| {
                    Some((
                        field.get("ord").and_then(Value::as_u64)? as usize,
                        field.get("name").and_then(Value::as_str)?.to_string(),
                    ))
                })
                .collect();
            ordered.sort_by_key(|item| item.0);
            result.push(NoteType {
                id,
                name: model
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("Заметки Anki")
                    .to_string(),
                fields: ordered.into_iter().map(|item| item.1).collect(),
                note_count: *counts.get(&id).unwrap_or(&0),
            });
        }
    }
    Ok(result)
}

async fn best_deck_name(connection: &mut SqliteConnection, fallback: &str) -> String {
    if table_exists(connection, "decks").await.unwrap_or(false) {
        if let Ok(row) = sqlx::query(
            "SELECT d.name, COUNT(DISTINCT c.nid) AS amount FROM decks d JOIN cards c ON c.did = d.id GROUP BY d.id ORDER BY amount DESC LIMIT 1",
        )
        .fetch_one(&mut *connection)
        .await
        {
            if let Ok(name) = row.try_get::<String, _>("name") {
                return name.replace("::", " / ");
            }
        }
    }
    if let Ok(decks) = sqlx::query_scalar::<_, String>("SELECT decks FROM col LIMIT 1")
        .fetch_one(&mut *connection)
        .await
    {
        if let Ok(Value::Object(items)) = serde_json::from_str::<Value>(&decks) {
            if let Some(name) = items
                .values()
                .filter_map(|deck| deck.get("name").and_then(Value::as_str))
                .find(|name| *name != "Default")
            {
                return name.replace("::", " / ");
            }
        }
    }
    fallback.to_string()
}

fn normalized_field_name(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric() || !character.is_ascii())
        .collect()
}

fn find_field(fields: &[String], patterns: &[&str], rejected: &[&str]) -> Option<usize> {
    let normalized: Vec<String> = fields
        .iter()
        .map(|field| normalized_field_name(field))
        .collect();
    for exact in [true, false] {
        for pattern in patterns {
            let pattern = normalized_field_name(pattern);
            if let Some(index) = normalized.iter().position(|field| {
                let rejected = rejected
                    .iter()
                    .any(|item| field.contains(&normalized_field_name(item)));
                !rejected
                    && if exact {
                        field == &pattern
                    } else {
                        field.contains(&pattern)
                    }
            }) {
                return Some(index);
            }
        }
    }
    None
}

fn suggest_mapping(note_type_id: i64, fields: &[String]) -> AnkiFieldMapping {
    AnkiFieldMapping {
        note_type_id: note_type_id.to_string(),
        headword_field: find_field(
            fields,
            &[
                "kanji",
                "expression",
                "word",
                "vocabulary",
                "japanese",
                "front",
                "漢字",
                "単語",
                "表記",
                "слово",
                "вопрос",
            ],
            &[
                "sentence",
                "example",
                "reading",
                "meaning",
                "предлож",
                "пример",
                "чтение",
                "значение",
            ],
        ),
        reading_field: find_field(
            fields,
            &[
                "reading",
                "kana",
                "furigana",
                "pronunciation",
                "読み",
                "よみ",
                "чтение",
            ],
            &["sentence", "example", "предлож", "пример"],
        ),
        meaning_field: find_field(
            fields,
            &[
                "meaning",
                "translation",
                "definition",
                "russian",
                "back",
                "значение",
                "перевод",
                "ответ",
            ],
            &["sentence", "example", "предлож", "пример"],
        ),
        sentence_field: find_field(
            fields,
            &[
                "sentence",
                "example",
                "context",
                "例文",
                "пример",
                "предложение",
            ],
            &[
                "reading",
                "kana",
                "meaning",
                "translation",
                "перевод",
                "чтение",
            ],
        ),
        sentence_reading_field: find_field(
            fields,
            &[
                "sentencereading",
                "sentencekana",
                "examplefurigana",
                "例文読み",
                "чтениепредложения",
            ],
            &[],
        ),
        sentence_meaning_field: find_field(
            fields,
            &[
                "sentencemeaning",
                "sentencetranslation",
                "exampletranslation",
                "例文訳",
                "переводпредложения",
            ],
            &[],
        ),
    }
}

#[tauri::command]
pub async fn inspect_anki_package(path: String) -> Result<AnkiPackagePreview, String> {
    let collection = extract_collection(&path)?;
    let mut connection = open_collection(&collection).await?;
    let mut note_types = load_note_types(&mut connection).await?;
    note_types.retain(|note_type| note_type.note_count > 0 && !note_type.fields.is_empty());
    note_types.sort_by_key(|note_type| std::cmp::Reverse(note_type.note_count));
    if note_types.is_empty() {
        return Err("В колоде нет заметок с доступными полями".into());
    }
    let fallback = Path::new(&path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Импорт Anki");
    let deck_name = best_deck_name(&mut connection, fallback).await;
    let total_notes = note_types
        .iter()
        .map(|note_type| note_type.note_count)
        .sum();
    Ok(AnkiPackagePreview {
        deck_name,
        format: collection.format.to_string(),
        total_notes,
        note_types: note_types
            .into_iter()
            .map(|note_type| AnkiNoteTypePreview {
                id: note_type.id.to_string(),
                name: note_type.name,
                suggested: suggest_mapping(note_type.id, &note_type.fields),
                fields: note_type.fields,
                note_count: note_type.note_count,
            })
            .collect(),
    })
}

fn strip_tags(value: &str) -> String {
    let tags = Regex::new(r"(?is)<[^>]*>").expect("valid tag regex");
    tags.replace_all(value, "").into_owned()
}

fn normalize_anki_field(value: &str) -> String {
    let mut value: String = value.chars().take(MAX_FIELD_BYTES).collect();
    let ruby = Regex::new(r"(?is)<ruby[^>]*>(.*?)<rt[^>]*>(.*?)</rt>.*?</ruby>")
        .expect("valid ruby regex");
    value = ruby
        .replace_all(&value, |captures: &Captures<'_>| {
            format!("{}[{}]", strip_tags(&captures[1]), strip_tags(&captures[2]))
        })
        .into_owned();
    let cloze = Regex::new(r"(?is)\{\{c\d+::(.*?)(?:::[^}]*)?\}\}").expect("valid cloze regex");
    value = cloze.replace_all(&value, "$1").into_owned();
    value = Regex::new(r"(?is)<(?:img|audio|video)\b[^>]*>")
        .expect("valid media regex")
        .replace_all(&value, "")
        .into_owned();
    value = Regex::new(r"(?is)\[sound:[^]]+\]")
        .expect("valid sound regex")
        .replace_all(&value, "")
        .into_owned();
    value = Regex::new(r"(?is)<br\s*/?>|</(?:div|p|li)\s*>")
        .expect("valid break regex")
        .replace_all(&value, "\n")
        .into_owned();
    let value = strip_tags(&value);
    html_escape::decode_html_entities(&value)
        .replace('\u{00a0}', " ")
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn clean_inline(value: &str) -> String {
    normalize_anki_field(value)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn field<'a>(fields: &'a [&'a str], index: Option<usize>) -> &'a str {
    index
        .and_then(|index| fields.get(index).copied())
        .unwrap_or("")
}

fn extract_headword(value: &str) -> String {
    let normalized = normalize_anki_field(value);
    let first_line = normalized
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("");
    let without_reading = Regex::new(r"\s*\[[^]]+\]")
        .expect("valid reading regex")
        .replace_all(first_line, "");
    without_reading
        .trim_matches(|character: char| {
            character.is_whitespace() || "「」『』【】()（）".contains(character)
        })
        .to_string()
}

fn extract_bracket_reading(value: &str) -> String {
    Regex::new(r"\[([^]]+)\]")
        .expect("valid reading regex")
        .captures(value)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string())
        .unwrap_or_default()
}

fn contains_kanji(value: &str) -> bool {
    value.chars().any(
        |character| matches!(character as u32, 0x3400..=0x4dbf | 0x4e00..=0x9fff | 0xf900..=0xfaff),
    )
}

#[tauri::command]
pub async fn import_anki_cards(
    path: String,
    mapping: AnkiFieldMapping,
) -> Result<Vec<ImportedAnkiCard>, String> {
    if mapping.headword_field.is_none() {
        return Err("Выберите поле с кандзи или японским словом".into());
    }
    let note_type_id: i64 = mapping
        .note_type_id
        .parse()
        .map_err(|_| "Некорректный тип заметок Anki".to_string())?;
    let collection = extract_collection(&path)?;
    let mut connection = open_collection(&collection).await?;
    let rows = sqlx::query("SELECT id, guid, flds FROM notes WHERE mid = ? ORDER BY id")
        .bind(note_type_id)
        .fetch_all(&mut connection)
        .await
        .map_err(|error| format!("Не удалось прочитать карточки Anki: {error}"))?;
    let mut cards = Vec::new();
    for row in rows {
        let note_id: i64 = row.try_get("id").map_err(|error| error.to_string())?;
        let guid: String = row.try_get("guid").unwrap_or_else(|_| note_id.to_string());
        let raw_fields: String = row.try_get("flds").map_err(|error| error.to_string())?;
        let fields: Vec<&str> = raw_fields.split('\u{1f}').collect();
        let headword_source = field(&fields, mapping.headword_field);
        let headword = extract_headword(headword_source);
        if headword.is_empty() || headword.chars().count() > 24 || !contains_kanji(&headword) {
            continue;
        }
        let reading = {
            let explicit = clean_inline(field(&fields, mapping.reading_field));
            if explicit.is_empty() {
                extract_bracket_reading(headword_source)
            } else {
                explicit
            }
        };
        cards.push(ImportedAnkiCard {
            source_id: format!("anki:{note_type_id}:{guid}"),
            headword,
            reading,
            meaning: clean_inline(field(&fields, mapping.meaning_field)),
            sentence: normalize_anki_field(field(&fields, mapping.sentence_field)),
            sentence_reading: clean_inline(field(&fields, mapping.sentence_reading_field)),
            sentence_meaning: clean_inline(field(&fields, mapping.sentence_meaning_field)),
        });
    }
    if cards.is_empty() {
        return Err("По выбранному сопоставлению не найдено карточек с кандзи".into());
    }
    Ok(cards)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Executor;
    use zip::write::SimpleFileOptions;

    #[test]
    fn recognizes_common_japanese_field_names() {
        let fields = vec![
            "Expression".to_string(),
            "Reading".to_string(),
            "Meaning".to_string(),
            "Sentence".to_string(),
            "SentenceReading".to_string(),
            "SentenceTranslation".to_string(),
        ];
        let mapping = suggest_mapping(42, &fields);
        assert_eq!(mapping.headword_field, Some(0));
        assert_eq!(mapping.reading_field, Some(1));
        assert_eq!(mapping.meaning_field, Some(2));
        assert_eq!(mapping.sentence_field, Some(3));
        assert_eq!(mapping.sentence_reading_field, Some(4));
        assert_eq!(mapping.sentence_meaning_field, Some(5));
    }

    #[test]
    fn strips_media_and_preserves_ruby_as_anki_furigana() {
        let value = "<div><ruby><rb>日本</rb><rt>にほん</rt></ruby>へ行きます。</div><img src='x.jpg'>[sound:x.mp3]";
        assert_eq!(normalize_anki_field(value), "日本[にほん]へ行きます。");
    }

    #[test]
    fn extracts_headword_and_requires_kanji() {
        assert_eq!(extract_headword("<b>日本[にほん]</b>"), "日本");
        assert!(contains_kanji("日本語"));
        assert!(!contains_kanji("ひらがな"));
    }

    #[test]
    fn reads_a_legacy_apkg_without_extracting_media() {
        tauri::async_runtime::block_on(async {
            let database = NamedTempFile::new().unwrap();
            let options = SqliteConnectOptions::new()
                .filename(database.path())
                .create_if_missing(true);
            let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
            connection
                .execute("CREATE TABLE col (models TEXT NOT NULL, decks TEXT NOT NULL)")
                .await
                .unwrap();
            connection
                .execute("CREATE TABLE notes (id INTEGER, guid TEXT, mid INTEGER, flds TEXT)")
                .await
                .unwrap();
            connection
                .execute("CREATE TABLE cards (nid INTEGER, did INTEGER)")
                .await
                .unwrap();
            let models = r#"{"1":{"id":1,"name":"Japanese","flds":[{"name":"Expression","ord":0},{"name":"Reading","ord":1},{"name":"Meaning","ord":2},{"name":"Sentence","ord":3},{"name":"SentenceTranslation","ord":4}]}}"#;
            sqlx::query("INSERT INTO col (models, decks) VALUES (?, ?)")
                .bind(models)
                .bind(r#"{"2":{"id":2,"name":"Test deck"}}"#)
                .execute(&mut connection)
                .await
                .unwrap();
            sqlx::query("INSERT INTO notes (id, guid, mid, flds) VALUES (1, 'abc', 1, ?)")
                .bind("日本[にほん]\u{1f}にほん\u{1f}Япония\u{1f}<ruby>日本<rt>にほん</rt></ruby>へ行きます。\u{1f}Я еду в Японию.")
                .execute(&mut connection)
                .await
                .unwrap();
            connection
                .execute("INSERT INTO cards (nid, did) VALUES (1, 2)")
                .await
                .unwrap();
            connection.close().await.unwrap();

            let package = tempfile::Builder::new().suffix(".apkg").tempfile().unwrap();
            let writer = package.reopen().unwrap();
            let mut archive = zip::ZipWriter::new(writer);
            archive
                .start_file("collection.anki21", SimpleFileOptions::default())
                .unwrap();
            archive
                .write_all(&std::fs::read(database.path()).unwrap())
                .unwrap();
            archive
                .start_file("0", SimpleFileOptions::default())
                .unwrap();
            archive.write_all(b"ignored image bytes").unwrap();
            archive.finish().unwrap();

            let path = package.path().to_string_lossy().into_owned();
            let preview = inspect_anki_package(path.clone()).await.unwrap();
            assert_eq!(preview.deck_name, "Test deck");
            assert_eq!(preview.total_notes, 1);
            let mapping = preview.note_types.into_iter().next().unwrap().suggested;
            let cards = import_anki_cards(path, mapping).await.unwrap();
            assert_eq!(cards.len(), 1);
            assert_eq!(cards[0].headword, "日本");
            assert_eq!(cards[0].sentence, "日本[にほん]へ行きます。");
        });
    }
}
