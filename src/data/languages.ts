export interface LanguagePreset {
  name: "Deutsch" | "Spanisch" | "Englisch";
}

export type LanguageCombinationId = "es-de" | "de-es" | "en-de" | "de-en";
export type LanguagePairGroup = "de-es" | "de-en";

export interface LanguageCombination {
  id: LanguageCombinationId;
  pairGroup: LanguagePairGroup;
  label: string;
  sourceLang: "Deutsch" | "Spanisch" | "Englisch";
  targetLang: "Deutsch" | "Spanisch" | "Englisch";
}

export const LANGUAGE_PRESETS: LanguagePreset[] = [
  { name: "Deutsch" },
  { name: "Spanisch" },
  { name: "Englisch" },
];

export const LANGUAGE_COMBINATIONS: LanguageCombination[] = [
  {
    id: "es-de",
    pairGroup: "de-es",
    label: "Spanisch → Deutsch",
    sourceLang: "Spanisch",
    targetLang: "Deutsch",
  },
  {
    id: "de-es",
    pairGroup: "de-es",
    label: "Deutsch → Spanisch",
    sourceLang: "Deutsch",
    targetLang: "Spanisch",
  },
  {
    id: "en-de",
    pairGroup: "de-en",
    label: "Englisch → Deutsch",
    sourceLang: "Englisch",
    targetLang: "Deutsch",
  },
  {
    id: "de-en",
    pairGroup: "de-en",
    label: "Deutsch → Englisch",
    sourceLang: "Deutsch",
    targetLang: "Englisch",
  },
];

export function getCombinationById(
  id: LanguageCombinationId
): LanguageCombination {
  return (
    LANGUAGE_COMBINATIONS.find((c) => c.id === id) || LANGUAGE_COMBINATIONS[0]
  );
}

export function getPackagePairGroup(
  sourceLang: string,
  targetLang: string
): LanguagePairGroup | "other" {
  const s = sourceLang.trim().toLowerCase();
  const t = targetLang.trim().toLowerCase();
  if (
    (s.startsWith("deut") && t.startsWith("span")) ||
    (s.startsWith("span") && t.startsWith("deut")) ||
    (s.startsWith("span") && !t)
  ) {
    return "de-es";
  }
  if (
    (s.startsWith("deut") && t.startsWith("engl")) ||
    (s.startsWith("engl") && t.startsWith("deut")) ||
    (s.startsWith("engl") && !t)
  ) {
    return "de-en";
  }
  return "other";
}

export function findCombinationId(
  sourceLang: string,
  targetLang: string
): LanguageCombinationId {
  const s = sourceLang.trim().toLowerCase();
  const t = targetLang.trim().toLowerCase();
  const match = LANGUAGE_COMBINATIONS.find(
    (c) =>
      c.sourceLang.toLowerCase() === s && c.targetLang.toLowerCase() === t
  );
  if (match) return match.id;
  if (s.startsWith("engl") || t.startsWith("engl")) {
    return s.startsWith("deut") ? "de-en" : "en-de";
  }
  return s.startsWith("deut") ? "de-es" : "es-de";
}

const DE_WORDS = new Set([
  "der", "die", "das", "ein", "eine", "einen", "einem", "einer", "eines",
  "und", "oder", "aber", "nicht", "kein", "keine", "mit", "von", "zu", "zum",
  "zur", "auf", "aus", "bei", "nach", "über", "unter", "vor", "für", "gegen",
  "ohne", "durch", "ich", "du", "er", "sie", "es", "wir", "ihr", "man", "sich",
  "ist", "sind", "war", "bin", "bist", "haben", "hat", "sein", "werden", "wird",
  "kann", "muss", "will", "soll", "darf", "sehr", "viel", "mehr", "gut", "schlecht",
  "groß", "klein", "neu", "alt", "jung", "schön", "heute", "morgen", "gestern",
  "immer", "nie", "oft", "hier", "dort", "jetzt", "dann", "wenn", "weil", "dass",
  "wie", "was", "wer", "wo", "wann", "warum", "haus", "wasser", "brot", "essen",
  "trinken", "gehen", "kommen", "sehen", "hören", "sprechen", "lesen", "schreiben",
  "lernen", "arbeiten", "schlafen", "kaufen", "lieben", "machen", "geben", "nehmen",
  "finden", "denken", "wissen", "zeit", "tag", "nacht", "jahr", "freund", "familie",
  "stadt", "land", "buch", "tisch", "stuhl", "tür", "fenster", "sonne", "mond",
]);

