import { detectPackageLanguageCombo } from "../data/languages";

const SUP_TOKEN_PREFIX = "\u0001SUP";
const SUB_TOKEN_PREFIX = "\u0001SUB";
const BLANK_TOKEN_PREFIX = "\u0001BLK";
const TOKEN_SUFFIX = "\u0002";

const ALREADY_TASK_OR_QUESTION_RE =
  /^(?:lü[c]?kentext\s*:|aufgabe\s*\d*|frage\s*:|was\b|wie\b|warum\b|weshalb\b|wieso\b|wofür\b|woraus\b|wodurch\b|womit\b|worin\b|wann\b|wo\b|wer\b|welch(?:e|er|es|en|em)?\b|erkläre\b|erläutere\b|beschreibe\b|nenne\b|zähle\b|berechne\b|bestimme\b|definiere\b|vergleiche\b|begründe\b|ergänze\b|formuliere\b|untersuche\b|überprüfe\b|prüfe\b|gib\b|stelle\b|löse\b|ordne\b|explain\b|describe\b|define\b|calculate\b|compare\b|list\b)/i;

const PRONOUN_OR_FILLER_SUBJECT_RE =
  /^(?:es|dies|dieses|diese|dieser|das|man|hier|dabei|dort|dadurch|deshalb|darum|folgendes|folgende|sie|er|wir|ihr|etwas|nichts|alles|manches|viele|einige)$/i;

/**
 * Strips non-letter noise, PDF/Word PUA glyphs (Wingdings bullets, etc.),
 * box-drawing characters, replacement chars, zero-width spaces, and stray symbols
 * while strictly preserving:
 * - inline ^{...} / _{...} superscript & subscript formatting markers
 * - intentional cloze blanks (_____ / [...]) when preserveClozeBlanks is true
 * - valid math/chemistry operators, units, parentheses, and language punctuation
 */
