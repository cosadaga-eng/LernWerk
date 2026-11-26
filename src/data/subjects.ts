import { stripFormattingMarkers } from "../components/FormattedText";
import { LearningSubject } from "../types/vocab";
import { detectPackageLanguageCombo } from "./languages";

export interface SubjectDefinition {
  id: Exclude<LearningSubject, "auto">;
  label: string;
  shortLabel: string;
  termLabel: string;
  answerLabel: string;
  contextLabel: string;
  detailLabel: string;
  categoryFieldLabel: string;
  mcPromptForward: string;
  mcPromptReverse: string;
}

export const SUBJECT_DEFINITIONS: SubjectDefinition[] = [
  {
    id: "sprachen",
    label: "Sprachen & Vokabeln",
    shortLabel: "Sprachen",
    termLabel: "Begriff / Vokabel",
    answerLabel: "Übersetzung",
    contextLabel: "Beispielsatz",
    detailLabel: "Aussprachehilfe",
    categoryFieldLabel: "Wortart",
    mcPromptForward: "Welche Übersetzung passt zu:",
    mcPromptReverse: "Welcher Begriff gehört zu:",
  },
  {
    id: "wissen",
    label: "Allgemeinwissen & Fakten",
    shortLabel: "Wissen & Fakten",
    termLabel: "Frage / Stichwort",
    answerLabel: "Antwort / Fakten",
    contextLabel: "Hintergrund / Beispiel",
    detailLabel: "Datum / Zusatzangabe",
    categoryFieldLabel: "Themenbereich",
    mcPromptForward: "Welche Antwort passt zu:",
    mcPromptReverse: "Welches Stichwort gehört zu:",
  },
  {
    id: "mint",
    label: "MINT & Formeln",
    shortLabel: "MINT & Formeln",
    termLabel: "Konzept / Größe / Frage",
    answerLabel: "Formel / Definition",
    contextLabel: "Herleitung / Anwendung",
    detailLabel: "Einheit / Symbol",
    categoryFieldLabel: "Fach / Teilgebiet",
    mcPromptForward: "Welche Formel oder Lösung passt zu:",
    mcPromptReverse: "Welcher Begriff gehört zu:",
  },
  {
    id: "medizin",
    label: "Medizin & Biologie",
    shortLabel: "Medizin & Bio",
    termLabel: "Fachbegriff / Struktur",
    answerLabel: "Bedeutung / Funktion",
    contextLabel: "Klinischer Bezug / Beispiel",
    detailLabel: "Latein / Abkürzung",
    categoryFieldLabel: "Fachgebiet",
    mcPromptForward: "Welche Erklärung passt zu:",
    mcPromptReverse: "Welcher Fachbegriff gehört zu:",
  },
  {
    id: "wirtschaft",
    label: "Wirtschaft & Recht",
    shortLabel: "Wirtschaft & Recht",
    termLabel: "Begriff / Norm / Frage",
    answerLabel: "Definition / Rechtsfolge",
    contextLabel: "Fallbeispiel / Praxis",
    detailLabel: "Paragraph / Kennzahl",
    categoryFieldLabel: "Rechts- / Sachgebiet",
    mcPromptForward: "Welche Definition passt zu:",
    mcPromptReverse: "Welcher Begriff gehört zu:",
  },
  {
    id: "studium",
    label: "Prüfung & Studium",
    shortLabel: "Prüfung & Studium",
    termLabel: "Prüfungsfrage / Thema",
    answerLabel: "Lösung / Kernaussage",
    contextLabel: "Begründung / Beispiel",
    detailLabel: "Querverweis / Stichwort",
    categoryFieldLabel: "Modul / Kapitel",
    mcPromptForward: "Welche Lösung passt zu:",
    mcPromptReverse: "Welche Frage gehört zu:",
  },
  {
    id: "sonstiges",
    label: "Freies Lernset",
    shortLabel: "Freies Lernset",
    termLabel: "Vorderseite",
    answerLabel: "Rückseite",
    contextLabel: "Kontext / Beispiel",
    detailLabel: "Zusatzinfo",
    categoryFieldLabel: "Kategorie",
    mcPromptForward: "Welche Antwort passt zu:",
    mcPromptReverse: "Welche Vorderseite gehört zu:",
  },
];

export function getSubjectDefinition(
  subject?: LearningSubject
): SubjectDefinition {
  if (!subject || subject === "auto") {
    return SUBJECT_DEFINITIONS[1]; // wissen as clean non-language default
  }
  return (
    SUBJECT_DEFINITIONS.find((s) => s.id === subject) || SUBJECT_DEFINITIONS[6]
  );
}

