import { ExtractedSourceItem, NotebookSourceType } from "../types/vocab";
import { parseCsvContent } from "./csvParser";
import {
  extractPdfRawOffline,
  extractProseStudyCards,
  extractWordRawOffline,
  normalizeInlineSupSub,
} from "./offlineDocParser";
import { cleanCardField, convertExtractedItemsToTasks } from "./textSanitizer";

export interface NotebookSourceParseResult {
  title: string;
  sourceType: NotebookSourceType;
  rawText: string;
  extractedItems: ExtractedSourceItem[];
  wordCount: number;
  extractionMethod: string;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function deriveSourceTitle(filename: string): string {
  return filename.trim() || "Unbenannte Quelle";
}

function mergeUniqueExtracted(
  primary: ExtractedSourceItem[],
  secondary: ExtractedSourceItem[]
): ExtractedSourceItem[] {
  const seen = new Set<string>();
  const out: ExtractedSourceItem[] = [];
  for (const item of [...primary, ...secondary]) {
    const term = item.term.trim();
    const translation = item.translation.trim();
    if (!term || !translation) continue;
    const key = `${term.toLowerCase()}:::${translation.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...item,
      term,
      translation,
    });
  }
  return out;
}

export async function parseNotebookSourceFile(
  file: File
): Promise<NotebookSourceParseResult> {
  const lower = file.name.toLowerCase();
  const title = deriveSourceTitle(file.name);

  if (lower.endsWith(".pdf")) {
    const { rawText, columnItems, delimitedItems } = await extractPdfRawOffline(
      file
    );
    if (!rawText.trim()) {
      throw new Error(
        `Die PDF-Datei „${file.name}“ enthält keinen extrahierbaren Text (möglicherweise ein Bild-Scan).`
      );
    }
    const proseItems = extractProseStudyCards(rawText);
    const structural =
      columnItems.length >= delimitedItems.length
        ? columnItems
        : delimitedItems;
    const extractedItems =
      proseItems.length > structural.length
        ? mergeUniqueExtracted(proseItems, structural)
        : mergeUniqueExtracted(structural, proseItems);
    return {
      title,
      sourceType: "pdf",
      rawText,
      extractedItems,
      wordCount: countWords(rawText),
      extractionMethod:
        proseItems.length > structural.length
          ? "PDF-Arbeitsblatt- & Textanalyse"
          : columnItems.length >= delimitedItems.length && columnItems.length > 0
            ? "PDF-Spalten & Textanalyse"
            : delimitedItems.length > 0
              ? "PDF-Zeilen & Definitionen"
              : "PDF-Arbeitsblatt- & Definitionenanalyse",
    };
  }

  if (lower.endsWith(".docx")) {
    const { rawText, tableItems, delimitedItems } = await extractWordRawOffline(
      file
    );
    if (!rawText.trim()) {
      throw new Error(
        `Das Word-Dokument „${file.name}“ enthält keinen lesbaren Text.`
      );
    }
    const proseItems = extractProseStudyCards(rawText);
    const structural = tableItems.length > 0 ? tableItems : delimitedItems;
    const extractedItems =
      proseItems.length > structural.length
        ? mergeUniqueExtracted(proseItems, structural)
        : mergeUniqueExtracted(structural, proseItems);
    return {
      title,
      sourceType: "docx",
      rawText,
      extractedItems,
      wordCount: countWords(rawText),
      extractionMethod:
        proseItems.length > structural.length
          ? "Word-Arbeitsblatt- & Textanalyse"
          : tableItems.length > 0
            ? "Word-Tabellen & Textanalyse"
            : "Word-Definitionen & Aufgaben",
    };
  }

  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const rawText = normalizeInlineSupSub((await file.text()).trim());
    if (!rawText) {
      throw new Error(`Die Datei „${file.name}“ ist leer.`);
    }
    const parsed = parseCsvContent(rawText);
    const { termCol, translationCol, exampleCol, noteCol, posCol } =
      parsed.detectedMapping;
    const csvItems: ExtractedSourceItem[] = convertExtractedItemsToTasks(
      parsed.rows
        .map((row) => ({
          term: cleanCardField(row[termCol] || ""),
          translation: cleanCardField(row[translationCol] || ""),
          exampleSentence:
            exampleCol >= 0 ? cleanCardField(row[exampleCol] || "") : undefined,
          note: noteCol >= 0 ? cleanCardField(row[noteCol] || "") : undefined,
          partOfSpeech:
            posCol >= 0 ? cleanCardField(row[posCol] || "") : undefined,
        }))
        .filter((item) => item.term && item.translation)
    );

    const extractedItems =
      csvItems.length > 0 ? csvItems : extractProseStudyCards(rawText);

    return {
      title,
      sourceType: "csv",
      rawText,
      extractedItems,
      wordCount: countWords(rawText),
      extractionMethod: "CSV/Tabellen-Analyse",
    };
  }

  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    const rawText = normalizeInlineSupSub((await file.text()).trim());
    if (!rawText) {
      throw new Error(`Die Textdatei „${file.name}“ ist leer.`);
    }
    const extractedItems = extractNotebookTextItems(rawText);
    return {
      title,
      sourceType: "txt",
      rawText,
      extractedItems,
      wordCount: countWords(rawText),
      extractionMethod: "Arbeitsblatt-, Struktur- & Definitionenanalyse",
    };
  }

  throw new Error(
    `Nicht unterstütztes Dateiformat (${file.name}). Unterstützt werden PDF-, Word-Arbeitsblätter (.docx), CSV, TSV, TXT und Markdown (.md).`
  );
}

export function extractNotebookTextItems(
  rawText: string,
  defaultTopic?: string
): ExtractedSourceItem[] {
  const trimmed = normalizeInlineSupSub(rawText.trim());
  if (!trimmed) return [];

  // Check if text is multi-column CSV/semicolon formatted
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const semicolonLines = lines.filter((l) => l.includes(";") || l.includes("\t"));
  let csvItems: ExtractedSourceItem[] = [];
  if (semicolonLines.length >= Math.max(2, Math.floor(lines.length * 0.5))) {
    const parsed = parseCsvContent(trimmed);
    const { termCol, translationCol, exampleCol, noteCol, posCol } =
      parsed.detectedMapping;
    csvItems = convertExtractedItemsToTasks(
      parsed.rows
        .map((row) => ({
          term: cleanCardField(row[termCol] || ""),
          translation: cleanCardField(row[translationCol] || ""),
          exampleSentence:
            exampleCol >= 0 ? cleanCardField(row[exampleCol] || "") : undefined,
          note: noteCol >= 0 ? cleanCardField(row[noteCol] || "") : undefined,
          partOfSpeech:
            posCol >= 0 ? cleanCardField(row[posCol] || "") : undefined,
          topic: defaultTopic,
        }))
        .filter((i) => i.term && i.translation)
    );
  }

  const proseItems = extractProseStudyCards(trimmed, defaultTopic);
  return proseItems.length > csvItems.length
    ? mergeUniqueExtracted(proseItems, csvItems)
    : mergeUniqueExtracted(csvItems, proseItems);
}

export function parseNotebookRawNote(
  title: string,
  rawText: string
): NotebookSourceParseResult {
  const cleanTitle = title.trim() || "Eigene Notiz";
  const cleanText = normalizeInlineSupSub(rawText.trim());
  if (!cleanText) {
    throw new Error("Bitte geben Sie Text oder Lernnotizen für die Quelle ein.");
  }
  const extractedItems = extractNotebookTextItems(cleanText, cleanTitle);
  return {
    title: cleanTitle,
    sourceType: "notes",
    rawText: cleanText,
    extractedItems,
    wordCount: countWords(cleanText),
    extractionMethod: "Arbeitsblatt-, Notiz- & Definitionenanalyse",
  };
}