export function cleanNonLetterNoise(
  input: string,
  options?: {
    preserveClozeBlanks?: boolean;
    preserveHeadingHashes?: boolean;
    preserveInternalPipe?: boolean;
    preserveLeadingBullet?: boolean;
  }
): string {
  if (!input) return "";

  const preserveClozeBlanks = options?.preserveClozeBlanks ?? true;
  const preserveHeadingHashes = options?.preserveHeadingHashes ?? false;
  const preserveInternalPipe = options?.preserveInternalPipe ?? false;
  const preserveLeadingBullet = options?.preserveLeadingBullet ?? false;

  // 1. Normalize line checkboxes & optional leading bullets before stripping dingbats/PUA
  let text = input
    .replace(/\u00a0/g, " ")
    .replace(/\u00ad/g, "") // Soft hyphen inside split words -> join directly
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ")
    .replace(/\uFFFD/g, "");

  if (preserveLeadingBullet) {
    text = text.replace(
      /^[ \t]*(?:[•▪‣◦●○◆◇■□▲△▼▽►◄◀▶➤➢➣❖✦✧]|[\uE000-\uF8FF]|[*\-–—](?![*\-–—]))[ \t]+(?=\S)/gm,
      "\u0001BULLET\u0002"
    );
  }

  text = text
    .replace(/[\uE000-\uF8FF]/g, " ") // Private Use Area (Wingdings/Symbol bullets)
    .replace(/^[ \t]*(?:☑|✓|✔)\s+/gm, "[x] ")
    .replace(/^[ \t]*☐\s+/gm, "[ ] ");

  // 2. Protect ^{...}, _{...}, and intentional cloze blanks using control delimiters
  //    (guaranteed unused because all control chars were just stripped in step 1)
  const supTokens: string[] = [];
  const subTokens: string[] = [];
  const blankTokens: string[] = [];

  text = text.replace(/\^\{([^{}\n]{1,40})\}/g, (_, inner: string) => {
    const cleanInner = inner.trim();
    if (!cleanInner) return "";
    const idx = supTokens.length;
    supTokens.push(`^{${cleanInner}}`);
    return `${SUP_TOKEN_PREFIX}${idx}${TOKEN_SUFFIX}`;
  });

  text = text.replace(/_\{([^{}\n]{1,40})\}/g, (_, inner: string) => {
    const cleanInner = inner.trim();
    if (!cleanInner) return "";
    const idx = subTokens.length;
    subTokens.push(`_{${cleanInner}}`);
    return `${SUB_TOKEN_PREFIX}${idx}${TOKEN_SUFFIX}`;
  });

  if (preserveClozeBlanks) {
    text = text.replace(/(?:_{3,}|\[\.\.\.\]|\(\s*_{2,}\s*\))/g, (match) => {
      const idx = blankTokens.length;
      blankTokens.push(match);
      return `${BLANK_TOKEN_PREFIX}${idx}${TOKEN_SUFFIX}`;
    });
  }

  // 3. Remove box-drawing, block elements, geometric shapes, dingbats, emojis
  text = text
    .replace(/[\u2500-\u259F]/g, " ") // Box drawing & block elements
    .replace(/[\u2600-\u27BF]/g, " ") // Misc symbols & dingbats (★☆✓✕●◆■▲►❖✦ etc.)
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, " "); // Emoji & pictographs

  // Remove section sign § unless followed by a paragraph number like "§ 242" or "§12"
  text = text.replace(/§(?!\s*\d)/g, " ");

  // Remove stray decorative/technical punctuation not part of prose or math
  text = text
    .replace(/[†‡¶•▪‣◦●○◆◇■□▲△▼▽►◄◀▶➤➢❖✦✧➔➝➜➞※◊¤¦¬`]/g, " ")
    .replace(/~+/g, " ")
    .replace(/\^+/g, " ")
    .replace(/_+/g, " ")
    .replace(/\*{2,}/g, " ")
    .replace(/={3,}/g, " ")
    .replace(/[-–—]{3,}/g, " ")
    .replace(/\/{2,}/g, " ")
    .replace(/\\{2,}/g, " ");

  // Preserve middle dot "·" ONLY inside math/physics/chemistry expressions (e.g. "m · c^{2}")
  const hasFormulaContext =
    /[=±≈≠≤≥∑√∫π×÷²³]/.test(text) ||
    text.includes(SUP_TOKEN_PREFIX) ||
    text.includes(SUB_TOKEN_PREFIX);

  if (hasFormulaContext) {
    text = text.replace(/(^|\s)·+(\s|$)/g, (m, before, after, offset) => {
      const leftChar = offset > 0 ? text[offset - 1] : "";
      const rightChar =
        offset + m.length < text.length ? text[offset + m.length] : "";
      if (
        /[\p{L}\d)\]}\u0002]/u.test(leftChar) &&
        /[\p{L}\d({[\u0001]/u.test(rightChar)
      ) {
        return `${before}·${after}`;
      }
      return " ";
    });
  } else {
    text = text.replace(/·+/g, " ");
  }

  // Handle hashes and pipes
  if (!preserveHeadingHashes) {
    text = text.replace(/#+/g, " ");
  } else {
    text = text.replace(/#{7,}/g, " ");
    text = text.replace(/(?<!^)(?<!\n)#+/g, " ");
  }

  if (!preserveInternalPipe) {
    text = text.replace(/\|+/g, " ");
  } else {
    text = text
      .replace(/^\s*\|+\s*/gm, "")
      .replace(/\s*\|+\s*$/gm, "")
      .replace(/\|{2,}/g, " ");
  }

  // Strip stray isolated single asterisks (e.g. "* Wort *") while keeping "3 * 4" multiplication
  text = text.replace(/(?<![\d)\]}\u0002])\s*\*\s*(?![\d({[\u0001])/g, " ");

  // Collapse whitespace
  text = text.replace(/[ \t]{2,}/g, " ").trim();

  // 4. Trim stray leading/trailing non-letter wrappers while keeping valid brackets, quotes, negative numbers, Spanish ¿¡
  text = text
    .replace(
      /^[\s,;:.+\-–—/\\><»«›‹]+(?=[A-Za-zÄÖÜäöüß\p{L}\u0001])/u,
      (lead) => {
        return lead.includes("¿") || lead.includes("¡") ? lead : "";
      }
    )
    .replace(/[\s,;:\-–—/\\<>»«›‹]+$/g, "")
    .trim();

  // 5. Restore protected tokens
  text = text
    .replace(/\u0001BULLET\u0002/g, "• ")
    .replace(/\u0001SUP(\d+)\u0002/g, (_, idx) => supTokens[Number(idx)] || "")
    .replace(/\u0001SUB(\d+)\u0002/g, (_, idx) => subTokens[Number(idx)] || "")
    .replace(
      /\u0001BLK(\d+)\u0002/g,
      (_, idx) => blankTokens[Number(idx)] || ""
    );

  return text.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Strips leading bullet/numbering symbols and outer stray characters from a single card field.
 */
export function cleanCardField(input: string): string {
  if (!input) return "";
  let cleaned = cleanNonLetterNoise(input, {
    preserveClozeBlanks: true,
    preserveHeadingHashes: false,
    preserveInternalPipe: false,
  });

  // Remove stray unmatched brackets at edges
  cleaned = cleaned
    .replace(/^[\s\-–—•▪‣◦●○*:;,]+/, "")
    .replace(/[\s\-–—•▪‣◦●○*:;,]+$/, "")
    .trim();

  return cleaned;
}

/**
 * Checks whether a string contains enough actual letters (or valid formula tokens)
 * rather than being non-letter noise or stray punctuation.
 */
export function hasMeaningfulLetters(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const withoutTokens = trimmed
    .replace(/\^\{([^}]*)\}/g, "$1")
    .replace(/_\{([^}]*)\}/g, "$1");

  const letters = withoutTokens.match(/\p{L}/gu) || [];
  const digits = withoutTokens.match(/\d/g) || [];
  const nonSpace = withoutTokens.replace(/\s+/g, "");
  if (nonSpace.length === 0) return false;

  const isMathOrChem =
    /[=±≈≠≤≥∑√∫π×÷→←↔]|(?:\^\{|_\{)/.test(trimmed) &&
    (letters.length >= 1 || digits.length >= 1);

  if (isMathOrChem) {
    const alnumCount = letters.length + digits.length;
    return alnumCount >= 2 && alnumCount / nonSpace.length >= 0.28;
  }

  if (letters.length < 2) return false;

  const alnumRatio = (letters.length + digits.length) / nonSpace.length;
  return alnumRatio >= 0.38;
}

const META_IGNORE_SECTION_RE =
  /^(?:inhaltsverzeichnis|table of contents|literaturverzeichnis|quellenverzeichnis|quellenangaben|bildverzeichnis|bildnachweis|bildquellen|abbildungsverzeichnis|tabellenverzeichnis|abkürzungsverzeichnis|impressum|danksagung|stichwortverzeichnis|glossarverzeichnis)$/i;

const STRUCTURAL_DIVIDER_RE =
  /^(?:teil|section|sektion|abschnitt|kapitel|chapter|block|modul|module|station|lernfeld|einheit|unit|lektion|lesson|themenbereich|thema|topic|aufgabenblock|arbeitsblatt)\s*(?:[a-z]\b|\d+[a-z]?|[ivx]+\b)?(?:\s*[:\-–—.]\s*(.+))?$/i;

const GENERIC_DIVIDER_ONLY_RE =
  /^(?:übungsteil|theorieteil|praxisteil|aufgabenteil|merkteil|wiederholungsteil|einstieg|vertiefung|wiederholung|sicherung|zusammenfassung|überblick|exkurs|ergänzung)(?:\s*[:\-–—]\s*(.+))?$/i;

export type SectionDividerClassification =
  | { type: "ignore-section" }
  | { type: "topic"; topic: string }
  | { type: "divider"; topic?: string };

/**
 * Recognizes structural section dividers (e.g. "Teil B: Zellatmung", "Abschnitt 2",
 * "=== Grundlagen ===", "Übungsteil") and ignorable meta sections ("Inhaltsverzeichnis",
 * "Literaturverzeichnis", "Impressum").
 */
export function classifySectionDivider(
  rawLine: string
): SectionDividerClassification | null {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.length > 100) return null;

  // Strip decorative outer borders like === Titel ===, --- Teil A ---, ## Kapitel 1
  const stripped = trimmed
    .replace(/^[\s=\-#*~_|/\\•·★☆◆■►]+/, "")
    .replace(/[\s=\-#*~_|/\\•·★☆◆■►:]+$/, "")
    .trim();

  if (!stripped || !hasMeaningfulLetters(stripped)) return null;

  if (META_IGNORE_SECTION_RE.test(stripped)) {
    return { type: "ignore-section" };
  }

  const structMatch = stripped.match(STRUCTURAL_DIVIDER_RE);
  if (structMatch) {
    const subtitle = structMatch[1]?.trim();
    if (subtitle && subtitle.length >= 2 && hasMeaningfulLetters(subtitle)) {
      return { type: "topic", topic: cleanCardField(subtitle) };
    }
    // Pure divider like "Teil A" or "Abschnitt 2" or "Block 1"
    const isSpecificUnit =
      /^(?:kapitel|chapter|modul|module|thema|topic|lernfeld|lektion|lesson|unit|arbeitsblatt)\s+/i.test(
        stripped
      );
    return isSpecificUnit
      ? { type: "topic", topic: cleanCardField(stripped) }
      : { type: "divider" };
  }

  const genericMatch = stripped.match(GENERIC_DIVIDER_ONLY_RE);
  if (genericMatch) {
    const subtitle = genericMatch[1]?.trim();
    if (subtitle && subtitle.length >= 2 && hasMeaningfulLetters(subtitle)) {
      return { type: "topic", topic: cleanCardField(subtitle) };
    }
    return { type: "divider" };
  }

  return null;
}

/**
 * Detects pure visual separator / divider lines, page markers, TOC dot-leader lines,
 * and non-letter symbol clutter lines that carry no learnable information.
 */
export function isDividerOrSeparatorLine(rawLine: string): boolean {
  const trimmed = rawLine.trim();
  if (!trimmed) return true;

  // Pure punctuation / box drawing / symbols / numbers with separators
  if (
    /^[=\-_~*#•·▪‣◦●○◆◇■□▲△▼▽►◄★☆+|/\\.,:;!?()[\]{}<>\u2500-\u259F\s]{2,}$/.test(
      trimmed
    )
  ) {
    return true;
  }

  // Page dividers like "--- Seite 3 ---", "Seite 2 / 8", "- 4 -", "[Seite 5]"
  if (
    /^(?:[=\-*~|\[\]()\s]*)(?:seite|page|folie|slide|s\.|p\.)\s*\d+(?:\s*(?:von|of|\/)\s*\d+)?(?:[=\-*~|\[\]()\s]*)$/i.test(
      trimmed
    ) ||
    /^[=\-*~|\[\]()\s]*\d{1,4}[=\-*~|\[\]()\s]*$/.test(trimmed)
  ) {
    return true;
  }

  // Table-of-contents dotted/dashed lines: "1.2 Osmose .......... 14"
  if (
    /(?:\.{4,}|_{4,}|-{4,})\s*\d{1,4}\s*$/.test(trimmed) ||
    /^\d+(?:\.\d+)*\s+[^.!?\n]{2,60}\s+\.{3,}\s*\d{1,4}$/.test(trimmed)
  ) {
    return true;
  }

  // If it's a recognized decorated section heading (like "=== Zellatmung ==="), don't treat as empty separator
  if (/^[=\-#*~]{2,}/.test(trimmed) && hasMeaningfulLetters(trimmed)) {
    const inner = trimmed
      .replace(/^[=\-#*~_|/\\•·\s]+/, "")
      .replace(/[=\-#*~_|/\\•·\s]+$/, "")
      .trim();
    if (inner.length >= 2 && hasMeaningfulLetters(inner)) {
      return false;
    }
  }

  // Lines where non-letter symbols dominate without forming a valid formula
  return !hasMeaningfulLetters(trimmed);
}

/**
 * Detects boilerplate, organizational metadata, empty filler introductions,
 * and cross-references that just "sit there" without carrying study-relevant knowledge.
 */
export function isBoilerplateOrUnimportant(rawLine: string): boolean {
  const line = rawLine.trim();
  if (!line) return true;
  if (isDividerOrSeparatorLine(line)) return true;

  // URLs, emails, copyright, version/date footers
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(line)) return true;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(line)) return true;
  if (/(?:©|copyright|alle rechte vorbehalten|all rights reserved)/i.test(line)) {
    return true;
  }
  if (
    /^(?:stand|version|aktualisiert|letzte änderung|erstellt am|quelle|quellen|bildquelle|abbildung|abb\.|tabelle|tab\.)\s*[:\-–]?\s*(?:\d|http|www|eigene|pixabay|unsplash|wikipedia)/i.test(
      line
    )
  ) {
    return true;
  }

  // Worksheet organizational metadata & greetings
  if (
    /^(?:name|vorname|nachname|datum|klasse|kurs|fach|lehrer|lehrkraft|dozent|professor|punkte|gesamtpunkte|note|bewertung|unterschrift|abgabe|abgabetermin|bearbeitungszeit|hilfsmittel|arbeitsblatt(?:\s+nr\.?\s*\d*)?)\s*[:_.\-–]*\s*(?:_{2,}|\.{3,}|\/.*|\d+\s*(?:min|minuten|punkte)|.*)?$/i.test(
      line
    )
  ) {
    // Allow "Aufgabe ..." or genuine subject sentences, block pure admin headers like "Bearbeitungszeit: 45 Minuten" or "Abgabe: Freitag"
    if (
      /^(?:name|vorname|nachname|datum|klasse|kurs|fach|lehrer|lehrkraft|dozent|punkte|gesamtpunkte|note|bewertung|unterschrift|abgabe|abgabetermin|bearbeitungszeit|hilfsmittel)\b/i.test(
        line
      ) &&
      (line.length <= 75 || /_{2,}|\.{3,}/.test(line))
    ) {
      return true;
    }
  }

  const multiMeta = line.match(
    /\b(?:name|vorname|nachname|datum|klasse|kurs|fach|lehrer|lehrkraft|punkte|note|bewertung|unterschrift)\s*:/gi
  );
  if (multiMeta && (multiMeta.length >= 2 || /_{2,}|\.{3,}/.test(line))) {
    return true;
  }

  if (
    /^(?:viel erfolg|gutes gelingen|frohes schaffen|liebe schüler|sehr geehrte|herzlich willkommen|bitte\s+(?:mitbringen|beachten|lesen|ausfüllen|ankreuzen|eintragen|ausschneiden|einkleben)|lies (?:dir )?den (?:folgenden )?text|arbeitsauftrag\s*:\s*(?:lies|partnerarbeit|gruppenarbeit|einzelarbeit)|partnerarbeit|gruppenarbeit|einzelarbeit)\b/i.test(
      line
    ) ||
    (line.length <= 100 &&
      /^bitte\b.*\b(?:mitbringen|bereitlegen|mitnehmen|abgeben|ausschneiden|einkleben|ankreuzen|ausfüllen)\b/i.test(
        line
      ))
  ) {
    return true;
  }

  // Pure navigational cross-references without factual content
  if (
    /^(?:siehe|vgl\.|siehe auch|vergleiche|mehr dazu|weiteres dazu)\s+(?:abb\.?|abbildung|tab\.?|tabelle|grafik|diagramm|bild|seite|s\.|kapitel|kap\.|anhang|unten|oben)\b/i.test(
      line
    ) &&
    line.length <= 90
  ) {
    return true;
  }
  if (/^\(?\s*(?:vgl\.|siehe)\s+(?:abb\.?|tab\.?|s\.)\s*\d+[^)]*\)?\.?$/i.test(line)) {
    return true;
  }

  // Empty didactic filler sentences
  if (
    /^(?:im folgenden|in diesem (?:kapitel|abschnitt|text|modul|thema|arbeitsblatt|dokument)|nun|zunächst|als nächstes|abschließend)\s+(?:schauen wir|betrachten wir|sehen wir uns|geht es um|wollen wir|werden wir|lernen wir|beschäftigen wir uns|befassen wir uns|klären wir)\b/i.test(
      line
    )
  ) {
    return true;
  }
  if (
    /^(?:kommen wir nun zu|widmen wir uns nun|schauen wir uns nun|betrachten wir nun|wie (?:bereits|oben|schon) (?:erwähnt|gesagt|beschrieben|gezeigt)|merke dir das gut|das ist (?:sehr )?(?:wichtig|interessant|spannend))\b/i.test(
      line
    ) &&
    !/\b(?:weil|denn|da|bedeutet|ist|sind|bewirkt|entsteht)\b/i.test(
      line.slice(24)
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Scores how much learnable factual/conceptual knowledge a statement contains.
 * Returns a score >= 2 for genuinely important statements, <= 0 for fluff.
 */
export function scoreContentImportance(rawText: string): number {
  const text = cleanCardField(rawText);
  if (!text || isBoilerplateOrUnimportant(text)) return -10;
  if (!hasMeaningfulLetters(text)) return -10;

  let score = 0;

  // Formula, reaction, equation, super/subscript
  if (/[=±≈≠≤≥∑√∫π→←↔]|\^\{|_\{/.test(text)) {
    score += 3;
  }

  // Definitions & core conceptual relationships
  if (
    /\b(?:versteht man|bezeichnet|definiert|bedeutet|nennt man|heißt|handelt es sich um|umfasst)\b/i.test(
      text
    )
  ) {
    score += 3;
  }
  if (
    /\b(?:ist|sind)\s+(?:ein|eine|der|die|das|die Gesamtheit|ein Prozess|ein Verfahren|eine Form|ein Maß|eine Größe|ein Gesetz|ein Teil|verantwortlich)\b/i.test(
      text
    )
  ) {
    score += 2.5;
  }

  // Function, structure, cause-effect, mechanism, rule
  if (
    /\b(?:besteht aus|bestehen aus|setzt sich zusammen|setzen sich zusammen|gliedert sich|gliedern sich|teilt sich|teilen sich|enthält|enthalten|produziert|produzieren|speichert|speichern|transportiert|transportieren|steuert|steuern|regelt|regeln|ermöglicht|ermöglichen|wandelt|wandeln|dient|dienen|hat die aufgabe|haben die aufgabe|aufgabe ist|funktion ist|verantwortlich|zuständig|entsteht|entstehen|führt zu|führen zu|bewirkt|bewirken|verursacht|verursachen|reagiert|reagieren|hemmt|hemmen|fördert|fördern|löst aus|lösen aus|wandern|diffundieren|strömen|bindet|binden|spaltet|spalten|gilt|muss|müssen|darf nicht|dürfen nicht|im gegensatz zu|unterscheidet sich)\b/i.test(
      text
    )
  ) {
    score += 2.5;
  }

  // Process/condition intro ("Bei der Osmose ...", "Während der Zellatmung ...")
  if (/^(?:bei\s+(?:der|dem|den)|beim|während\s+(?:der|des))\s+\S+/i.test(text)) {
    score += 1.5;
  }

  // Concrete causal/conditional reasoning
  if (/\b(?:weil|da\s|sodass|dadurch|deshalb|infolgedessen|aufgrund)\b/i.test(text)) {
    score += 1.5;
  }

  // Historical dates, percentages, measurements, units
  if (
    /\b(?:1\d{3}|20[0-2]\d)\b/.test(text) ||
    /\d+\s*(?:%|°c|°f|k\b|km\/h|m\/s|kg\b|mol\b|kj\b|hz\b|pa\b|volt|watt|ampere|bar|liter|ph)\b/i.test(
      text
    )
  ) {
    score += 2;
  }

  // Domain nouns (capitalized German content words beyond sentence start)
  const restTokens = text.split(/\s+/).slice(1);
  const capitalizedNouns = restTokens.filter((w) =>
    /^[A-ZÄÖÜ][a-zäöüß]{2,}/.test(w)
  );
  if (capitalizedNouns.length >= 2) {
    score += 1;
  }

  // Penalize weak conversational filler
  if (
    /\b(?:eigentlich|irgendwie|übrigens|sozusagen|natürlich|hoffentlich|schauen wir|betrachten wir)\b/i.test(
      text
    )
  ) {
    score -= 3;
  }

  // Penalize very short fragments without formula/relation
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4 && !/[=→]|\^\{|_\{/.test(text)) {
    score -= 2;
  }

  return score;
}

/**
 * Checks whether an extracted (term, translation) pair represents genuinely useful
 * study material rather than metadata, divider garbage, or empty boilerplate.
 */
export function isImportantCardPair(term: string, translation: string): boolean {
  const t = cleanCardField(term);
  const a = cleanCardField(translation);
  if (!t || !a) return false;
  if (!hasMeaningfulLetters(t) && !hasMeaningfulLetters(a)) return false;
  if (isBoilerplateOrUnimportant(t)) return false;
  // Don't reject short translations if term is a valid question/vocab, but reject clear meta answers
  if (
    /^(?:https?:\/\/|www\.|©)/i.test(a) ||
    /^(?:siehe abb\.|vgl\. s\.)\s*\d*\.?$/i.test(a)
  ) {
    return false;
  }
  return true;
}

function stripTrailingSentencePunct(s: string): string {
  return s.replace(/[.]+$/, "").trim();
}

function cleanSubjectPhrase(raw: string): string {
  return raw
    .replace(
      /^\s*(?:bei\s+der|bei\s+dem|beim|während\s+der|während\s+des|unter\s+einem|unter\s+einer|unter\s+dem|unter\s+der|unter\s+den|als)\s+/i,
      ""
    )
    .replace(/[\s,;:]+$/, "")
    .trim();
}

function lowercaseLeadingArticle(phrase: string): string {
  return phrase.replace(
    /^(Der|Die|Das|Ein|Eine|Einen|Einem|Einer|Eines)\s+/,
    (_, art: string) => `${art.toLowerCase()} `
  );
}

function isLikelyPluralSubject(subj: string): boolean {
  const s = subj.trim();
  if (/^die\s+\S+(?:en|er|e|n)$/i.test(s)) return true;
  if (
    /^(?:mitochondrien|chloroplasten|elektronen|protonen|neutronen|atome|moleküle|zellen|organellen|pflanzen|tiere|säuren|basen|gase|enzyme|proteine|gene|chromosomen)\b/i.test(
      s.replace(/^die\s+/i, "")
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Extracts a task-answer pair from an important standalone German/scientific prose sentence
 * that didn't match explicit delimiters (`:`, `-`, `=`) or Q&A markers.
 */
export function extractProseTaskFromSentence(
  rawSentence: string,
  topic?: string
): { term: string; translation: string } | null {
  const sentence = cleanCardField(rawSentence);
  if (!sentence || sentence.length < 18 || sentence.length > 360) return null;
  if (isBoilerplateOrUnimportant(sentence)) return null;
  if (sentence.endsWith("?") || ALREADY_TASK_OR_QUESTION_RE.test(sentence)) {
    return null;
  }

  const importance = scoreContentImportance(sentence);
  if (importance < 2) return null;

  // 1. Definition patterns -> "Was versteht man unter „X“?"
  const unterMatch = sentence.match(
    /^Unter\s+(?:einem|einer|dem|der|den)?\s*([^,.:;]{2,65}?)\s+versteht\s+man\s+(.+?)\.?$/i
  );
  if (unterMatch) {
    const subj = cleanCardField(unterMatch[1]);
    const body = stripTrailingSentencePunct(unterMatch[2]);
    if (subj.length >= 2 && body.length >= 6 && !PRONOUN_OR_FILLER_SUBJECT_RE.test(subj)) {
      return {
        term: `Was versteht man unter „${subj}“?`,
        translation: body.charAt(0).toUpperCase() + body.slice(1) + ".",
      };
    }
  }

  const alsMatch = sentence.match(
    /^Als\s+([^,.:;]{2,65}?)\s+bezeichnet\s+man\s+(.+?)\.?$/i
  );
  if (alsMatch) {
    const subj = cleanCardField(alsMatch[1]);
    const body = stripTrailingSentencePunct(alsMatch[2]);
    if (subj.length >= 2 && body.length >= 6 && !PRONOUN_OR_FILLER_SUBJECT_RE.test(subj)) {
      return {
        term: `Was versteht man unter „${subj}“?`,
        translation: body.charAt(0).toUpperCase() + body.slice(1) + ".",
      };
    }
  }

  const defVerbMatch = sentence.match(
    /^((?:Der|Die|Das|Ein|Eine)?\s*[A-ZÄÖÜ][^,.:;]{1,60}?)\s+(?:bezeichnet|bezeichnen|definiert|definieren|beschreibt|beschreiben|bedeutet|bedeuten|umfasst|umfassen)\s+(.+?)\.?$/
  );
  if (defVerbMatch) {
    const subj = cleanCardField(defVerbMatch[1]);
    const bareSubj = subj.replace(/^(?:Der|Die|Das|Ein|Eine)\s+/i, "");
    if (
      bareSubj.split(/\s+/).length <= 5 &&
      !PRONOUN_OR_FILLER_SUBJECT_RE.test(bareSubj)
    ) {
      return {
        term: `Erkläre den Begriff „${bareSubj}“.`,
        translation: sentence,
      };
    }
  }

  const istDefMatch = sentence.match(
    /^((?:Der|Die|Das|Ein|Eine)?\s*[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\-/(){}^_ ]{2,60}?)\s+(?:ist|sind)\s+((?:ein|eine|der|die|das|die Gesamtheit|ein Prozess|ein Verfahren|eine Form|ein Maß|eine Größe|die Lehre|ein Gesetz|das Verhältnis)[^.]{8,240})\.?$/
  );
  if (istDefMatch) {
    const bareSubj = cleanCardField(istDefMatch[1]).replace(
      /^(?:Der|Die|Das|Ein|Eine)\s+/i,
      ""
    );
    if (
      bareSubj.split(/\s+/).length <= 5 &&
      !PRONOUN_OR_FILLER_SUBJECT_RE.test(bareSubj)
    ) {
      return {
        term: `Was ist „${bareSubj}“?`,
        translation: sentence,
      };
    }
  }

  // 2. Composition / Structure: "<Subj> besteht aus / gliedert sich in ..."
  const compMatch = sentence.match(
    /^([^,.:;]{3,65}?)\s+(?:besteht\s+aus|bestehen\s+aus|setzt\s+sich\s+zusammen\s+aus|setzen\s+sich\s+zusammen\s+aus|gliedert\s+sich\s+in|teilt\s+sich\s+in|enthält|enthalten)\s+(.+)$/i
  );
  if (compMatch) {
    const subj = cleanSubjectPhrase(compMatch[1]);
    const bareSubj = subj.replace(/^(?:Der|Die|Das|Ein|Eine)\s+/i, "");
    if (
      subj.split(/\s+/).length <= 6 &&
      !PRONOUN_OR_FILLER_SUBJECT_RE.test(bareSubj)
    ) {
      const inline = lowercaseLeadingArticle(subj);
      const plural = isLikelyPluralSubject(subj);
      return {
        term: plural
          ? `Woraus bestehen bzw. wie gliedern sich ${inline}?`
          : `Woraus besteht bzw. wie gliedert sich ${inline}?`,
        translation: sentence,
      };
    }
  }

  // 3. Function / Role: "<Subj> hat die Aufgabe / dient / produziert / speichert / steuert / wandelt / ist ... verantwortlich"
  const funcMatch = sentence.match(
    /^([^,.:;]{3,65}?)\s+(?:hat\s+die\s+aufgabe|haben\s+die\s+aufgabe|dient\s+(?:dazu|der|dem|zum|zur)|dienen\s+(?:dazu|der|dem|zum|zur)|produziert|produzieren|speichert|speichern|transportiert|transportieren|steuert|steuern|regelt|regeln|ermöglicht|ermöglichen|wandelt|wandeln|schützt|schützen|überträgt|übertragen|reguliert|regulieren|erzeugt|erzeugen|(?:ist|sind)\s+(?:für|an)\s+.{2,45}?\s+(?:verantwortlich|zuständig|beteiligt))\b/i
  );
  if (funcMatch) {
    const subj = cleanSubjectPhrase(funcMatch[1]);
    const bareSubj = subj.replace(/^(?:Der|Die|Das|Ein|Eine)\s+/i, "");
    if (
      subj.split(/\s+/).length <= 6 &&
      !PRONOUN_OR_FILLER_SUBJECT_RE.test(bareSubj)
    ) {
      const inline = lowercaseLeadingArticle(subj);
      const plural = isLikelyPluralSubject(subj);
      return {
        term: plural
          ? `Welche Aufgabe bzw. Funktion haben ${inline}?`
          : `Welche Aufgabe bzw. Funktion hat ${inline}?`,
        translation: sentence,
      };
    }
  }

  // 4. Cause / Origin: "<Subj> entsteht durch / entsteht, wenn..."
  const originMatch = sentence.match(
    /^([^,.:;]{3,65}?)\s+(?:entsteht|entstehen)\s+(?:durch|wenn|bei|aus|infolge)\b/i
  );
  if (originMatch) {
    const subj = cleanSubjectPhrase(originMatch[1]);
    const bareSubj = subj.replace(/^(?:Der|Die|Das|Ein|Eine)\s+/i, "");
    if (
      subj.split(/\s+/).length <= 6 &&
      !PRONOUN_OR_FILLER_SUBJECT_RE.test(bareSubj)
    ) {
      const inline = lowercaseLeadingArticle(subj);
      const plural = isLikelyPluralSubject(subj);
      return {
        term: plural
          ? `Wodurch entstehen ${inline}?`
          : `Wodurch entsteht ${inline}?`,
        translation: sentence,
      };
    }
  }

  // 5. Effect: "<Cause> führt zu / bewirkt / verursacht ..."
  const effectMatch = sentence.match(
    /^([^,.:;]{3,65}?)\s+(?:führt\s+zu|führen\s+zu|bewirkt|bewirken|verursacht|verursachen|löst\s+.+?\s+aus)\b/i
  );
  if (effectMatch) {
    const subj = cleanSubjectPhrase(effectMatch[1]);
    const bareSubj = subj.replace(/^(?:Der|Die|Das|Ein|Eine)\s+/i, "");
    if (
      subj.split(/\s+/).length <= 6 &&
      !PRONOUN_OR_FILLER_SUBJECT_RE.test(bareSubj)
    ) {
      const inline = lowercaseLeadingArticle(subj);
      const plural = isLikelyPluralSubject(subj);
      return {
        term: plural
          ? `Welche Wirkung bzw. Folgen haben ${inline}?`
          : `Welche Wirkung bzw. Folgen hat ${inline}?`,
        translation: sentence,
      };
    }
  }

  // 6. Process / Condition: "Bei der Osmose ..." / "Während der Mitose ..."
  const processMatch = sentence.match(
    /^(?:Bei\s+(?:der|dem|den)|Be[i]m|Während\s+(?:der|des))\s+([^,.:;]{3,55}?)\s+[a-zäöüß]+\b/i
  );
  if (processMatch) {
    const proc = cleanCardField(processMatch[1]);
    if (
      proc.split(/\s+/).length <= 5 &&
      !PRONOUN_OR_FILLER_SUBJECT_RE.test(proc)
    ) {
      return {
        term: `Was geschieht bei „${proc}“?`,
        translation: sentence,
      };
    }
  }

  // 7. Chemical/physical reaction or formula inside prose
  const reactMatch = sentence.match(
    /^([^,.:;]{3,55}?)\s+(?:reagiert|reagieren|zerfällt|zerfallen)\s+(?:mit|zu|unter)\b/i
  );
  if (reactMatch) {
    const subj = cleanSubjectPhrase(reactMatch[1]);
    const inline = lowercaseLeadingArticle(subj);
    const plural = isLikelyPluralSubject(subj);
    return {
      term: plural ? `Wie reagieren ${inline}?` : `Wie reagiert ${inline}?`,
      translation: sentence,
    };
  }

  // 8. Quantitative / historical fact: "<Subj> dauerte / beträgt / liegt bei / umfasst <Number>"
  const factNumMatch = sentence.match(
    /^([^,.:;]{3,65}?)\s+(?:dauerte|beträgt|betragen|liegt bei|erreicht|fand\s+\d{3,4}|wurde\s+\d{3,4})\b/i
  );
  if (factNumMatch) {
    const subj = cleanSubjectPhrase(factNumMatch[1]);
    const bareSubj = subj.replace(/^(?:Der|Die|Das|Ein|Eine)\s+/i, "");
    if (
      subj.split(/\s+/).length <= 6 &&
      !PRONOUN_OR_FILLER_SUBJECT_RE.test(bareSubj)
    ) {
      const inline = lowercaseLeadingArticle(subj);
      return {
        term: `Welcher zentrale Fakt bzw. Wert gilt für ${inline}?`,
        translation: sentence,
      };
    }
  }

  // 9. General high-importance sentence (score >= 3): extract lead noun phrase
  if (importance >= 3) {
    const leadMatch = sentence.match(
      /^((?:Der|Die|Das|Ein|Eine|Im Gegensatz zu(?:r|m)?)\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\-/(){}^_ ]{2,55}|[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\-/(){}^_]{2,40})\b/
    );
    const focus = leadMatch
      ? cleanCardField(leadMatch[1])
      : topic && topic.length >= 2
        ? topic
        : "";
    if (focus && !PRONOUN_OR_FILLER_SUBJECT_RE.test(focus)) {
      return {
        term: `Erkläre den Zusammenhang zu „${focus}“.`,
        translation: sentence,
      };
    }
  }

  return null;
}

/**
 * Checks if a card pair looks like a bilingual vocabulary pair (e.g. "la casa - das Haus")
 * rather than a German factual concept/task pair.
 */
function isShortBilingualOrVocabItem(
  term: string,
  translation: string,
  batchIsVocab: boolean
): boolean {
  const t = term.trim();
  const a = translation.trim();

  // Formulas, super/subscripts, or full German explanatory sentences are NOT vocab
  if (/[=±≈≠≤≥∑√∫π→←↔]|\^\{|_\{/.test(`${t} ${a}`)) return false;

  const tWords = t.split(/\s+/).filter(Boolean);
  const aWords = a.split(/\s+/).filter(Boolean);

  if (batchIsVocab && tWords.length <= 5 && aWords.length <= 6) {
    return true;
  }

  // Single item bilingual check
  if (tWords.length <= 4 && aWords.length <= 5) {
    const combo = detectPackageLanguageCombo([{ term: t, translation: a }]);
    if (combo) return true;
  }

  return false;
}

/**
 * Converts a batch of extracted (term, translation) pairs into active study tasks
 * when the material is non-vocabulary subject knowledge (definitions, facts, rules,
 * formulas, bullet summaries), while leaving bilingual vocabulary decks, explicit Q&A,
 * worksheet tasks, and cloze cards untouched.
 */
export function convertExtractedItemsToTasks<
  T extends {
    term: string;
    translation: string;
    partOfSpeech?: string;
    topic?: string;
  },
>(items: T[]): T[] {
  if (items.length === 0) return [];

  // Determine batch-level whether this set is a bilingual vocabulary deck
  const batchIsVocab =
    detectPackageLanguageCombo(
      items.map((i) => ({ term: i.term, translation: i.translation }))
    ) !== null;

  return items
    .map((item) => {
      const term = cleanCardField(item.term);
      const translation = cleanCardField(item.translation);

      if (!isImportantCardPair(term, translation)) {
        return null;
      }

      // Preserve bilingual vocabulary items untouched
      if (isShortBilingualOrVocabItem(term, translation, batchIsVocab)) {
        return {
          ...item,
          term,
          translation,
        };
      }

      // Preserve already-formulated questions, tasks, or cloze prompts
      if (
        term.endsWith("?") ||
        ALREADY_TASK_OR_QUESTION_RE.test(term) ||
        item.partOfSpeech === "Aufgabe" ||
        item.partOfSpeech === "Lückentext"
      ) {
        return {
          ...item,
          term,
          translation,
        };
      }

      // Convert generic callouts like "Merke: Zellatmung" or "Formel: ..." or bare concept with Definition pos
      if (item.partOfSpeech === "Definition" && !term.endsWith("?")) {
        return {
          ...item,
          term: `Was versteht man unter „${term}“?`,
          translation,
        };
      }

      const calloutLead = term.match(
        /^(Merke|Merksatz|Wichtig|Regel|Definition|Formel)(?:\s*:\s*(.+))?$/i
      );
      if (calloutLead) {
        const kind = calloutLead[1].toLowerCase();
        const ctx = calloutLead[2]?.trim() || item.topic || "";
        const question =
          kind === "formel"
            ? ctx
              ? `Wie lautet die Formel bzw. welche Bedeutung hat sie (${ctx})?`
              : `Wie lautet die Formel und wofür steht sie?`
            : ctx
              ? `Erkläre die wichtige Regel bzw. Aussage zu „${ctx}“.`
              : `Formuliere die zentrale Kernaussage zu diesem Abschnitt.`;
        return {
          ...item,
          term: question,
          translation,
        };
      }

      // Convert bullet-list heading card ("Bestandteile eines Atoms" -> "Protonen, Neutronen, Elektronen")
      if (
        (item.partOfSpeech === "Aufzählung" || translation.includes(" • ")) &&
        term.split(/\s+/).length <= 7
      ) {
        return {
          ...item,
          term: `Nenne die wichtigsten Punkte bzw. Bestandteile zu „${term}“.`,
          translation,
        };
      }

      // Convert formula term -> explanation ("F = m · a" -> "Kraft = Masse mal Beschleunigung")
      if (/^[A-Za-zÄÖÜäöüß0-9\s^{}_()]+=.+$/.test(term) && term.length <= 45) {
        return {
          ...item,
          term: `Erkläre die Formel „${term}“ und ihre Größen.`,
          translation,
        };
      }

      // Convert term -> formula ("Satz des Pythagoras" -> "a^{2} + b^{2} = c^{2}")
      if (
        /[=]/.test(translation) &&
        (/\^\{|_\{|[²³·×÷√∑∫π]/.test(translation) ||
          translation.length <= 45)
      ) {
        return {
          ...item,
          term: `Wie lautet die Formel bzw. Gleichung für „${term}“?`,
          translation,
        };
      }

      // Convert date/year -> historical event
      if (/^\d{3,4}(?:\s*[-–]\s*\d{3,4})?$/.test(term)) {
        return {
          ...item,
          term: `Was geschah bzw. welche Bedeutung hat das Jahr ${term}?`,
          translation,
        };
      }

      // Convert prose definition/explanation pairs into active tasks
      const termWords = term.split(/\s+/).filter(Boolean);
      const transWords = translation.split(/\s+/).filter(Boolean);

      if (termWords.length <= 7 && (transWords.length >= 3 || !batchIsVocab)) {
        if (/^(?:ein|eine|der|die|das|die Gesamtheit|ein Prozess|ein Verfahren|eine Form)/i.test(translation)) {
          return {
            ...item,
            term: `Was versteht man unter „${term}“?`,
            translation,
          };
        }
        if (/\d+\s*(?:%|°|m\/s|km\/h|kg|mol|kJ|Hz|Pa|V|A|W|N|J)\b/i.test(translation) && transWords.length <= 4) {
          return {
            ...item,
            term: `Welchen Wert bzw. welche Einheit hat „${term}“?`,
            translation,
          };
        }
        return {
          ...item,
          term: `Erkläre: ${term}`,
          translation,
        };
      }

      return {
        ...item,
        term,
        translation,
      };
    })
    .filter((item): item is T => item !== null);
}
