type SqlScanMode = "code" | "singleQuote" | "doubleQuote" | "backtick" | "lineComment" | "blockComment";

const isParamStart = (char: string | undefined): boolean =>
  char !== undefined && /[A-Za-z_]/.test(char);

const isParamPart = (char: string | undefined): boolean =>
  char !== undefined && /[A-Za-z0-9_]/.test(char);

const readParamName = (sql: string, colonIndex: number): { name: string; end: number } | null => {
  if (sql[colonIndex] !== ":" || sql[colonIndex - 1] === ":" || !isParamStart(sql[colonIndex + 1])) {
    return null;
  }

  let end = colonIndex + 2;
  while (isParamPart(sql[end])) {
    end += 1;
  }

  return {
    name: sql.slice(colonIndex + 1, end),
    end,
  };
};

const scanSqlParams = (
  sql: string,
  onParam: (name: string, token: string) => string,
): string => {
  let mode: SqlScanMode = "code";
  let output = "";
  let index = 0;

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (mode === "code") {
      if (char === "'") {
        mode = "singleQuote";
        output += char;
        index += 1;
        continue;
      }
      if (char === '"') {
        mode = "doubleQuote";
        output += char;
        index += 1;
        continue;
      }
      if (char === "`") {
        mode = "backtick";
        output += char;
        index += 1;
        continue;
      }
      if (char === "-" && next === "-") {
        mode = "lineComment";
        output += char + next;
        index += 2;
        continue;
      }
      if (char === "#") {
        mode = "lineComment";
        output += char;
        index += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        mode = "blockComment";
        output += char + next;
        index += 2;
        continue;
      }

      const param = readParamName(sql, index);
      if (param) {
        output += onParam(param.name, sql.slice(index, param.end));
        index = param.end;
        continue;
      }

      output += char;
      index += 1;
      continue;
    }

    output += char;

    if (mode === "singleQuote") {
      if (char === "\\" && next !== undefined) {
        output += next;
        index += 2;
        continue;
      }
      if (char === "'" && next === "'") {
        output += next;
        index += 2;
        continue;
      }
      if (char === "'") {
        mode = "code";
      }
    } else if (mode === "doubleQuote") {
      if (char === '"' && next === '"') {
        output += next;
        index += 2;
        continue;
      }
      if (char === '"') {
        mode = "code";
      }
    } else if (mode === "backtick") {
      if (char === "`" && next === "`") {
        output += next;
        index += 2;
        continue;
      }
      if (char === "`") {
        mode = "code";
      }
    } else if (mode === "lineComment") {
      if (char === "\n" || char === "\r") {
        mode = "code";
      }
    } else if (mode === "blockComment" && char === "*" && next === "/") {
      output += next;
      index += 2;
      mode = "code";
      continue;
    }

    index += 1;
  }

  return output;
};

export const extractQueryParams = (sql: string): string[] => {
  if (!sql) return [];

  const uniqueParams = new Set<string>();
  scanSqlParams(sql, (name, token) => {
    uniqueParams.add(name);
    return token;
  });

  return Array.from(uniqueParams);
};

export const interpolateQueryParams = (sql: string, params: Record<string, string>): string => {
  if (!sql) return "";

  // Values are substituted verbatim; callers are responsible for quoting.
  // SQL injection risk is accepted at the UI layer because this is a developer tool.
  return scanSqlParams(sql, (name, token) => params[name] ?? token);
};
