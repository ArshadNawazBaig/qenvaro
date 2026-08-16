import { describe, expect, it } from "vitest";
import { escapeCsvCell, rowsToCsv } from "./csv";

describe("CSV output", () => {
  it.each(["=2+2", "+SUM(A:A)", "-1+1", "@evil", "\tcommand"])(
    "neutralizes formula payload %s",
    (value) => {
      expect(escapeCsvCell(value).startsWith("'")).toBe(true);
    },
  );
  it("quotes delimiters and quotes", () => {
    expect(
      rowsToCsv([
        ["name", "note"],
        ["A, B", 'say "hello"'],
      ]),
    ).toBe('name,note\r\n"A, B","say ""hello"""');
  });
});
