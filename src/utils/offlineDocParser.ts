import mammoth from "mammoth/mammoth.browser.js";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  classifySectionDivider,
  cleanCardField,
  cleanNonLetterNoise,
  convertExtractedItemsToTasks,
  extractProseTaskFromSentence,
  isBoilerplateOrUnimportant,
  isDividerOrSeparatorLine,
} from "./textSanitizer";

if (
  typeof window !== "undefined" &&
  typeof pdfWorkerUrl === "string" &&
  pdfWorkerUrl.length > 0
) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface AlgorithmicExtractedRow {
  term: string;
  translation: string;
  partOfSpeech?: string;
  phonetic?: string;
  exampleSentence?: string;
  note?: string;
  topic?: string;
}

export interface OfflineDocParseResult {
  items: AlgorithmicExtractedRow[];
  method: string;
  rawPreview: string;
  rawText?: string;
}

export interface WordRawExtractResult {
  rawText: string;
  tableItems: AlgorithmicExtractedRow[];
  delimitedItems: AlgorithmicExtractedRow[];
}

export interface PdfRawExtractResult {
  rawText: string;
  columnItems: AlgorithmicExtractedRow[];
  delimitedItems: AlgorithmicExtractedRow[];
}

/**
 * Converts HTML <sup>...</sup> and <sub>...</sub> into inline ^{...} / _{...}
 * markers before stripping HTML tags so superscript/subscript survives.
 */
export function normalizeInlineSupSub(input: string): string {
  if (!input) return "";
  return input
    .replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_, inner: string) => {
      const clean = inner
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/\u00a0/g, " ")
        .trim();
      return clean ? `^{${clean}}` : "";
    })
    .replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_, inner: string) => {
      const clean = inner
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/\u00a0/g, " ")
        .trim();
      return clean ? `_{${clean}}` : "";
    });
}

function isHeaderRow(colA: string, colB: string): boolean {
  const a = colA.trim().toLowerCase();
  const b = colB.trim().toLowerCase();
  if (!a || !b) return false;
  // Real table/CSV header cells are short labels, never full questions or sentences
  if (
    a.length > 32 ||
    b.length > 32 ||
    a.split(/\s+/).length > 4 ||
    b.split(/\s+/).length > 4 ||
    /[?!.]/.test(a) ||
    /[?!.]/.test(b)
  ) {
    return false;
  }
  const leftHeader =
    /^(?:vokabel|begriff|wort|term|word|front|vorderseite|quelle|source|lernsprache|fremdwort|frage|question|stichwort|konzept|aufgabe|nr\.?)$/.test(
      a
    );
  const rightHeader =
    /^(?:übersetzung|uebersetzung|bedeutung|translation|back|rückseite|rueckseite|ziel|target|deutsch|antwort|answer|erklärung|erklaerung|definition|lösung|loesung|formel|ergebnis)$/.test(
      b
    );
  if (leftHeader && rightHeader) return true;
  return (
    /\b(?:vokabel|begriff|term|word|frage|vorderseite|aufgabe)\b/.test(a) &&
    /\b(?:übersetzung|uebersetzung|translation|bedeutung|antwort|erklärung|definition|rückseite|lösung)\b/.test(
      b
    )
  );
}

function cleanText(val: string): string {
  const htmlCleaned = normalizeInlineSupSub(val)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return cleanNonLetterNoise(htmlCleaned, {
    preserveClozeBlanks: true,
    preserveHeadingHashes: false,
    preserveInternalPipe: false,
  });
}

function isWorksheetMetaLine(line: string): boolean {
  return isBoilerplateOrUnimportant(line);
}

