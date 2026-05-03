use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use hf_plugin_api::{PluginContext, PluginError};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const RECENT_FILES_TABLE: &str = "plugin_dev_haloforge_markdown_recent_files";
const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd"];

#[derive(Debug, Serialize)]
struct MarkdownHeading {
    level: u8,
    text: String,
    line: usize,
}

#[derive(Debug, Serialize)]
struct MarkdownDocument {
    path: String,
    name: String,
    title: String,
    content: String,
    headings: Vec<MarkdownHeading>,
    word_count: usize,
    estimated_read_time_min: usize,
}

fn get_path(args: &Value) -> Result<String, PluginError> {
    args["path"]
        .as_str()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(String::from)
        .ok_or_else(|| PluginError::Custom("missing required field: path".into()))
}

    fn get_content(args: &Value) -> Result<String, PluginError> {
        args["content"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| PluginError::Custom("missing required field: content".into()))
    }

fn sql_escape(value: &str) -> String {
    value.replace('\'', "''")
}

fn row_to_json(row: HashMap<String, Value>) -> Value {
    Value::Object(row.into_iter().collect())
}

fn default_title_from_path(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(path)
        .to_string()
}

fn is_markdown_escape_target(ch: char) -> bool {
    matches!(
        ch,
        '\\' | '`' | '*' | '_' | '{' | '}' | '[' | ']' | '(' | ')' | '#' | '+' | '-' | '.' | '!' | '>' | '|'
    )
}

fn normalize_heading_text(text: &str) -> String {
    let trimmed = text.trim();
    let without_closing_hashes = trimmed.trim_end_matches('#').trim_end();
    let mut normalized = String::with_capacity(without_closing_hashes.len());
    let mut chars = without_closing_hashes.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(next) = chars.peek().copied() {
                if is_markdown_escape_target(next) {
                    normalized.push(next);
                    chars.next();
                    continue;
                }
            }
        }
        normalized.push(ch);
    }

    normalized.trim().to_string()
}

/// Strip Windows verbatim `\\?\` prefix that `canonicalize()` adds, so the
/// UI shows a conventional path instead of garbled extended-length form.
fn strip_extended_path_prefix(path: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        if let Some(rest) = path.strip_prefix(r"\\?\") {
            if let Some(unc) = rest.strip_prefix("UNC\\") {
                return format!(r"\\{}", unc);
            }
            return rest.to_string();
        }
    }
    path.to_string()
}

fn normalize_markdown_file(path: &str) -> Result<String, PluginError> {
    let trimmed = path.trim();
    let file = Path::new(trimmed);
    if !file.exists() {
        return Err(PluginError::NotFound(format!("path not found: {trimmed}")));
    }
    if !file.is_file() {
        return Err(PluginError::Custom(format!("path is not a file: {trimmed}")));
    }

    let extension = file
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .ok_or_else(|| PluginError::Custom("Selected file is not a supported Markdown document.".into()))?;

    if !MARKDOWN_EXTENSIONS.iter().any(|allowed| *allowed == extension) {
        return Err(PluginError::Custom(
            "Selected file is not a supported Markdown document.".into(),
        ));
    }

    file.canonicalize()
        .map(|value| strip_extended_path_prefix(&value.to_string_lossy()))
        .map_err(|e| PluginError::Process(format!("failed to resolve path: {e}")))
}

/// Track whether we're currently inside a fenced code block so heading
/// parsing ignores `#include` / `#define` / heading-like comments in code.
fn update_fence_state(current: Option<char>, trimmed: &str) -> (Option<char>, bool) {
    let first_char = trimmed.chars().next();
    let marker_char = match first_char {
        Some(c @ '`') | Some(c @ '~') => c,
        _ => return (current, false),
    };

    let marker_len = trimmed.chars().take_while(|ch| *ch == marker_char).count();
    if marker_len < 3 {
        return (current, false);
    }

    match current {
        None => (Some(marker_char), true),
        Some(open) if open == marker_char => (None, true),
        Some(_) => (current, false),
    }
}

fn extract_title(path: &str, content: &str) -> String {
    let mut fence: Option<char> = None;
    for line in content.lines() {
        let trimmed_start = line.trim_start();
        let (next_fence, is_fence_line) = update_fence_state(fence, trimmed_start);
        fence = next_fence;
        if is_fence_line || fence.is_some() {
            continue;
        }

        let trimmed = line.trim();
        if trimmed.starts_with('#') {
            let hashes = trimmed.chars().take_while(|ch| *ch == '#').count();
            if (1..=6).contains(&hashes) {
                let after = trimmed.as_bytes().get(hashes).copied();
                if !matches!(after, None | Some(b' ') | Some(b'\t')) {
                    continue;
                }
                let candidate = normalize_heading_text(&trimmed[hashes..]);
                if !candidate.is_empty() {
                    return candidate;
                }
            }
        }
    }

    default_title_from_path(path)
}