const ES_WORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "pero", "no",
  "con", "de", "del", "a", "al", "en", "por", "para", "sin", "sobre", "entre",
  "yo", "tú", "él", "ella", "nosotros", "vosotros", "ellos", "ellas", "usted",
  "es", "son", "ser", "estar", "está", "están", "tener", "tiene", "hacer", "hace",
  "ir", "va", "poder", "puede", "querer", "quiere", "saber", "muy", "mucho", "poco",
  "más", "menos", "bueno", "malo", "grande", "pequeño", "nuevo", "viejo", "joven",
  "hoy", "mañana", "ayer", "siempre", "nunca", "aquí", "allí", "ahora", "cuando",
  "porque", "que", "qué", "quién", "dónde", "cómo", "cuándo", "casa", "agua",
  "pan", "comer", "beber", "caminar", "venir", "ver", "oír", "hablar", "leer",
  "escribir", "aprender", "trabajar", "dormir", "comprar", "amar", "dar", "tomar",
  "encontrar", "pensar", "tiempo", "día", "noche", "año", "amigo", "familia",
  "ciudad", "país", "libro", "mesa", "silla", "puerta", "ventana", "sol", "luna",
  "perro", "gato", "coche", "tren", "calle", "escuela", "trabajo", "comida",
]);

const EN_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "not", "with", "from", "to", "of", "in",
  "on", "at", "by", "for", "against", "without", "through", "between", "under",
  "over", "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us",
  "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does",
  "can", "must", "will", "would", "should", "may", "very", "much", "many", "more",
  "good", "bad", "big", "large", "small", "little", "new", "old", "young", "nice",
  "today", "tomorrow", "yesterday", "always", "never", "often", "here", "there",
  "now", "then", "when", "because", "that", "this", "what", "who", "where", "how",
  "why", "house", "home", "water", "bread", "eat", "drink", "go", "come", "see",
  "hear", "listen", "speak", "talk", "read", "write", "learn", "study", "work",
  "sleep", "buy", "love", "make", "give", "take", "find", "think", "know", "time",
  "day", "night", "year", "friend", "family", "city", "town", "country", "book",
  "table", "chair", "door", "window", "sun", "moon", "dog", "cat", "car", "train",
  "street", "school", "food", "happy", "sad", "fast", "slow", "cold", "hot", "warm",
]);