function stripTrailingFillBlanks(text: string): string {
  return text
    .replace(/\s*(?:_{3,}|\.{4,})\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractSectionHeading(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line || line.length > 100) return null;

  const classified = classifySectionDivider(line);
  if (classified) {
    if (classified.type === "topic") return classified.topic;
    return null;
  }

  if (isWorksheetMetaLine(line) || /^\d+$/.test(line)) return null;

  // Decorated headings: === Reisen ===, --- Essen ---, ## Thema
  const decorated = line.match(
    /^(?:[=\-#*]{1,6}\s*)(.+?)(?:\s*[=\-#*]{1,6})?$/
  );
  if (decorated && /^[=\-#*]/.test(line)) {
    const inner = cleanCardField(decorated[1]);
    if (inner.length >= 2 && inner.length <= 70 && !/[;|\t]/.test(inner)) {
      return inner;
    }
  }

  // Explicit chapter/topic prefixes: "Thema 1: Reisen", "Arbeitsblatt: Zellatmung"
  const prefixed = line.match(
    /^(?:thema|topic|kapitel|chapter|lektion|lesson|unit|modul|module|bereich|abschnitt|kategorie|category|sachgebiet|teil|arbeitsblatt)\s*(?:\d+[a-z]?|[ivx]+)?\s*[:\-–—.]\s*(.+)$/i
  );
  if (prefixed && prefixed[1]) {
    const candidate = cleanCardField(prefixed[1]);
    if (candidate.length >= 2 && candidate.length <= 70) {
      return candidate;
    }
  }

  return null;
}

function isSolutionsSectionHeading(line: string): boolean {
  const clean = line
    .replace(/^[#*\-=\s]+/, "")
    .replace(/[:\s#*=\-]+$/, "")
    .trim()
    .toLowerCase();
  return /^(?:lösungen|loesungen|lösungsteil|loesungsteil|lösungsschlüssel|musterlösung|musterlösungen|erwartungshorizont|antworten|solutions|answer key)$/.test(
    clean
  );
}

function extractDocxFormattedRawText(html: string): string {
  const lines: string[] = [];
  const blockRegex = /<(h[1-6]|p|li|tr)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const innerHtml = match[2];

    if (tag === "tr") {
      const cellMatches = innerHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
      if (cellMatches && cellMatches.length > 0) {
        const cells = cellMatches.map((c) => cleanText(c)).filter(Boolean);
        if (cells.length > 0) {
          lines.push(cells.join("\t"));
        }
      }
      continue;
    }

    const text = cleanText(innerHtml);
    if (!text) continue;
    if (tag.startsWith("h")) {
      lines.push(`## ${text}`);
    } else if (tag === "li") {
      lines.push(`• ${text}`);
    } else {
      lines.push(text);
    }
  }

  return lines.join("\n").trim();
}

function parseDocxHtmlStructured(html: string): {
  tableRows: AlgorithmicExtractedRow[];
  unansweredTableRows: AlgorithmicExtractedRow[];
  hasTables: boolean;
} {
  const rows: AlgorithmicExtractedRow[] = [];
  const unansweredRows: AlgorithmicExtractedRow[] = [];
  let hasTables = false;
  let currentTopic: string | undefined;
  let inIgnoredSection = false;

  const blockRegex = /<(h[1-6]|p|tr)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const innerHtml = match[2];

    if (tag.startsWith("h")) {
      const headingText = cleanText(innerHtml);
      const divider = classifySectionDivider(headingText);
      if (divider?.type === "ignore-section") {
        inIgnoredSection = true;
        continue;
      }
      inIgnoredSection = false;
      if (divider?.type === "divider") {
        continue;
      }
      const extracted = extractSectionHeading(headingText) || cleanCardField(headingText);
      if (extracted && extracted.length >= 2 && extracted.length <= 70) {
        currentTopic = extracted;
      }
      continue;
    }

    if (tag === "p") {
      const text = cleanText(innerHtml);
      const divider = classifySectionDivider(text);
      if (divider?.type === "ignore-section") {
        inIgnoredSection = true;
        continue;
      }
      if (divider?.type === "topic") {
        inIgnoredSection = false;
        currentTopic = divider.topic;
        continue;
      }
      if (divider?.type === "divider") {
        inIgnoredSection = false;
        continue;
      }
      if (inIgnoredSection || isDividerOrSeparatorLine(text)) continue;

      const explicit = extractSectionHeading(text);
      if (explicit) {
        currentTopic = explicit;
        continue;
      }
      const isBoldOnly =
        /^\s*<(?:strong|b)[^>]*>[\s\S]+<\/(?:strong|b)>\s*$/i.test(innerHtml);
      if (
        isBoldOnly &&
        text.length >= 3 &&
        text.length <= 55 &&
        !/[;|\t—–]/.test(text) &&
        !isWorksheetMetaLine(text)
      ) {
        currentTopic = cleanCardField(text);
      }
      continue;
    }

    if (tag === "tr") {
      hasTables = true;
      if (inIgnoredSection) continue;
      const cellMatches = innerHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
      if (!cellMatches) continue;

      if (cellMatches.length === 1) {
        const single = cleanText(cellMatches[0]);
        const divider = classifySectionDivider(single);
        if (divider?.type === "topic") {
          currentTopic = divider.topic;
        } else if (
          divider?.type !== "divider" &&
          divider?.type !== "ignore-section" &&
          single &&
          single.length <= 65 &&
          !isWorksheetMetaLine(single) &&
          !isDividerOrSeparatorLine(single)
        ) {
          currentTopic = extractSectionHeading(single) || cleanCardField(single);
        }
        continue;
      }

      const cells = cellMatches.map((c) => cleanText(c));
      const term = cleanCardField(stripTrailingFillBlanks(cells[0] || ""));
      const translation = cleanCardField(stripTrailingFillBlanks(cells[1] || ""));
      if (!term || isWorksheetMetaLine(term) || isDividerOrSeparatorLine(term)) {
        continue;
      }
      if (isHeaderRow(term, translation || "antwort")) continue;

      if (!translation || isDividerOrSeparatorLine(translation)) {
        if (term.length >= 4 && !/^\d+[.)]?$/.test(term)) {
          unansweredRows.push({
            term,
            translation: "(Lösung noch ergänzen)",
            topic: currentTopic,
          });
        }
        continue;
      }

      const exampleSentence = cleanCardField(cells[2] || "");
      const note = cleanCardField(cells[3] || cells[4] || "");
      const rowTopic = cleanCardField(cells[5] || "") || currentTopic;

      rows.push({
        term,
        translation,
        exampleSentence,
        note,
        topic: rowTopic || undefined,
      });
    }
  }

  return {
    tableRows: convertExtractedItemsToTasks(rows),
    unansweredTableRows: unansweredRows,
    hasTables,
  };
}

const DELIMITERS = [
  "\t",
  " — ",
  " – ",
  " - ",
  " = ",
  " : ",
  " | ",
  ";",
  " -> ",
  " → ",
  " => ",
  ": ",
  " -",
  "- ",
];

function splitDelimitedLine(
  line: string
): { term: string; translation: string } | null {
  const cleaned = line
    .replace(/^[\s•▪‣◦●○*\-–—]+(?=\S)/, "")
    .replace(/^\d{1,3}[.)]\s+/, "")
    .trim();

  if (!cleaned || cleaned.length > 320) return null;
  if (isWorksheetMetaLine(cleaned)) return null;
  if (/^\d+$/.test(cleaned)) return null;

  // Do not treat numbered worksheet tasks like "Aufgabe 1: Erkläre ..." as term:translation
  if (/^(?:aufgabe|übung|nr\.?|task)\s*\d+[a-z]?\s*:/i.test(cleaned)) {
    return null;
  }

  for (const sep of DELIMITERS) {
    const idx = cleaned.indexOf(sep);
    if (idx > 0 && idx < cleaned.length - sep.length) {
      const left = cleaned.slice(0, idx).trim();
      const right = cleaned.slice(idx + sep.length).trim();
      if (
        left &&
        right &&
        left.length <= 120 &&
        right.length <= 260 &&
        !/^(?:_{3,}|\.{4,})$/.test(right)
      ) {
        return { term: left, translation: right };
      }
    }
  }

  // Fallback: 2+ consecutive spaces acting as column separator
  const multiSpace = cleaned.match(/^(.+?)\s{2,}(.+)$/);
  if (multiSpace) {
    const left = multiSpace[1].trim();
    const right = multiSpace[2].trim();
    if (
      left &&
      right &&
      left.length <= 120 &&
      right.length <= 260 &&
      !/^(?:_{3,}|\.{4,})$/.test(right)
    ) {
      return { term: left, translation: right };
    }
  }

  return null;
}

function parseDelimitedLines(
  rawText: string,
  initialTopic?: string
): AlgorithmicExtractedRow[] {
  const rawLines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: AlgorithmicExtractedRow[] = [];
  let currentTopic = initialTopic;
  let inIgnoredSection = false;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const divider = classifySectionDivider(rawLine);
    if (divider) {
      if (divider.type === "ignore-section") {
        inIgnoredSection = true;
      } else {
        inIgnoredSection = false;
        if (divider.topic) currentTopic = divider.topic;
      }
      continue;
    }

    if (inIgnoredSection) {
      const maybeNewHeading = extractSectionHeading(rawLine);
      if (maybeNewHeading) {
        inIgnoredSection = false;
        currentTopic = maybeNewHeading;
      }
      continue;
    }

    if (isDividerOrSeparatorLine(rawLine)) continue;

    const line = cleanNonLetterNoise(rawLine, {
      preserveClozeBlanks: true,
      preserveHeadingHashes: true,
      preserveInternalPipe: true,
      preserveLeadingBullet: true,
    });
    if (!line || isWorksheetMetaLine(line)) continue;

    const section = extractSectionHeading(line);
    if (section) {
      currentTopic = section;
      continue;
    }

    const pair = splitDelimitedLine(line);
    if (!pair) {
      const cleanHeading = cleanCardField(line.replace(/^\d{1,2}[.)]\s+/, ""));
      if (
        cleanHeading.length >= 3 &&
        cleanHeading.length <= 45 &&
        cleanHeading.split(/\s+/).length <= 5 &&
        !/[.!?]$/.test(cleanHeading) &&
        !isWorksheetMetaLine(cleanHeading) &&
        !isDividerOrSeparatorLine(cleanHeading) &&
        !/^\d+$/.test(cleanHeading)
      ) {
        currentTopic = cleanHeading;
      }
      continue;
    }

    const cleanTerm = cleanCardField(pair.term);
    const cleanTrans = cleanCardField(pair.translation);
    if (!cleanTerm || !cleanTrans) continue;
    if (isHeaderRow(cleanTerm, cleanTrans)) continue;
    if (
      isDividerOrSeparatorLine(cleanTerm) ||
      isDividerOrSeparatorLine(cleanTrans)
    ) {
      continue;
    }

    parsed.push({
      term: cleanTerm,
      translation: cleanTrans,
      topic: currentTopic,
    });
  }
  return convertExtractedItemsToTasks(parsed);
}

function isLikelyHeadingLine(line: string): string | null {
  const explicit = extractSectionHeading(line);
  if (explicit) return explicit;

  const trimmed = line.replace(/^\d{1,2}(?:\.\d{1,2})?[.)]?\s+/, "").trim();
  if (
    trimmed.length >= 3 &&
    trimmed.length <= 60 &&
    trimmed.split(/\s+/).length <= 6 &&
    !/[.!?;,|]$/.test(trimmed) &&
    !isWorksheetMetaLine(trimmed) &&
    !/^\d+$/.test(trimmed) &&
    !/^[•▪‣◦●○*\-–—]\s+/.test(line) &&
    !/^(?:frage|antwort|f|a|q|aufgabe|übung|lösung|merke|definition|formel)\s*[:\-–]/i.test(
      trimmed
    ) &&
    !/_{3,}/.test(trimmed)
  ) {
    return trimmed;
  }
  return null;
}

function extractDefinitionFromSentence(
  sentence: string
): { term: string; translation: string } | null {
  const clean = sentence.trim();
  if (clean.length < 16 || clean.length > 340) return null;

  const unterMatch = clean.match(
    /^Unter\s+(?:einem|einer|dem|der|den)?\s*([^,.:;]{2,65}?)\s+versteht\s+man\s+(.+?)\.?$/i
  );
  if (unterMatch) {
    const term = unterMatch[1].trim();
    const translation = unterMatch[2].trim();
    if (term.length >= 2 && translation.length >= 6) {
      return { term, translation };
    }
  }

  const alsMatch = clean.match(
    /^Als\s+([^,.:;]{2,65}?)\s+bezeichnet\s+man\s+(.+?)\.?$/i
  );
  if (alsMatch) {
    const term = alsMatch[1].trim();
    const translation = alsMatch[2].trim();
    if (term.length >= 2 && translation.length >= 6) {
      return { term, translation };
    }
  }

  const bezMatch = clean.match(
    /^(?:Der|Die|Das|Ein|Eine)?\s*([A-ZÄÖÜ][^,.:;]{2,60}?)\s+(?:bezeichnet|bezeichnen|definiert|definieren|beschreibt|beschreiben|bedeutet|bedeuten|umfasst|umfassen)\s+(.+?)\.?$/
  );
  if (bezMatch) {
    const term = bezMatch[1].trim();
    const translation = bezMatch[2].trim();
    if (
      term.length >= 2 &&
      term.split(/\s+/).length <= 5 &&
      translation.length >= 8
    ) {
      return { term, translation };
    }
  }

  const istMatch = clean.match(
    /^(?:Der|Die|Das|Ein|Eine)?\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\-/(){}^_ ]{2,65}?)\s+(?:ist|sind)\s+((?:ein|eine|der|die|das|die Gesamtheit|ein Prozess|ein Verfahren|eine Form|ein Maß|eine Größe|die Lehre|ein Gesetz|das Verhältnis)[^.]{8,220})\.?$/
  );
  if (istMatch) {
    const term = istMatch[1].trim();
    const translation = istMatch[2].trim();
    if (
      term.split(/\s+/).length <= 5 &&
      !/^(es|dies|das|man|hier|dabei)$/i.test(term)
    ) {
      return { term, translation };
    }
  }

  return null;
}

