use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
    Csv,
    Json,
    Excel,
    Sql,
}

impl ExportFormat {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s.trim().to_ascii_lowercase().as_str() {
            "csv" => Ok(Self::Csv),
            "json" => Ok(Self::Json),
            "excel" | "xls" => Ok(Self::Excel),
            "sql" => Ok(Self::Sql),
            other => Err(format!("Unsupported export format: {}", other)),
        }
    }
}

pub const DEFAULT_CSV_DELIMITER: u8 = b',';

/// Returns the first byte of the supplied string, falling back to a comma when
/// the option is `None`, an empty string, or pure whitespace.
pub fn parse_csv_delimiter(value: Option<&str>) -> u8 {
    value
        .and_then(|d| d.bytes().next())
        .unwrap_or(DEFAULT_CSV_DELIMITER)
}

/// Converts a JSON value into the string representation used by the CSV writer.
/// Strings are emitted verbatim, `null` becomes the sentinel `NULL`, and every
/// other scalar/composite delegates to `Value::to_string`.
pub fn value_to_csv_string(val: &Value) -> String {
    match val {
        Value::String(s) => s.clone(),
        Value::Null => "NULL".to_string(),
        other => other.to_string(),
    }
}

pub fn value_to_sql_literal(val: &Value) -> String {
    match val {
        Value::Null => "NULL".to_string(),
        Value::Bool(value) => {
            if *value {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        Value::Number(value) => value.to_string(),
        Value::String(value) => quote_sql_string(value),
        other => quote_sql_string(&other.to_string()),
    }
}

pub fn quote_sql_string(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