const MINT_REGEX =
  /([=≈≠≤≥±√∑∫∆πΩλµ²³]|\^\{|_\{|->|mol|joule|watt|volt|ampere|newton|ohm|hertz|km\/h|m\/s|ph-wert|atom|molekül|isotop|gleichung|theorem|satz des|integral|ableitung|vektor|matrix|algorithmus|binär|cpu|http|sql|funktion f\()/i;

const MED_REGEX =
  /(zelle|mitochondr|organ|muskel|nerv|blut|herz|lunge|leber|niere|knochen|gehirn|enzym|protein|dna|rna|hormon|synapse|diagnose|therapie|symptom|anatomie|arterie|vene|itis$|ose$|ektomie)/i;

const LAW_ECON_REGEX =
  /(§|bgb|hgb|stgb|gg\b|urteil|klage|vertrag|haftung|bilanz|gewinn|umsatz|rendite|inflation|bip|angebot|nachfrage|marketing|steuer|abschreibung|gmbh|aktiengesellschaft|zins|kapital)/i;

const HISTORY_GEO_REGEX =
  /(\b1[0-9]{3}\b|\b20[0-2][0-9]\b|jh\.|jahrhundert|hauptstadt|kontinent|ozean|gebirge|fluss|krieg|revolution|vertrag von|verfassung|kaiser|könig|republik|epoche|antike|mittelalter)/i;

/**
 * Algorithmically detects whether a batch of cards is a bilingual language deck
 * (German ↔ Spanish/English) or a general subject deck (MINT, Medicine, Law/Econ,
 * History/Facts, or general study cards).
 */
export function detectLearningSubject(
  items: Array<{ term: string; translation: string; topic?: string; partOfSpeech?: string }>,
  hintName = ""
): Exclude<LearningSubject, "auto"> {
  if (items.length === 0) return "sonstiges";

  const cleanedItems = items.map((i) => ({
    ...i,
    term: stripFormattingMarkers(i.term),
    translation: stripFormattingMarkers(i.translation),
  }));

  const langCombo = detectPackageLanguageCombo(cleanedItems);
  if (langCombo) {
    return "sprachen";
  }

  const combinedText = [
    hintName,
    ...cleanedItems
      .slice(0, 60)
      .map((i) => `${i.term} ${i.translation} ${i.topic || ""} ${i.partOfSpeech || ""}`),
  ].join(" ");

  let mintHits = 0;
  let medHits = 0;
  let lawHits = 0;
  let knowHits = 0;

  for (let idx = 0; idx < Math.min(60, items.length); idx++) {
    const rawRow = `${items[idx].term} ${items[idx].translation} ${items[idx].topic || ""}`;
    const cleanRow = `${cleanedItems[idx].term} ${cleanedItems[idx].translation} ${cleanedItems[idx].topic || ""}`;
    if (MINT_REGEX.test(rawRow)) mintHits++;
    if (MED_REGEX.test(cleanRow)) medHits++;
    if (LAW_ECON_REGEX.test(cleanRow)) lawHits++;
    if (HISTORY_GEO_REGEX.test(cleanRow)) knowHits++;
  }

  if (/(mathe|physik|chemie|informatik|formel|mint|technik|code|programm)/i.test(combinedText)) {
    mintHits += 3;
  }
  if (/(medizin|biologie|anatomie|pflege|gesundheit|pharmazie)/i.test(combinedText)) {
    medHits += 3;
  }
  if (/(jura|recht|wirtschaft|bwl|vwl|finanzen|buchhaltung|steuer)/i.test(combinedText)) {
    lawHits += 3;
  }
  if (/(geschichte|geographie|erdkunde|politik|allgemeinwissen|fakten|hauptstädte)/i.test(combinedText)) {
    knowHits += 3;
  }

  const ranked: Array<[Exclude<LearningSubject, "auto">, number]> = [
    ["mint", mintHits],
    ["medizin", medHits],
    ["wirtschaft", lawHits],
    ["wissen", knowHits],
  ];
  ranked.sort((a, b) => b[1] - a[1]);

  if (ranked[0][1] >= 2) {
    return ranked[0][0];
  }

  // Long-form question/answer pairs default nicely to Prüfung & Studium or Wissen
  const avgLength =
    items.slice(0, 30).reduce((s, i) => s + i.term.length + i.translation.length, 0) /
    Math.min(30, items.length);

  if (avgLength > 48 || items.some((i) => i.term.trim().endsWith("?"))) {
    return "studium";
  }

  return "wissen";
}

export interface PackageSubjectContext {
  subject: Exclude<LearningSubject, "auto">;
  def: SubjectDefinition;
  isLanguageDeck: boolean;
  displayLabel: string;
  languagePairLabel: string;
}

export function getPackageSubjectContext(
  pkg:
    | {
        subject?: LearningSubject;
        subjectLabel?: string;
        sourceLang?: string;
        targetLang?: string;
        bidirectional?: boolean;
        title?: string;
        groupName?: string;
      }
    | undefined,
  pkgCards: Array<{
    term: string;
    translation: string;
    topic?: string;
    partOfSpeech?: string;
    cardDirection?: "forward" | "reverse";
  }>
): PackageSubjectContext {
  const detectedCombo =
    pkgCards.length > 0 ? detectPackageLanguageCombo(pkgCards) : null;

  const explicitSubject =
    pkg?.subject && pkg.subject !== "auto" ? pkg.subject : undefined;

  let resolvedSubject: Exclude<LearningSubject, "auto">;
  if (explicitSubject) {
    resolvedSubject = explicitSubject;
  } else if (detectedCombo) {
    resolvedSubject = "sprachen";
  } else if (pkg?.sourceLang && pkg?.targetLang) {
    resolvedSubject = "sprachen";
  } else if (pkgCards.length > 0) {
    resolvedSubject = detectLearningSubject(
      pkgCards,
      `${pkg?.groupName || ""} ${pkg?.title || ""}`
    );
  } else {
    resolvedSubject = "sonstiges";
  }

  const def = getSubjectDefinition(resolvedSubject);
  const isLanguageDeck = resolvedSubject === "sprachen";
  const isBidirectional =
    Boolean(pkg?.bidirectional) ||
    pkgCards.some((c) => c.cardDirection === "reverse");
  const arrow = isBidirectional ? "↔" : "→";

  const languagePairLabel = detectedCombo
    ? `${detectedCombo.sourceLang} ${arrow} ${detectedCombo.targetLang}`
    : pkg?.sourceLang && pkg?.targetLang
      ? `${pkg.sourceLang} ${arrow} ${pkg.targetLang}`
      : "";

  const displayLabel =
    pkg?.subjectLabel?.trim() ||
    (isLanguageDeck && languagePairLabel ? languagePairLabel : def.shortLabel);

  return {
    subject: resolvedSubject,
    def,
    isLanguageDeck,
    displayLabel,
    languagePairLabel,
  };
}