function scoreSideLanguages(text: string): { de: number; es: number; en: number } {
  const scores = { de: 0, es: 0, en: 0 };
  const raw = text.trim();
  if (!raw) return scores;

  // Strong diacritic & punctuation signals
  if (/[äöüßÄÖÜ]/.test(raw)) scores.de += 6;
  if (/[ñÑ¿¡]/.test(raw)) scores.es += 7;
  if (/[áéíóúÁÉÍÓÚ]/.test(raw)) scores.es += 4.5;

  const hasMathNotation = /[=±≈≠≤≥∑√∫π×÷·^²³]|[*+/]\s*[0-9a-zA-Z]/.test(raw);
  const tokens = raw.toLowerCase().match(/[\p{L}]+/gu) || [];
  const multiLetterCount = tokens.filter((t) => t.length >= 2).length;

  for (const tok of tokens) {
    // Single-letter tokens like "a", "i", "y", "o" are variables inside math/science formulas
    if (tok.length === 1 && (hasMathNotation || multiLetterCount === 0)) {
      continue;
    }

    if (DE_WORDS.has(tok)) scores.de += 3.5;
    if (ES_WORDS.has(tok)) scores.es += 3.5;
    if (EN_WORDS.has(tok)) scores.en += 3.5;

    // Morphological patterns
    if (
      tok.length >= 5 &&
      /(ung|heit|keit|schaft|chen|lein|ieren|lich)$/.test(tok)
    ) {
      scores.de += 2.5;
    }
    if (/^(sch|sp|st|ge|ver|be|ent|er)/.test(tok) && tok.length >= 5) {
      scores.de += 0.9;
    }

    if (
      tok.length >= 5 &&
      /(ción|sión|dad|tad|mente|miento|anza|encia|ando|iendo|ado|ido)$/.test(tok)
    ) {
      scores.es += 2.6;
    }
    if (tok.length >= 4 && /(ar|er|ir|os|as|es)$/.test(tok)) {
      scores.es += 0.7;
    }

    if (
      tok.length >= 4 &&
      /(ing|tion|ness|ment|able|ible|ful|less|ous|ght)$/.test(tok)
    ) {
      scores.en += 2.4;
    }
    if (/(th|wh|sh|oo|ee|ea|ow|aw|ck)/.test(tok)) {
      scores.en += 0.9;
    }
  }

  // German noun capitalization cue on short phrases (e.g. "Haus" vs "house"/"casa")
  const rawTokens = raw.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 1 && /^[A-ZÄÖÜ][a-zäöüß]{2,}$/.test(rawTokens[0])) {
    scores.de += 1.4;
  } else if (
    rawTokens.length === 2 &&
    /^(der|die|das|ein|eine)$/i.test(rawTokens[0]) &&
    /^[A-ZÄÖÜ]/.test(rawTokens[1])
  ) {
    scores.de += 4;
  } else if (
    rawTokens.length === 2 &&
    /^(el|la|los|las|un|una)$/i.test(rawTokens[0])
  ) {
    scores.es += 4;
  } else if (
    rawTokens.length === 2 &&
    /^(the|a|an|to)$/i.test(rawTokens[0])
  ) {
    scores.en += 4;
  }

  return scores;
}

function scoreHypotheses(term: string, translation: string): Record<LanguageCombinationId, number> {
  const left = scoreSideLanguages(term);
  const right = scoreSideLanguages(translation);

  // Subtle capitalization contrast cue when one side is capitalized noun & other is lowercase
  const termSingleCap = /^[A-ZÄÖÜ][a-zäöüß]{2,}$/.test(term.trim());
  const transSingleCap = /^[A-ZÄÖÜ][a-zäöüß]{2,}$/.test(translation.trim());
  const termSingleLower = /^[a-záéíóúñ]{2,}$/.test(term.trim());
  const transSingleLower = /^[a-záéíóúñ]{2,}$/.test(translation.trim());

  let deLeftBonus = 0;
  let deRightBonus = 0;
  if (termSingleCap && transSingleLower) deLeftBonus = 1.5;
  if (transSingleCap && termSingleLower) deRightBonus = 1.5;

  return {
    "es-de": left.es + right.de + deRightBonus - left.en * 0.4 - right.es * 0.4,
    "de-es": left.de + deLeftBonus + right.es - left.es * 0.4 - right.de * 0.4,
    "en-de": left.en + right.de + deRightBonus - left.es * 0.4 - right.en * 0.4,
    "de-en": left.de + deLeftBonus + right.en - left.en * 0.4 - right.de * 0.4,
  };
}

function scoreForeignEvidence(
  left: { de: number; es: number; en: number },
  right: { de: number; es: number; en: number }
): Record<LanguageCombinationId, number> {
  return {
    "es-de": left.es - left.de * 0.85,
    "de-es": right.es - right.de * 0.85,
    "en-de": left.en - left.de * 0.85,
    "de-en": right.en - right.de * 0.85,
  };
}

