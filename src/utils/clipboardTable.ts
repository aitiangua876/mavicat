export function parseClipboardTable(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = parseDelimited(normalized, "\t");

  return trimTrailingEmptyRows(rows).map((row) => trimTrailingEmptyCells(row));
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [[]];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      rows[rows.length - 1].push(value);
      value = "";
      continue;
    }

    if (!inQuotes && char === "\n") {
      rows[rows.length - 1].push(value);
      rows.push([]);
      value = "";
      continue;
    }

    value += char;
  }

  rows[rows.length - 1].push(value);
  return rows;
}

function trimTrailingEmptyRows(rows: string[][]): string[][] {
  const next = [...rows];
  while (next.length > 0 && next[next.length - 1].every((cell) => cell === "")) {
    next.pop();
  }
  return next;
}

function trimTrailingEmptyCells(row: string[]): string[] {
  const next = [...row];
  while (next.length > 1 && next[next.length - 1] === "") {
    next.pop();
  }
  return next;
}