const WORKSHEET_TASK_VERBS =
  /^(?:erkläre|erläutere|beschreibe|nenne|zähle\s+auf|berechne|bestimme|definiere|vergleiche|begründe|ergänze|fülle\s+aus|vervollständige|ordne\s+zu|zeichne|skizziere|formuliere|untersuche|überprüfe|prüfe|finde\s+heraus|gib\s+an|stelle\s+auf|löse|explain|describe|calculate|define|compare|complete|list)\b/i;

function matchWorksheetTaskLine(
  line: string
): { numKey: string | null; body: string } | null {
  const explicitTask = line.match(
    /^(?:aufgabe|übung|nr\.?|task)\s*(\d+[a-z]?)\s*[:.)\-–]?\s*(.+)$/i
  );
  if (explicitTask) {
    const body = stripTrailingFillBlanks(explicitTask[2]);
    if (body.length >= 4) {
      return { numKey: explicitTask[1].toLowerCase(), body };
    }
  }

  const numbered = line.match(/^(\d{1,2}[a-z]?)[.)]\s+(.+)$/i);
  if (numbered && !parseClozeLine(line)) {
    const body = stripTrailingFillBlanks(numbered[2]);
    if (
      body.length >= 6 &&
      (body.endsWith("?") ||
        WORKSHEET_TASK_VERBS.test(body) ||
        /^(?:was|wie|warum|weshalb|welche|welcher|welches|wofür|woraus|wodurch|wann|wo)\b/i.test(
          body
        ))
    ) {
      return { numKey: numbered[1].toLowerCase(), body };
    }
  }

  const cleanLine = stripTrailingFillBlanks(line);
  if (
    cleanLine.length >= 10 &&
    cleanLine.length <= 220 &&
    WORKSHEET_TASK_VERBS.test(cleanLine) &&
    !splitDelimitedLine(cleanLine)
  ) {
    return { numKey: null, body: cleanLine };
  }

  return null;
}