export function detectTextPrimaryLanguage(
  text: string
): "de" | "es" | "en" | "unknown" {
  const s = scoreSideLanguages(text);
  const entries: Array<["de" | "es" | "en", number]> = [
    ["de", s.de],
    ["es", s.es],
    ["en", s.en],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  if (entries[0][1] < 1.2 || entries[0][1] - entries[1][1] < 0.4) {
    return "unknown";
  }
  return entries[0][0];
}

/**
 * Automatically detects the single language combination of a set of vocabulary
 * items (from the actual words inside the package):
 * "Spanisch → Deutsch", "Deutsch → Spanisch", "Englisch → Deutsch", or "Deutsch → Englisch".
 * Returns null when cards are monolingual German, formulas, facts, or non-language material.
 */
export function detectPackageLanguageCombo(
  items: Array<{
    term: string;
    translation: string;
    cardDirection?: "forward" | "reverse";
  }>
): LanguageCombination | null {
  if (items.length === 0) return null;

  const forwardOnly = items.filter((i) => i.cardDirection !== "reverse");
  const sample = forwardOnly.length > 0 ? forwardOnly : items;

  const totals: Record<LanguageCombinationId, number> = {
    "es-de": 0,
    "de-es": 0,
    "en-de": 0,
    "de-en": 0,
  };
  const foreignTotals: Record<LanguageCombinationId, number> = {
    "es-de": 0,
    "de-es": 0,
    "en-de": 0,
    "de-en": 0,
  };

  for (const item of sample) {
    const left = scoreSideLanguages(item.term);
    const right = scoreSideLanguages(item.translation);
    const h = scoreHypotheses(item.term, item.translation);
    const f = scoreForeignEvidence(left, right);

    (Object.keys(totals) as LanguageCombinationId[]).forEach((id) => {
      totals[id] += h[id];
      foreignTotals[id] += f[id];
    });
  }

  let bestId: LanguageCombinationId = "es-de";
  let bestScore = -Infinity;
  (Object.keys(totals) as LanguageCombinationId[]).forEach((id) => {
    if (totals[id] > bestScore) {
      bestScore = totals[id];
      bestId = id;
    }
  });

  const avgTotal = bestScore / sample.length;
  const avgForeign = foreignTotals[bestId] / sample.length;

  // Require real cross-language signal on the non-German side so German-German
  // definitions, formulas, and general knowledge cards are not mislabeled as Spanish/English.
  if (avgTotal < 1.0 || avgForeign < 0.45) {
    return null;
  }

  return getCombinationById(bestId);
}

/**
 * Detects an individual card's language combination, falling back to a batch-wide
 * dominant combination when a word pair (e.g. cognate "Hotel - Hotel") is neutral.
 */
export function detectCardLanguageCombo(
  term: string,
  translation: string,
  fallbackCombo: LanguageCombination | null
): LanguageCombination | null {
  if (!fallbackCombo) return null;
  const left = scoreSideLanguages(term);
  const right = scoreSideLanguages(translation);
  const h = scoreHypotheses(term, translation);
  const f = scoreForeignEvidence(left, right);

  const entries = (Object.entries(h) as Array<[LanguageCombinationId, number]>).sort(
    (a, b) => b[1] - a[1]
  );
  const [topId, topScore] = entries[0];
  const [, secondScore] = entries[1];

  if (topScore < 1.5 || topScore - secondScore < 0.75 || f[topId] < 0.45) {
    return fallbackCombo;
  }
  return getCombinationById(topId);
}

/**
 * Returns the effective single language pair for a package based strictly on
 * the vocabulary inside that package (or empty strings for non-language decks).
 */
export function getEffectivePackageLanguages(
  pkg: { sourceLang?: string; targetLang?: string } | undefined,
  pkgCards: Array<{
    term: string;
    translation: string;
    cardDirection?: "forward" | "reverse";
  }>
): {
  sourceLang: string;
  targetLang: string;
  label: string;
  comboId: LanguageCombinationId | null;
} {
  if (pkgCards.length > 0) {
    const detected = detectPackageLanguageCombo(pkgCards);
    if (detected) {
      return {
        sourceLang: detected.sourceLang,
        targetLang: detected.targetLang,
        label: detected.label,
        comboId: detected.id,
      };
    }
    return {
      sourceLang: "",
      targetLang: "",
      label: "",
      comboId: null,
    };
  }

  if (pkg?.sourceLang && pkg?.targetLang) {
    const id = findCombinationId(pkg.sourceLang, pkg.targetLang);
    const combo = getCombinationById(id);
    return {
      sourceLang: combo.sourceLang,
      targetLang: combo.targetLang,
      label: combo.label,
      comboId: combo.id,
    };
  }

  return {
    sourceLang: "",
    targetLang: "",
    label: "",
    comboId: null,
  };
}
