use serde_json::ser::{CompactFormatter, Formatter};
use serde_json::Value;
use std::io::Write;

use super::format::{escape_html, value_to_csv_string, value_to_sql_literal};

/// A streaming consumer of rows produced by a driver.
///
/// `write_row` is called once per database row with the column names (stable
/// across the whole export) and the extracted JSON values. `finish` is called
/// after the last row so the sink can flush any trailing data.
pub trait RowSink {
    fn write_row(&mut self, headers: &[String], values: &[Value]) -> Result<(), String>;
    fn finish(&mut self) -> Result<(), String>;
}

pub struct CsvSink<W: Write> {
    writer: csv::Writer<W>,
    headers_written: bool,
}

pub struct ExcelSink<W: Write> {
    writer: W,
    headers_written: bool,
    closed: bool,
}

impl<W: Write> ExcelSink<W> {
    pub fn new(writer: W) -> Self {
        Self {
            writer,
            headers_written: false,
            closed: false,
        }
    }

    fn write_document_start(&mut self) -> Result<(), String> {
        if self.headers_written {
            return Ok(());
        }
        write!(
            self.writer,
            r#"<!doctype html><html><head><meta charset="utf-8"><style>table{{border-collapse:collapse}}th,td{{border:1px solid #999;padding:4px 8px;mso-number-format:"\@";}}</style></head><body><table>"#
        )
        .map_err(|e| e.to_string())
    }
}

impl<W: Write> RowSink for ExcelSink<W> {
    fn write_row(&mut self, headers: &[String], values: &[Value]) -> Result<(), String> {
        self.write_document_start()?;
        if !self.headers_written {
            write!(self.writer, "<thead><tr>").map_err(|e| e.to_string())?;
            for header in headers {
                write!(self.writer, "<th>{}</th>", escape_html(header))
                    .map_err(|e| e.to_string())?;
            }
            write!(self.writer, "</tr></thead><tbody>").map_err(|e| e.to_string())?;
            self.headers_written = true;
        }

        write!(self.writer, "<tr>").map_err(|e| e.to_string())?;
        for value in values {
            let cell = match value {
                Value::String(s) => s.clone(),
                Value::Null => String::new(),
                other => other.to_string(),
            };
            write!(self.writer, "<td>{}</td>", escape_html(&cell)).map_err(|e| e.to_string())?;
        }
        write!(self.writer, "</tr>").map_err(|e| e.to_string())
    }