function parseClozeLine(
  line: string
): { prompt: string; answer: string } | null {
  if (isWorksheetMetaLine(line)) return null;
  const hasBlank = /_{3,}|\[\.\.\.\]|\(\s*_{2,}\s*\)/.test(line);
  if (!hasBlank) return null;

  // Ignore lines that are mostly underscores
  const withoutBlanks = line.replace(/[_\s.\[\]()]+/g, "");
  if (withoutBlanks.length < 8) return null;

  const bodyForCloze = line.replace(/^\d{1,2}[a-z]?[.)]\s+/i, "").trim();

  // Check inline solution: "Sentence with _____ (Solution)" or "-> Solution"
  const arrowSol = bodyForCloze.match(
    /^(.+?(?:_{3,}|\[\.\.\.\]|\(\s*_{2,}\s*\)).*?)\s*(?:->|→|=>|\/\/)\s*(.+)$/
  );
  if (arrowSol && arrowSol[2].trim().length >= 1) {
    return {
      prompt: `Lückentext: ${arrowSol[1].trim()}`,
      answer: arrowSol[2].trim(),
    };
  }

  const parenSol = bodyForCloze.match(
    /^(.+?(?:_{3,}|\[\.\.\.\]).*?)\s*\((?:lösung\s*:\s*)?([^()]{2,80})\)\.?$/i
  );
  if (parenSol && !/^_{2,}$/.test(parenSol[2].trim())) {
    return {
      prompt: `Lückentext: ${parenSol[1].trim()}`,
      answer: parenSol[2].trim(),
    };
  }

  return {
    prompt: `Lückentext: ${bodyForCloze}`,
    answer: "(Lösung noch ergänzen)",
  };
}

function parseSolutionsSection(lines: string[]): Map<string, string> {
  const solutions = new Map<string, string>();
  let inSolutions = false;
  let activeKey: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (isSolutionsSectionHeading(line)) {
      inSolutions = true;
      activeKey = null;
      continue;
    }

    if (!inSolutions) continue;

    const match = line.match(
      /^(?:zu\s+|aufgabe\s+|lösung\s+|antwort\s+|nr\.?\s*)?(\d{1,2}[a-z]?)\s*[:.)\-–]\s*(.+)$/i
    );
    if (match) {
      activeKey = match[1].toLowerCase();
      solutions.set(activeKey, match[2].trim());
    } else if (activeKey && !isWorksheetMetaLine(line)) {
      const prev = solutions.get(activeKey) || "";
      solutions.set(activeKey, `${prev} ${line}`.trim());
    }
  }

  return solutions;
}

/**
 * 100% offline algorithmic extractor for non-vocabulary subjects and worksheets
 * (notes, scripts, textbooks, Arbeitsblätter, Lückentexte, Q&A lists, definitions,
 * formulas, and structured headings + bullet lists).
 */
