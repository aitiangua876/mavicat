import { describe, expect, it } from "vitest";
import { parseClipboardTable } from "../../src/utils/clipboardTable";

describe("clipboardTable", () => {
  it("parses tab separated clipboard text", () => {
    expect(parseClipboardTable("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("preserves quoted tabs and line breaks", () => {
    expect(parseClipboardTable("\"a\tb\"\t1\n\"c\nd\"\t2")).toEqual([
      ["a\tb", "1"],
      ["c\nd", "2"],
    ]);
  });

  it("trims trailing empty rows and cells", () => {
    expect(parseClipboardTable("a\tb\t\n\n")).toEqual([["a", "b"]]);
  });
});