fn extract_headings(content: &str) -> Vec<MarkdownHeading> {
    let mut headings = Vec::new();
    let mut fence: Option<char> = None;

    for (index, line) in content.lines().enumerate() {
        let trimmed = line.trim_start();
        let (next_fence, is_fence_line) = update_fence_state(fence, trimmed);
        fence = next_fence;
        if is_fence_line || fence.is_some() {
            continue;
        }

        if !trimmed.starts_with('#') {
            continue;
        }

        let level = trimmed.chars().take_while(|ch| *ch == '#').count();
        if !(1..=6).contains(&level) {
            continue;
        }

        // ATX headings require whitespace (or end-of-line) after the hashes.
        let after = trimmed.as_bytes().get(level).copied();
        if !matches!(after, None | Some(b' ') | Some(b'\t')) {
            continue;
        }

        let text = normalize_heading_text(&trimmed[level..]);
        if text.is_empty() {
            continue;
        }

        headings.push(MarkdownHeading {
            level: level as u8,
            text,
            line: index + 1,
        });
    }

    headings
}

fn word_count(content: &str) -> usize {
    content.split_whitespace().count()
}

fn estimate_read_time_minutes(words: usize) -> usize {
    ((words.max(1) as f64) / 220.0).ceil() as usize
}

fn build_document(path: String, content: String) -> MarkdownDocument {
    let title = extract_title(&path, &content);
    let name = Path::new(&path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(&path)
        .to_string();
    let headings = extract_headings(&content);
    let words = word_count(&content);

    MarkdownDocument {
        path,
        name,
        title,
        content,
        headings,
        word_count: words,
        estimated_read_time_min: estimate_read_time_minutes(words),
    }
}

fn upsert_recent_file(ctx: &dyn PluginContext, path: &str, title: &str) -> Result<(), PluginError> {
    let quoted_path = sql_escape(path);
    let quoted_title = sql_escape(title);
    let update_sql = format!(
        "UPDATE {RECENT_FILES_TABLE} SET \"title\" = '{quoted_title}', \"opened_at\" = CURRENT_TIMESTAMP WHERE \"path\" = '{quoted_path}' OR \"id\" = '{quoted_path}'"
    );
    let updated = ctx.db().execute(&update_sql, &[])?;
    if updated == 0 {
        let insert_sql = format!(
            "INSERT INTO {RECENT_FILES_TABLE} VALUES ('{quoted_path}', '{quoted_path}', '{quoted_title}', CURRENT_TIMESTAMP)"
        );
        ctx.db().execute(&insert_sql, &[])?;
    }

    Ok(())
}

fn normalize_for_existing_line_endings(content: &str, existing: &str) -> String {
    let normalized = content.replace("\r\n", "\n");
    if existing.contains("\r\n") {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    }
}

pub fn md_recent_files(_args: Value, ctx: &dyn PluginContext) -> Result<Value, PluginError> {
    let mut rows = ctx
        .db()
        .query(&format!("SELECT * FROM {RECENT_FILES_TABLE}"), &[])?;

    rows.sort_by(|left, right| {
        let left_opened = left
            .get("opened_at")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let right_opened = right
            .get("opened_at")
            .and_then(Value::as_str)
            .unwrap_or_default();
        right_opened.cmp(left_opened)
    });

    Ok(json!({
        "files": rows.into_iter().map(row_to_json).collect::<Vec<_>>()
    }))
}

pub fn md_create_file(args: Value, ctx: &dyn PluginContext) -> Result<Value, PluginError> {
    let raw = get_path(&args)?;
    let trimmed = raw.trim();
    let mut target = PathBuf::from(trimmed);

    let has_markdown_ext = target
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let lower = ext.to_ascii_lowercase();
            MARKDOWN_EXTENSIONS.iter().any(|allowed| *allowed == lower)
        })
        .unwrap_or(false);

    if !has_markdown_ext {
        let current = target
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("untitled")
            .to_string();
        target.set_file_name(format!("{current}.md"));
    }

    if target.exists() {
        return Err(PluginError::Custom(format!(
            "path already exists: {}",
            target.display()
        )));
    }

    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| PluginError::Process(format!("failed to create parent dir: {e}")))?;
        }
    }

    let stem = target
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let initial_content = format!("# {stem}\n\n");

    fs::write(&target, initial_content.as_bytes())
        .map_err(|e| PluginError::Process(format!("failed to create markdown file: {e}")))?;

    let normalized = target
        .canonicalize()
        .map(|p| strip_extended_path_prefix(&p.to_string_lossy()))
        .unwrap_or_else(|_| target.to_string_lossy().to_string());

    let document = build_document(normalized, initial_content);
    upsert_recent_file(ctx, &document.path, &document.title)?;

    Ok(json!({ "document": document }))
}