export function extractProseStudyCards(
  rawText: string,
  defaultTopic?: string
): AlgorithmicExtractedRow[] {
  const normalized = normalizeInlineSupSub(rawText).replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const rawLines = normalized.split("\n").map((l) => l.trim());
  const lines = rawLines.map((raw) => {
    if (!raw) return "";
    if (isDividerOrSeparatorLine(raw)) return raw;
    return cleanNonLetterNoise(raw, {
      preserveClozeBlanks: true,
      preserveHeadingHashes: true,
      preserveInternalPipe: true,
      preserveLeadingBullet: true,
    });
  });

  const solutionsMap = parseSolutionsSection(lines);

  const results: AlgorithmicExtractedRow[] = [];
  const seen = new Set<string>();

  const pushCard = (row: AlgorithmicExtractedRow) => {
    const term = cleanCardField(row.term);
    const translation = cleanCardField(row.translation);
    if (!term || !translation || term.length < 2 || translation.length < 2) return;
    if (isHeaderRow(term, translation)) return;
    if (isWorksheetMetaLine(term) || isDividerOrSeparatorLine(term)) return;
    const key = `${term.toLowerCase()}:::${translation.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      ...row,
      term,
      translation,
      topic: row.topic ? cleanCardField(row.topic) : defaultTopic,
    });
  };

  let currentTopic = defaultTopic;
  let pendingBulletHeading: string | null = null;
  let pendingBullets: string[] = [];
  let inIgnoredSection = false;

  const flushBullets = () => {
    if (pendingBulletHeading && pendingBullets.length >= 2) {
      pushCard({
        term: pendingBulletHeading,
        translation: pendingBullets.slice(0, 6).join(", "),
        partOfSpeech: "Aufzählung",
        topic: currentTopic || pendingBulletHeading,
      });
    }
    pendingBulletHeading = null;
    pendingBullets = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = rawLines[i];
    const line = lines[i];
    if (!line) {
      flushBullets();
      continue;
    }

    if (isSolutionsSectionHeading(line)) {
      // Stop main pass once the trailing solutions key begins
      flushBullets();
      break;
    }

    // Check section dividers & meta sections BEFORE stripping separators
    const divider = classifySectionDivider(rawLine) || classifySectionDivider(line);
    if (divider) {
      flushBullets();
      if (divider.type === "ignore-section") {
        inIgnoredSection = true;
        pendingBulletHeading = null;
        continue;
      }
      inIgnoredSection = false;
      if (divider.type === "topic") {
        currentTopic = divider.topic;
        pendingBulletHeading = divider.topic;
      } else {
        pendingBulletHeading = null;
      }
      continue;
    }

    if (inIgnoredSection) {
      const maybeHeading = extractSectionHeading(rawLine) || extractSectionHeading(line);
      if (maybeHeading) {
        inIgnoredSection = false;
        currentTopic = maybeHeading;
        pendingBulletHeading = maybeHeading;
      }
      continue;
    }

    if (isDividerOrSeparatorLine(rawLine) || isDividerOrSeparatorLine(line)) {
      flushBullets();
      pendingBulletHeading = null;
      continue;
    }

    if (isWorksheetMetaLine(line)) {
      continue;
    }

    // 0. Worksheet Callouts: "Merke: ...", "Definition: ...", "Formel: ..."
    const calloutMatch = line.match(
      /^(merke|merksatz|definition|formel|regel|wichtig)\s*[:\-–]\s*(.+)$/i
    );
    if (calloutMatch) {
      flushBullets();
      const label =
        calloutMatch[1].charAt(0).toUpperCase() +
        calloutMatch[1].slice(1).toLowerCase();
      const body = calloutMatch[2].trim();
      const isFormulaCallout =
        label.toLowerCase() === "formel" && body.includes("=");
      const bodyDef = isFormulaCallout ? null : extractDefinitionFromSentence(body);
      const bodyDelim = isFormulaCallout ? null : splitDelimitedLine(body);
      if (bodyDef) {
        pushCard({
          term: bodyDef.term,
          translation: bodyDef.translation,
          partOfSpeech: label,
          topic: currentTopic,
        });
      } else if (
        bodyDelim &&
        bodyDelim.term.length >= 2 &&
        bodyDelim.term.split(/\s+/).length <= 6
      ) {
        pushCard({
          term: bodyDelim.term,
          translation: bodyDelim.translation,
          partOfSpeech: label,
          topic: currentTopic,
        });
      } else if (body.length >= 4) {
        pushCard({
          term: currentTopic ? `${label}: ${currentTopic}` : label,
          translation: body,
          partOfSpeech: label,
          topic: currentTopic,
        });
      }
      continue;
    }

    // 1. Explicit Q&A prefixes: "Frage: ... / Antwort: ..."
    const qPrefixMatch = line.match(/^(?:frage|f|question|q)\s*[:\-–]\s*(.+)$/i);
    if (qPrefixMatch) {
      flushBullets();
      const question = stripTrailingFillBlanks(qPrefixMatch[1]);
      const answerParts: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j]) {
        if (isWorksheetMetaLine(lines[j])) {
          j++;
          continue;
        }
        const aMatch = lines[j].match(
          /^(?:antwort|a|answer|lösung|ergebnis)\s*[:\-–]\s*(.+)$/i
        );
        if (aMatch) {
          answerParts.push(aMatch[1].trim());
          j++;
          continue;
        }
        if (/^(?:frage|f|question|q|aufgabe)\s*[:\-–]/i.test(lines[j])) break;
        if (answerParts.length > 0 && !isLikelyHeadingLine(lines[j])) {
          answerParts.push(lines[j]);
          j++;
        } else {
          break;
        }
      }
      if (answerParts.length > 0) {
        pushCard({
          term: question,
          translation: answerParts.join(" "),
          topic: currentTopic,
        });
        i = j - 1;
        continue;
      }
    }

    // 2. Question ending in '?' OR Worksheet Task ("Aufgabe 1: ...", "1. Erkläre ...")
    const taskMatch = matchWorksheetTaskLine(line);
    if (
      taskMatch ||
      (line.endsWith("?") &&
        line.length >= 8 &&
        line.length <= 200 &&
        !isWorksheetMetaLine(line))
    ) {
      flushBullets();
      const questionText = taskMatch ? taskMatch.body : line;
      const numKey = taskMatch?.numKey || null;

      // Look ahead for checkboxes, explicit "Lösung:/Antwort:", or direct answer line
      const checkedOptions: string[] = [];
      const uncheckedOptions: string[] = [];
      const answerLines: string[] = [];
      let j = i + 1;

      while (j < lines.length && lines[j]) {
        const nextL = lines[j];
        if (isSolutionsSectionHeading(nextL)) break;
        if (isWorksheetMetaLine(nextL)) {
          j++;
          continue;
        }
        if (
          matchWorksheetTaskLine(nextL) ||
          /^(?:frage|f|question|q)\s*[:\-–]/i.test(nextL)
        ) {
          break;
        }

        const checkedCb = nextL.match(/^(?:\[[xX✓✔]\]|\([xX]\)|☑|✓)\s*(.+)$/);
        if (checkedCb) {
          checkedOptions.push(checkedCb[1].trim());
          j++;
          continue;
        }
        const uncheckedCb = nextL.match(/^(?:\[\s*\]|\(\s*\)|☐)\s*(.+)$/);
        if (uncheckedCb) {
          uncheckedOptions.push(uncheckedCb[1].trim());
          j++;
          continue;
        }

        const explicitAns = nextL.match(
          /^(?:antwort|a|answer|lösung|ergebnis)\s*[:\-–]\s*(.+)$/i
        );
        if (explicitAns) {
          const val = stripTrailingFillBlanks(explicitAns[1]);
          if (val) answerLines.push(val);
          j++;
          continue;
        }

        if (
          answerLines.length === 0 &&
          !nextL.endsWith("?") &&
          !extractSectionHeading(nextL) &&
          !parseClozeLine(nextL)
        ) {
          const cleaned = stripTrailingFillBlanks(nextL);
          if (cleaned) {
            answerLines.push(cleaned);
            j++;
            continue;
          }
        }
        break;
      }

      let finalAnswer = "";
      if (checkedOptions.length > 0) {
        finalAnswer = checkedOptions.join(" • ");
      } else if (answerLines.length > 0) {
        finalAnswer = answerLines.join(" ");
      } else if (numKey && solutionsMap.has(numKey)) {
        finalAnswer = solutionsMap.get(numKey) || "";
      } else if (uncheckedOptions.length > 0) {
        finalAnswer = `Optionen: ${uncheckedOptions.join(" / ")}`;
      } else if (taskMatch) {
        finalAnswer = "(Lösung noch ergänzen)";
      }

      if (finalAnswer) {
        pushCard({
          term: questionText,
          translation: finalAnswer,
          partOfSpeech: taskMatch ? "Aufgabe" : undefined,
          topic: currentTopic,
        });
        i = j - 1;
        continue;
      }
    }

    // 3. Lückentext / Cloze sentence on worksheet
    const cloze = parseClozeLine(line);
    if (cloze) {
      flushBullets();
      const numMatch = line.match(/^(\d{1,2}[a-z]?)[.)]\s+/i);
      const mappedSol =
        numMatch && solutionsMap.get(numMatch[1].toLowerCase());
      pushCard({
        term: cloze.prompt,
        translation: mappedSol || cloze.answer,
        partOfSpeech: "Lückentext",
        topic: currentTopic,
      });
      continue;
    }

    // 4. Bullet lines
    const bulletMatch = line.match(
      /^(?:[•▪‣◦●○*\-–—]|(?:\d{1,2}[.)]))\s+(.+)$/
    );
    if (bulletMatch) {
      const bulletBody = bulletMatch[1].trim();
      const pairInBullet = splitDelimitedLine(bulletBody);
      if (pairInBullet && pairInBullet.term.length <= 80) {
        pushCard({
          term: pairInBullet.term,
          translation: pairInBullet.translation,
          topic: currentTopic,
        });
        continue;
      }
      const defInBullet = extractDefinitionFromSentence(bulletBody);
      if (defInBullet) {
        pushCard({
          term: defInBullet.term,
          translation: defInBullet.translation,
          topic: currentTopic,
        });
        continue;
      }
      if (
        !pendingBulletHeading ||
        bulletBody.split(/\s+/).length >= 6 ||
        /[.!?]$/.test(bulletBody)
      ) {
        const proseInBullet = extractProseTaskFromSentence(
          bulletBody,
          currentTopic
        );
        if (proseInBullet) {
          flushBullets();
          pushCard({
            term: proseInBullet.term,
            translation: proseInBullet.translation,
            topic: currentTopic,
          });
          continue;
        }
      }
      if (
        pendingBulletHeading &&
        bulletBody.length >= 3 &&
        bulletBody.length <= 160 &&
        !isBoilerplateOrUnimportant(bulletBody) &&
        !isDividerOrSeparatorLine(bulletBody)
      ) {
        const cleanBullet = cleanCardField(bulletBody);
        if (cleanBullet) pendingBullets.push(cleanBullet);
        continue;
      }
    }

    // 5. Section heading detection
    const heading = isLikelyHeadingLine(line);
    if (heading && !splitDelimitedLine(line)) {
      flushBullets();
      const cleanHeading = cleanCardField(heading);
      currentTopic = cleanHeading;
      pendingBulletHeading = cleanHeading;
      continue;
    }

    flushBullets();

    // 6. Delimited line (term : explanation, formula = meaning, term -> meaning)
    const delimited = splitDelimitedLine(line);
    if (delimited) {
      if (
        delimited.term.split(/\s+/).length <= 8 ||
        delimited.term.includes("=")
      ) {
        pushCard({
          term: delimited.term,
          translation: delimited.translation,
          topic: currentTopic,
        });
        continue;
      }
    }

    // 7. Important prose facts & definition sentences -> convert directly into active study tasks
    const sentences = line
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      if (isBoilerplateOrUnimportant(sentence)) continue;

      const proseTask = extractProseTaskFromSentence(sentence, currentTopic);
      if (proseTask) {
        pushCard({
          term: proseTask.term,
          translation: proseTask.translation,
          topic: currentTopic,
        });
        continue;
      }

      const def = extractDefinitionFromSentence(sentence);
      if (def) {
        pushCard({
          term: def.term,
          translation: def.translation,
          topic: currentTopic,
        });
      }
    }
  }

  flushBullets();
  return convertExtractedItemsToTasks(results);
}

/**
 * Raw + structured extraction helper for Word (.docx) files (used by Notebooks & Import).
 * Preserves <sup> and <sub> via HTML conversion as ^{...} and _{...}.
 */
export async function extractWordRawOffline(
  file: File
): Promise<WordRawExtractResult> {
  const arrayBuffer = await file.arrayBuffer();
  const [textRes, htmlRes] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml({ arrayBuffer }),
  ]);

  const html = htmlRes.value || "";
  const formattedFromHtml = html ? extractDocxFormattedRawText(html) : "";
  const rawText = (formattedFromHtml || textRes.value || "").trim();
  const { tableRows, unansweredTableRows } = parseDocxHtmlStructured(html);
  const delimitedItems = rawText ? parseDelimitedLines(rawText) : [];

  // Prefer answered table rows; only fall back to empty-column worksheet table rows
  // if no answered rows and no delimited items exist.
  const effectiveTableItems =
    tableRows.length > 0
      ? tableRows
      : delimitedItems.length === 0
        ? unansweredTableRows
        : [];

  return {
    rawText,
    tableItems: effectiveTableItems,
    delimitedItems,
  };
}

/**
 * 100% offline, algorithmic Word (.docx) extraction using mammoth browser bundle.
 */
export async function parseWordDocxOffline(
  file: File
): Promise<OfflineDocParseResult> {
  const { rawText, tableItems, delimitedItems } = await extractWordRawOffline(
    file
  );

  if (!rawText) {
    throw new Error("Das Word-Dokument enthält keinen lesbaren Text.");
  }

  const proseItems = extractProseStudyCards(rawText);

  if (tableItems.length > 0 && tableItems.length >= proseItems.length) {
    return {
      items: tableItems,
      method: "Algorithmische Word-Tabellen- & Themenerkennung (.docx)",
      rawPreview: rawText.slice(0, 600),
      rawText,
    };
  }

  if (delimitedItems.length > 0 && delimitedItems.length >= proseItems.length) {
    return {
      items: delimitedItems,
      method: "Algorithmische Zeilen- & Themenanalyse (.docx)",
      rawPreview: rawText.slice(0, 600),
      rawText,
    };
  }

  if (proseItems.length > 0) {
    return {
      items: proseItems,
      method: "Algorithmische Arbeitsblatt-, Definitionen- & Abschnitts-Analyse (.docx)",
      rawPreview: rawText.slice(0, 600),
      rawText,
    };
  }

  if (tableItems.length > 0) {
    return {
      items: tableItems,
      method: "Algorithmische Word-Tabellen- & Themenerkennung (.docx)",
      rawPreview: rawText.slice(0, 600),
      rawText,
    };
  }

  throw new Error(
    "Im Word-Dokument wurden keine strukturierten Lernpaare, Aufgaben oder Definitionen erkannt."
  );
}

interface PdfTextSpan {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

type ScriptKind = "normal" | "sup" | "sub";

interface ClassifiedSpan extends PdfTextSpan {
  script: ScriptKind;
}

function median(values: number[]): number {
  if (values.length === 0) return 10;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function reconstructPdfRowText(rowSpans: PdfTextSpan[]): {
  cleanLine: string;
  segments: string[];
} {
  if (rowSpans.length === 0) return { cleanLine: "", segments: [] };

  const sorted = [...rowSpans].sort((a, b) => a.x - b.x);
  const maxRowFont = Math.max(...sorted.map((s) => s.fontSize), 8);

  // Dominant font size weighted by text length from normal-sized spans
  const normalSizeCandidates = sorted.filter(
    (s) => s.fontSize >= maxRowFont * 0.72
  );
  const baseFontSize =
    normalSizeCandidates.length > 0
      ? median(normalSizeCandidates.map((s) => s.fontSize))
      : maxRowFont;

  const baseLineCandidates = sorted.filter(
    (s) => s.fontSize >= baseFontSize * 0.88
  );
  const baseY =
    baseLineCandidates.length > 0
      ? median(baseLineCandidates.map((s) => s.y))
      : median(sorted.map((s) => s.y));

  // Classify each span as normal, superscript, or subscript
  const classified: ClassifiedSpan[] = sorted.map((s) => {
    const isSmaller = s.fontSize <= baseFontSize * 0.87;
    const dy = s.y - baseY;
    let script: ScriptKind = "normal";
    if (isSmaller) {
      if (dy >= Math.max(1.0, baseFontSize * 0.13) && dy <= baseFontSize * 0.85) {
        script = "sup";
      } else if (
        -dy >= Math.max(0.9, baseFontSize * 0.09) &&
        -dy <= baseFontSize * 0.65
      ) {
        script = "sub";
      }
    }
    return { ...s, script };
  });

  // Merge adjacent spans of the same script (e.g. "2" + "-" in ^{2-})
  const merged: ClassifiedSpan[] = [];
  for (const span of classified) {
    const prev = merged[merged.length - 1];
    const gap = prev ? span.x - (prev.x + prev.width) : 0;
    if (
      prev &&
      prev.script === span.script &&
      span.script !== "normal" &&
      gap < baseFontSize * 0.35
    ) {
      const joinSpace = gap > baseFontSize * 0.16 ? " " : "";
      prev.str = `${prev.str}${joinSpace}${span.str}`;
      prev.width = Math.max(prev.width, span.x + span.width - prev.x);
    } else {
      merged.push({ ...span });
    }
  }

  let lineStr = "";
  let prevEndX = merged[0].x;
  let prevScript: ScriptKind = "normal";
  const segments: string[] = [];
  let currentSeg = "";

  const formatSpan = (s: ClassifiedSpan): string => {
    const t = s.str.trim();
    if (!t) return s.str;
    if (s.script === "sup") return `^{${t}}`;
    if (s.script === "sub") return `_{${t}}`;
    return s.str;
  };

  for (let i = 0; i < merged.length; i++) {
    const s = merged[i];
    const token = formatSpan(s);
    const gap = i === 0 ? 0 : s.x - prevEndX;
    const isScriptTransition =
      i > 0 && (s.script !== "normal" || prevScript !== "normal");

    const columnGapThreshold = Math.max(18, baseFontSize * 1.5);
    const wordGapThreshold = isScriptTransition
      ? Math.max(2.6, baseFontSize * 0.24)
      : 2.5;

    if (i > 0 && gap > columnGapThreshold) {
      segments.push(currentSeg.trim());
      currentSeg = token;
      lineStr += "   " + token;
    } else if (i > 0 && gap > wordGapThreshold) {
      currentSeg += " " + token;
      lineStr += " " + token;
    } else {
      currentSeg += token;
      lineStr += token;
    }

    prevEndX = Math.max(prevEndX, s.x + s.width);
    prevScript = s.script;
  }

  if (currentSeg.trim()) segments.push(currentSeg.trim());

  const cleanLine = cleanNonLetterNoise(lineStr, {
    preserveClozeBlanks: true,
    preserveHeadingHashes: true,
    preserveInternalPipe: true,
    preserveLeadingBullet: true,
  });

  const cleanedSegments = segments
    .map((seg) => cleanCardField(seg))
    .filter((seg) => seg.length > 0 && !isDividerOrSeparatorLine(seg));

  return {
    cleanLine,
    segments: cleanedSegments,
  };
}

/**
 * Raw + structured extraction helper for PDF files (used by Notebooks & Import).
 * Reconstructs visual rows by Y-coordinate and detects superscripts / subscripts.
 */
export async function extractPdfRawOffline(
  file: File
): Promise<PdfRawExtractResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const allLinesText: string[] = [];
  const columnCandidateRows: AlgorithmicExtractedRow[] = [];
  let currentPdfTopic: string | undefined;
  let inIgnoredSection = false;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const spans: PdfTextSpan[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const text = item.str;
      if (!text || !text.trim()) continue;
      const transform = item.transform as number[];
      const fontSize = Math.max(
        Math.abs(transform[3] || 0),
        Math.abs(transform[0] || 0),
        item.height || 0,
        8
      );
      spans.push({
        str: text,
        x: transform[4] || 0,
        y: transform[5] || 0,
        width: item.width || 0,
        fontSize,
      });
    }

    if (spans.length === 0) continue;

    // Determine dominant normal font size on this page
    const pageFontMedian = median(
      spans.filter((s) => s.str.trim().length >= 2).map((s) => s.fontSize)
    );

    // Pass 1: Cluster normal-sized spans into baseline rows (Y tolerance 4.5pt)
    const normalSpans = spans
      .filter((s) => s.fontSize >= pageFontMedian * 0.85)
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const smallSpans = spans.filter((s) => s.fontSize < pageFontMedian * 0.85);

    interface RowBucket {
      baseY: number;
      baseFont: number;
      minX: number;
      maxX: number;
      spans: PdfTextSpan[];
    }

    const rowBuckets: RowBucket[] = [];
    for (const span of normalSpans) {
      const last = rowBuckets[rowBuckets.length - 1];
      if (!last || Math.abs(last.baseY - span.y) > 4.5) {
        rowBuckets.push({
          baseY: span.y,
          baseFont: span.fontSize,
          minX: span.x,
          maxX: span.x + span.width,
          spans: [span],
        });
      } else {
        last.spans.push(span);
        last.minX = Math.min(last.minX, span.x);
        last.maxX = Math.max(last.maxX, span.x + span.width);
      }
    }

    // Pass 2: Attach small spans (superscripts/subscripts) to nearest matching row
    const orphanSmall: PdfTextSpan[] = [];
    for (const sm of smallSpans) {
      let bestBucket: RowBucket | null = null;
      let bestDist = Infinity;

      for (const bucket of rowBuckets) {
        const dy = sm.y - bucket.baseY;
        const withinSupSubRange =
          dy <= bucket.baseFont * 0.82 && dy >= -bucket.baseFont * 0.65;
        const nearHorizontally =
          sm.x >= bucket.minX - 28 && sm.x <= bucket.maxX + 28;
        if (withinSupSubRange && nearHorizontally) {
          const dist = Math.abs(dy);
          if (dist < bestDist) {
            bestDist = dist;
            bestBucket = bucket;
          }
        }
      }

      if (bestBucket) {
        bestBucket.spans.push(sm);
        bestBucket.minX = Math.min(bestBucket.minX, sm.x);
        bestBucket.maxX = Math.max(bestBucket.maxX, sm.x + sm.width);
      } else {
        orphanSmall.push(sm);
      }
    }

    // Any remaining small spans (e.g. uniform small-font footnote lines) form own rows
    orphanSmall.sort((a, b) => b.y - a.y || a.x - b.x);
    const orphanRows: RowBucket[] = [];
    for (const sm of orphanSmall) {
      const last = orphanRows[orphanRows.length - 1];
      if (!last || Math.abs(last.baseY - sm.y) > 4.0) {
        orphanRows.push({
          baseY: sm.y,
          baseFont: sm.fontSize,
          minX: sm.x,
          maxX: sm.x + sm.width,
          spans: [sm],
        });
      } else {
        last.spans.push(sm);
      }
    }

    const allBuckets = [...rowBuckets, ...orphanRows].sort(
      (a, b) => b.baseY - a.baseY
    );

    for (const bucket of allBuckets) {
      const { cleanLine, segments } = reconstructPdfRowText(bucket.spans);
      if (!cleanLine || isDividerOrSeparatorLine(cleanLine)) continue;
      allLinesText.push(cleanLine);

      const divider = classifySectionDivider(cleanLine);
      if (divider) {
        if (divider.type === "ignore-section") {
          inIgnoredSection = true;
        } else {
          inIgnoredSection = false;
          if (divider.topic) currentPdfTopic = divider.topic;
        }
        continue;
      }

      if (inIgnoredSection) {
        const nextHeading = extractSectionHeading(cleanLine);
        if (nextHeading) {
          inIgnoredSection = false;
          currentPdfTopic = nextHeading;
        }
        continue;
      }

      if (isWorksheetMetaLine(cleanLine)) continue;

      const section = extractSectionHeading(cleanLine);
      if (section) {
        currentPdfTopic = section;
        continue;
      }

      // Check 2+ column layout extracted by spatial X gap
      const nonEmptySegs = segments
        .map((seg) => seg.replace(/^\d{1,3}[.)]\s+/, "").trim())
        .filter(Boolean);

      if (nonEmptySegs.length === 1) {
        const single = nonEmptySegs[0];
        if (
          single.length >= 3 &&
          single.length <= 48 &&
          single.split(/\s+/).length <= 5 &&
          !/[.!?]$/.test(single) &&
          !isWorksheetMetaLine(single) &&
          !isDividerOrSeparatorLine(single) &&
          !/^\d+$/.test(single) &&
          !splitDelimitedLine(single)
        ) {
          currentPdfTopic = single;
        }
        continue;
      }

      if (nonEmptySegs.length >= 2) {
        const colA = cleanCardField(stripTrailingFillBlanks(nonEmptySegs[0]));
        const colB = cleanCardField(stripTrailingFillBlanks(nonEmptySegs[1]));
        if (
          colA &&
          colB &&
          colA.length <= 120 &&
          colB.length <= 240 &&
          !/^\d+$/.test(colA) &&
          !isWorksheetMetaLine(colA) &&
          !isDividerOrSeparatorLine(colA) &&
          !isDividerOrSeparatorLine(colB) &&
          !isHeaderRow(colA, colB)
        ) {
          const exampleSentence = cleanCardField(nonEmptySegs[2] || "");
          columnCandidateRows.push({
            term: colA,
            translation: colB,
            exampleSentence,
            topic: currentPdfTopic,
          });
        }
      }
    }
  }

  const rawText = allLinesText.join("\n").trim();
  const delimitedItems = rawText ? parseDelimitedLines(rawText) : [];

  return {
    rawText,
    columnItems: convertExtractedItemsToTasks(columnCandidateRows),
    delimitedItems,
  };
}

/**
 * 100% offline, purely algorithmic PDF vocabulary, worksheet & study card extractor
 * via pdfjs-dist. Reconstructs visual rows by Y-coordinate, preserves superscripts &
 * subscripts, and detects multi-column tables, tasks, cloze sentences, delimited lines,
 * and prose definitions.
 */
export async function parsePdfOffline(file: File): Promise<OfflineDocParseResult> {
  const { rawText, columnItems, delimitedItems } = await extractPdfRawOffline(
    file
  );

  if (!rawText) {
    throw new Error(
      "Das PDF enthält keinen extrahierbaren Text (möglicherweise ein reiner Bild-Scan)."
    );
  }

  const proseItems = extractProseStudyCards(rawText);

  if (
    columnItems.length >= delimitedItems.length &&
    columnItems.length >= proseItems.length &&
    columnItems.length > 0
  ) {
    return {
      items: columnItems,
      method: "Algorithmische PDF-Spalten- & Themenerkennung (.pdf)",
      rawPreview: rawText.slice(0, 600),
      rawText,
    };
  }

  if (delimitedItems.length > 0 && delimitedItems.length >= proseItems.length) {
    return {
      items: delimitedItems,
      method: "Algorithmische PDF-Zeilen- & Themenanalyse (.pdf)",
      rawPreview: rawText.slice(0, 600),
      rawText,
    };
  }

  if (proseItems.length > 0) {
    return {
      items: proseItems,
      method: "Algorithmische PDF-Arbeitsblatt-, Definitionen- & Abschnitts-Analyse (.pdf)",
      rawPreview: rawText.slice(0, 600),
      rawText,
    };
  }

  throw new Error(
    "In dieser PDF-Datei konnten keine eindeutigen Spalten, Aufgaben, Lückentexte oder Definitionen erkannt werden."
  );
}
