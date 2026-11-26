import Papa from "papaparse";
import {
  classifySectionDivider,
  cleanCardField,
  isBoilerplateOrUnimportant,
  isDividerOrSeparatorLine,
} from "./textSanitizer";

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  detectedMapping: {
    termCol: number;
    translationCol: number;
    exampleCol: number;
    noteCol: number;
    posCol: number;
    packageCol: number;
  };
  hasHeaderRow: boolean;
}

function matchColumn(header: string, patterns: RegExp[]): boolean {
  const clean = header.trim().toLowerCase();
  return patterns.some((re) => re.test(clean));
}

export function parseCsvContent(content: string): CsvParseResult {
  const preFilteredContent = content
    .trim()
    .split(/\r?\n/)
    .filter((rawLine) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return false;
      // Filter pure symbol dividers (including "---;---" or "===;===") and section divider banners
      const withoutDelim = trimmed.replace(/[;\t,|]/g, "").trim();
      if (!withoutDelim || isDividerOrSeparatorLine(withoutDelim)) return false;
      if (isDividerOrSeparatorLine(trimmed)) return false;
      if (classifySectionDivider(trimmed)) return false;
      return true;
    })
    .join("\n");

  const result = Papa.parse<string[]>(preFilteredContent, {
    skipEmptyLines: "greedy",
  });

  const rawRows = (result.data || [])
    .map((row) => row.map((cell) => cleanCardField((cell ?? "").toString())))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (rawRows.length === 0) {
    return {
      headers: [],
      rows: [],
      detectedMapping: {
        termCol: 0,
        translationCol: 1,
        exampleCol: -1,
        noteCol: -1,
        posCol: -1,
        packageCol: -1,
      },
      hasHeaderRow: false,
    };
  }

  const firstRow = rawRows[0];
  const colCount = Math.max(...rawRows.map((r) => r.length));

  // If all rows landed in a single column (e.g. "Begriff - Erklärung" or "Frage = Antwort"),
  // filter dividers/boilerplate and split valid lines on common study-note delimiters.
  if (colCount === 1) {
    const splitDelims = [
      "\t",
      " — ",
      " – ",
      " - ",
      " = ",
      " -> ",
      " → ",
      " : ",
      ": ",
      ";",
    ];
    const expanded = rawRows
      .filter((r) => {
        const line = r[0] || "";
        if (!line) return false;
        if (isDividerOrSeparatorLine(line)) return false;
        if (classifySectionDivider(line)) return false;
        if (isBoilerplateOrUnimportant(line)) return false;
        return true;
      })
      .map((r) => {
        const line = r[0] || "";
        for (const sep of splitDelims) {
          const idx = line.indexOf(sep);
          if (idx > 0 && idx < line.length - sep.length) {
            const left = cleanCardField(line.slice(0, idx));
            const right = cleanCardField(line.slice(idx + sep.length));
            if (left && right) return [left, right];
          }
        }
        return [line];
      })
      .filter((r) => r.some((cell) => cell.length > 0));

    const maxCols = Math.max(...expanded.map((r) => r.length), 1);
    if (maxCols >= 2) {
      const fRow = expanded[0];
      const termPatterns = [
        /^(vokabel|wort|begriff|ausdruck|term|word|front|vorderseite|quelle|source|lernsprache|fremdwort|frage|question|stichwort|thema|konzept)$/,
      ];
      const transPatterns = [
        /^(übersetzung|uebersetzung|translation|bedeutung|back|rückseite|rueckseite|deutsch|ziel|target|zielsprache|meaning|antwort|answer|erklärung|erklaerung|definition|lösung|loesung|formel)$/,
      ];
      const hasHeader =
        matchColumn(fRow[0] || "", termPatterns) ||
        matchColumn(fRow[1] || "", transPatterns);
      const dataRows = (hasHeader ? expanded.slice(1) : expanded).filter(
        (r) =>
          r.length >= 2 &&
          r[0] &&
          r[1] &&
          !isDividerOrSeparatorLine(r[0]) &&
          !isDividerOrSeparatorLine(r[1]) &&
          !isBoilerplateOrUnimportant(r[0])
      );
      return {
        headers: hasHeader ? fRow : ["Begriff / Frage", "Antwort / Erklärung"],
        rows: dataRows,
        detectedMapping: {
          termCol: 0,
          translationCol: 1,
          exampleCol: -1,
          noteCol: -1,
          posCol: -1,
          packageCol: -1,
        },
        hasHeaderRow: hasHeader,
      };
    }
  }

  const termPatterns = [
    /^(vokabel|wort|begriff|ausdruck|term|word|front|vorderseite|quelle|source|lernsprache|fremdwort|frage|question|stichwort|konzept)$/,
  ];
  const transPatterns = [
    /^(übersetzung|uebersetzung|translation|bedeutung|back|rückseite|rueckseite|deutsch|ziel|target|zielsprache|meaning|antwort|answer|erklärung|erklaerung|definition|lösung|loesung|formel)$/,
  ];
  const examplePatterns = [
    /^(beispiel|beispielsatz|example|sentence|kontext|context|herleitung|anwendung)$/,
  ];
  const notePatterns = [
    /^(notiz|hinweis|note|eselsbrücke|eselsbruecke|kommentar|memo|merkhilfe)$/,
  ];
  const posPatterns = [/^(wortart|pos|partofspeech|typ|type|kategorie|fach|thema)$/];
  const pkgPatterns = [/^(paket|package|deck|paket-nr|paketnummer)$/];

  let termCol = firstRow.findIndex((h) => matchColumn(h, termPatterns));
  let translationCol = firstRow.findIndex((h) => matchColumn(h, transPatterns));
  const exampleCol = firstRow.findIndex((h) => matchColumn(h, examplePatterns));
  const noteCol = firstRow.findIndex((h) => matchColumn(h, notePatterns));
  const posCol = firstRow.findIndex((h) => matchColumn(h, posPatterns));
  const packageCol = firstRow.findIndex((h) => matchColumn(h, pkgPatterns));

  const hasHeaderRow = termCol !== -1 || translationCol !== -1;

  if (termCol === -1) termCol = 0;
  if (translationCol === -1) translationCol = colCount > 1 ? 1 : 0;

  const headers = hasHeaderRow
    ? firstRow
    : Array.from({ length: colCount }, (_, i) => `Spalte ${i + 1}`);

  const dataRows = (hasHeaderRow ? rawRows.slice(1) : rawRows).filter((r) => {
    if (!r.some((cell) => cell.length > 0)) return false;
    const t = r[termCol] || "";
    const a = r[translationCol] || "";
    if (!t || isDividerOrSeparatorLine(t)) return false;
    if (colCount > 1 && termCol !== translationCol && (!a || isDividerOrSeparatorLine(a))) {
      return false;
    }
    if (classifySectionDivider(t) || isBoilerplateOrUnimportant(t)) {
      return false;
    }
    return true;
  });

  return {
    headers,
    rows: dataRows,
    detectedMapping: {
      termCol,
      translationCol,
      exampleCol,
      noteCol,
      posCol,
      packageCol,
    },
    hasHeaderRow,
  };
}

export function generateCsvTemplate(): string {
  const rows = [
    ["Begriff / Frage", "Antwort / Übersetzung", "Kategorie / Wortart", "Beispiel / Kontext", "Merkhilfe"],
    ["", "", "", "", ""],
  ];

  return rows
    .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}