pub fn md_open_file(args: Value, ctx: &dyn PluginContext) -> Result<Value, PluginError> {
    let path = normalize_markdown_file(&get_path(&args)?)?;
    let content = fs::read_to_string(&path)
        .map_err(|e| PluginError::Process(format!("failed to read markdown file: {e}")))?;
    let document = build_document(path, content);
    upsert_recent_file(ctx, &document.path, &document.title)?;

    Ok(json!({ "document": document }))
}

pub fn md_save_file(args: Value, ctx: &dyn PluginContext) -> Result<Value, PluginError> {
    let path = normalize_markdown_file(&get_path(&args)?)?;
    let content = get_content(&args)?;
    let existing = fs::read_to_string(&path)
        .map_err(|e| PluginError::Process(format!("failed to read markdown file: {e}")))?;
    let normalized_content = normalize_for_existing_line_endings(&content, &existing);

    fs::write(&path, normalized_content.as_bytes())
        .map_err(|e| PluginError::Process(format!("failed to save markdown file: {e}")))?;

    let document = build_document(path, normalized_content);
    upsert_recent_file(ctx, &document.path, &document.title)?;

    Ok(json!({ "document": document, "success": true }))
}

pub fn md_remove_recent_file(args: Value, ctx: &dyn PluginContext) -> Result<Value, PluginError> {
    let path = get_path(&args)?;
    let quoted_path = sql_escape(path.trim());
    let sql = format!(
        "DELETE FROM {RECENT_FILES_TABLE} WHERE \"path\" = '{quoted_path}' OR \"id\" = '{quoted_path}'"
    );
    ctx.db().execute(&sql, &[])?;
    Ok(json!({ "success": true }))
}

fn safe_extension(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    match lower.rsplit_once('.') {
        Some((_, ext)) if !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphanumeric()) => {
            ext.to_string()
        }
        _ => "png".to_string(),
    }
}

fn timestamp_suffix() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| format!("{}{:03}", d.as_secs(), d.subsec_millis()))
        .unwrap_or_else(|_| "0".to_string())
}

fn sanitize_stem(raw: &str) -> String {
    let trimmed = Path::new(raw)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let mut out = String::new();
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "image".to_string()
    } else {
        trimmed
    }
}

/// Save an image blob next to the active markdown document in an `images/`
/// folder and return a relative path suitable for direct insertion into the
/// document source. Prevents Toast UI from embedding base64 data URLs.
pub fn md_save_image(args: Value, _ctx: &dyn PluginContext) -> Result<Value, PluginError> {
    let source_path = args["sourcePath"]
        .as_str()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .ok_or_else(|| PluginError::Custom("missing required field: sourcePath".into()))?;

    let data_b64 = args["dataBase64"]
        .as_str()
        .ok_or_else(|| PluginError::Custom("missing required field: dataBase64".into()))?;

    let file_name_hint = args["fileName"].as_str().unwrap_or("image");

    let bytes = BASE64_STANDARD
        .decode(data_b64)
        .map_err(|e| PluginError::Custom(format!("invalid base64 image payload: {e}")))?;

    let source = Path::new(source_path);
    let parent = source
        .parent()
        .ok_or_else(|| PluginError::Custom("sourcePath has no parent directory".into()))?;

    let images_dir = parent.join("images");
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir)
            .map_err(|e| PluginError::Process(format!("failed to create images dir: {e}")))?;
    }

    let stem = sanitize_stem(file_name_hint);
    let extension = safe_extension(file_name_hint);
    let suffix = timestamp_suffix();
    let mut target = images_dir.join(format!("{stem}-{suffix}.{extension}"));
    let mut counter: u32 = 1;
    while target.exists() {
        target = images_dir.join(format!("{stem}-{suffix}-{counter}.{extension}"));
        counter += 1;
    }

    fs::write(&target, &bytes)
        .map_err(|e| PluginError::Process(format!("failed to write image: {e}")))?;

    let absolute = target
        .canonicalize()
        .map(|p| strip_extended_path_prefix(&p.to_string_lossy()))
        .unwrap_or_else(|_| target.to_string_lossy().to_string());

    let relative: String = {
        let rel: PathBuf = match target.strip_prefix(parent) {
            Ok(p) => p.to_path_buf(),
            Err(_) => target.clone(),
        };
        rel.to_string_lossy().replace('\\', "/")
    };

    Ok(json!({
        "path": absolute,
        "relativePath": relative,
    }))
}