    fn finish(&mut self) -> Result<(), String> {
        if !self.headers_written {
            self.write_document_start()?;
            write!(self.writer, "<tbody>").map_err(|e| e.to_string())?;
            self.headers_written = true;
        }
        if !self.closed {
            write!(self.writer, "</tbody></table></body></html>").map_err(|e| e.to_string())?;
            self.closed = true;
        }
        self.writer.flush().map_err(|e| e.to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SqlDialect {
    Mysql,
    Postgres,
    Dameng,
    Sqlite,
}

impl SqlDialect {
    pub fn from_driver(driver: &str) -> Self {
        match driver {
            "mysql" | "mariadb" => Self::Mysql,
            "postgres" => Self::Postgres,
            "dameng" | "dm" => Self::Dameng,
            _ => Self::Sqlite,
        }
    }

    pub fn quote_identifier(self, identifier: &str) -> String {
        match self {
            Self::Mysql => format!("`{}`", identifier.replace('`', "``")),
            Self::Postgres | Self::Dameng | Self::Sqlite => {
                format!("\"{}\"", identifier.replace('"', "\"\""))
            }
        }
    }

    pub fn qualified_name(self, schema: Option<&str>, table: &str) -> String {
        if let Some(schema_name) = schema.filter(|s| !s.trim().is_empty()) {
            return format!(
                "{}.{}",
                self.quote_identifier(schema_name),
                self.quote_identifier(table)
            );
        }

        table
            .split('.')
            .filter(|part| !part.trim().is_empty())
            .map(|part| self.quote_identifier(part))
            .collect::<Vec<_>>()
            .join(".")
    }
}

pub struct SqlInsertSink<W: Write> {
    writer: W,
    dialect: SqlDialect,
    table_name: String,
    schema: Option<String>,
}

impl<W: Write> SqlInsertSink<W> {
    pub fn new(writer: W, dialect: SqlDialect, table_name: String, schema: Option<String>) -> Self {
        Self {
            writer,
            dialect,
            table_name,
            schema,
        }
    }
}

impl<W: Write> RowSink for SqlInsertSink<W> {
    fn write_row(&mut self, headers: &[String], values: &[Value]) -> Result<(), String> {
        let table_name = self
            .dialect
            .qualified_name(self.schema.as_deref(), &self.table_name);
        let columns = headers
            .iter()
            .map(|header| self.dialect.quote_identifier(header))
            .collect::<Vec<_>>()
            .join(", ");
        let literals = headers
            .iter()
            .enumerate()
            .map(|(index, _)| value_to_sql_literal(values.get(index).unwrap_or(&Value::Null)))
            .collect::<Vec<_>>()
            .join(", ");

        writeln!(
            self.writer,
            "INSERT INTO {} ({}) VALUES ({});",
            table_name, columns, literals
        )
        .map_err(|e| e.to_string())
    }

    fn finish(&mut self) -> Result<(), String> {
        self.writer.flush().map_err(|e| e.to_string())
    }
}

impl<W: Write> CsvSink<W> {
    pub fn new(inner: W, delimiter: u8) -> Self {
        Self {
            writer: csv::WriterBuilder::new()
                .delimiter(delimiter)
                .from_writer(inner),
            headers_written: false,
        }
    }
}

impl<W: Write> RowSink for CsvSink<W> {
    fn write_row(&mut self, headers: &[String], values: &[Value]) -> Result<(), String> {
        if !self.headers_written {
            self.writer
                .write_record(headers)
                .map_err(|e| e.to_string())?;
            self.headers_written = true;
        }
        let record: Vec<String> = values.iter().map(value_to_csv_string).collect();
        self.writer.write_record(&record).map_err(|e| e.to_string())
    }

    fn finish(&mut self) -> Result<(), String> {
        self.writer.flush().map_err(|e| e.to_string())
    }
}

/// Streaming JSON-array sink. Delegates the `[`, `,`, `]` punctuation to
/// `serde_json::ser::CompactFormatter` so we never reinvent JSON framing.
pub struct JsonSink<W: Write> {
    writer: W,
    formatter: CompactFormatter,
    started: bool,
    first: bool,
}

impl<W: Write> JsonSink<W> {
    pub fn new(writer: W) -> Self {
        Self {
            writer,
            formatter: CompactFormatter,
            started: false,
            first: true,
        }
    }

    fn ensure_started(&mut self) -> Result<(), String> {
        if !self.started {
            self.formatter
                .begin_array(&mut self.writer)
                .map_err(|e| e.to_string())?;
            self.started = true;
        }
        Ok(())
    }
}

impl<W: Write> RowSink for JsonSink<W> {
    fn write_row(&mut self, headers: &[String], values: &[Value]) -> Result<(), String> {
        self.ensure_started()?;
        self.formatter
            .begin_array_value(&mut self.writer, self.first)
            .map_err(|e| e.to_string())?;
        self.first = false;

        let mut obj = serde_json::Map::with_capacity(headers.len());
        for (i, name) in headers.iter().enumerate() {
            let val = values.get(i).cloned().unwrap_or(Value::Null);
            obj.insert(name.clone(), val);
        }
        serde_json::to_writer(&mut self.writer, &obj).map_err(|e| e.to_string())?;

        self.formatter
            .end_array_value(&mut self.writer)
            .map_err(|e| e.to_string())
    }

    fn finish(&mut self) -> Result<(), String> {
        self.ensure_started()?;
        self.formatter
            .end_array(&mut self.writer)
            .map_err(|e| e.to_string())?;
        self.writer.flush().map_err(|e| e.to_string())
    }
}
