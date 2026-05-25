use futures::StreamExt;
use serde_json::Value;

use crate::models::ConnectionParams;
use crate::pool_manager::get_postgres_pool;

use super::extract::extract_value;
use super::helpers::escape_identifier;

/// Streams the rows produced by `query` against a PostgreSQL connection. See
/// the MySQL counterpart for the contract of `on_row`.
pub async fn stream_query<F>(
    params: &ConnectionParams,
    query: &str,
    mut on_row: F,
) -> Result<(), String>
where
    F: FnMut(&[String], &[Value]) -> Result<(), String> + Send,
{
    stream_query_with_schema(params, query, None, &mut on_row).await
}

pub async fn stream_query_with_schema<F>(
    params: &ConnectionParams,
    query: &str,
    schema: Option<&str>,
    mut on_row: F,
) -> Result<(), String>
where
    F: FnMut(&[String], &[Value]) -> Result<(), String> + Send,
{
    let pool = get_postgres_pool(params).await?;
    let client = pool
        .get()
        .await
        .map_err(|e| format!("failed to get postgres client: {:?}", e))?;

    if let Some(schema) = schema {
        let search_path = format!("SET search_path TO \"{}\"", escape_identifier(schema));
        client
            .execute(&search_path, &[])
            .await
            .map_err(|e| e.to_string())?;
    }

    let bind_params: Vec<i32> = vec![];
    let mut rows = std::pin::pin!(client
        .query_raw(query, &bind_params)
        .await
        .map_err(|e| format!("failed to execute postgres query: {:?}", e))?);

    let mut headers: Option<Vec<String>> = None;

    while let Some(row_res) = rows.next().await {
        let row = row_res.map_err(|e| e.to_string())?;

        if headers.is_none() {
            headers = Some(row.columns().iter().map(|c| c.name().to_string()).collect());
        }
        let h = headers.as_ref().expect("headers initialized");

        let values: Vec<Value> = (0..row.columns().len())
            .map(|i| extract_value(&row, i, None))
            .collect();

        on_row(h, &values)?;
    }

    Ok(())
}
