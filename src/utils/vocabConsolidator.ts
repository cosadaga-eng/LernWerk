import { ImportedVocabDraft, VocabCard } from "../types/vocab";
import { areVocabOpposites } from "./antonyms";

export interface ExistingCardMergeUpdate {
  cardId: string;
  term: string;
  translation: string;
  partOfSpeech?: string;
  phonetic?: string;
  exampleSentence?: string;
  note?: string;
  topic?: string;
}

export interface ConsolidationStats {
  inputCount: number;
  outputCount: number;
  exactDuplicatesRemoved: number;
  sameMeaningMerged: number;
  mergedIntoExistingCount: number;
}

export interface ConsolidationResult {
  consolidatedDrafts: ImportedVocabDraft[];
  existingCardUpdates: ExistingCardMergeUpdate[];
  stats: ConsolidationStats;
}

function normalizeBasic(text: string): string {
  return text
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeMeaningToken(text: string): string {
  return text
    .normalize("NFC")
    .trim()
    .replace(/^[\s•\-–—]+|[\s.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function splitParts(raw: string, separators: RegExp): string[] {
  return raw
    .split(separators)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Splits a translation string into individual meaning senses.
 * Always splits on ';', '/', '|'. Splits on ',' only if every segment looks like
 * a short synonym (<= 3 words) rather than a long explanatory clause.
 */
function extractMeaningParts(translation: string): string[] {
  const primary = splitParts(translation, /\s*[;/|]\s*/);
  const result: string[] = [];

  for (const part of primary) {
    if (part.includes(",")) {
      const commaParts = splitParts(part, /\s*,\s*/);
      const allShortSynonyms =
        commaParts.length > 1 &&
        commaParts.every((cp) => cp.split(/\s+/).length <= 3 && cp.length <= 32);
      if (allShortSynonyms) {
        result.push(...commaParts);
        continue;
      }
    }
    result.push(part);
  }

  return result.length > 0 ? result : [translation.trim()];
}

function extractTermParts(term: string): string[] {
  const parts = splitParts(term, /\s*(?:\/|;|\|)\s*/);
  return parts.length > 0 ? parts : [term.trim()];
}

function mergeDelimitedStrings(
  existingValues: Array<string | undefined>,
  splitter: (val: string) => string[],
  joiner: string
): string {
  const seen = new Set<string>();
  const collected: string[] = [];

  for (const raw of existingValues) {
    if (!raw || !raw.trim()) continue;
    for (const part of splitter(raw)) {
      const norm = normalizeMeaningToken(part);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      collected.push(part.trim());
    }
  }

  return collected.join(joiner);
}

function mergeDistinctSentences(values: Array<string | undefined>): string {
  const seen = new Set<string>();
  const collected: string[] = [];

  for (const raw of values) {
    if (!raw || !raw.trim()) continue;
    const parts = splitParts(raw, /\s*(?:\n|·)\s*/);
    for (const part of parts) {
      const norm = normalizeBasic(part);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      collected.push(part.trim());
    }
  }

  return collected.join(" · ");
}

function meaningJaccard(aMeanings: Set<string>, bMeanings: Set<string>): number {
  if (aMeanings.size === 0 || bMeanings.size === 0) return 0;
  let intersection = 0;
  for (const m of aMeanings) {
    if (bMeanings.has(m)) intersection++;
  }
  if (intersection === 0) return 0;
  const union = aMeanings.size + bMeanings.size - intersection;
  return intersection / union;
}

interface MergedBucket {
  draft: ImportedVocabDraft;
  termSet: Set<string>;
  meaningSet: Set<string>;
  exactPairs: Set<string>;
}

function buildBucketSignature(term: string, translation: string): {
  termSet: Set<string>;
  meaningSet: Set<string>;
} {
  const termSet = new Set(
    extractTermParts(term).map(normalizeMeaningToken).filter(Boolean)
  );
  const meaningSet = new Set(
    extractMeaningParts(translation).map(normalizeMeaningToken).filter(Boolean)
  );
  return { termSet, meaningSet };
}

function setsHaveMatch(
  aTermNorm: string,
  aTransNorm: string,
  aTerms: Set<string>,
  aMeanings: Set<string>,
  bTermNorm: string,
  bTransNorm: string,
  bTerms: Set<string>,
  bMeanings: Set<string>
): "exact" | "same-term" | "same-meaning" | null {
  if (aTermNorm === bTermNorm && aTransNorm === bTransNorm) {
    return "exact";
  }

  if (
    areVocabOpposites(
      { term: aTermNorm, translation: aTransNorm },
      { term: bTermNorm, translation: bTransNorm }
    )
  ) {
    return null;
  }

  // Check if any term overlaps directly (e.g. same foreign word with multiple senses)
  for (const t of aTerms) {
    if (bTerms.has(t)) return "same-term";
  }

  // Exact full normalized translation match (e.g. "couch -> Sofa" & "sofa -> Sofa")
  if (aTransNorm === bTransNorm) {
    return "same-meaning";
  }

  // High overlap across synonym meanings (prevents runaway chaining of broad senses)
  const jaccard = meaningJaccard(aMeanings, bMeanings);
  if (jaccard >= 0.5) {
    return "same-meaning";
  }

  return null;
}

function mergeTwoDraftRecords(
  base: ImportedVocabDraft,
  incoming: ImportedVocabDraft
): ImportedVocabDraft {
  const mergedTerm = mergeDelimitedStrings(
    [base.term, incoming.term],
    extractTermParts,
    " / "
  );
  const mergedTranslation = mergeDelimitedStrings(
    [base.translation, incoming.translation],
    extractMeaningParts,
    "; "
  );
  const mergedPos = mergeDelimitedStrings(
    [base.partOfSpeech, incoming.partOfSpeech],
    (v) => splitParts(v, /\s*(?:\/|;|,)\s*/),
    " / "
  );
  const mergedPhonetic = mergeDelimitedStrings(
    [base.phonetic, incoming.phonetic],
    (v) => splitParts(v, /\s*(?:\/|;)\s*/),
    " / "
  );
  const mergedExample = mergeDistinctSentences([
    base.exampleSentence,
    incoming.exampleSentence,
  ]);
  const mergedNote = mergeDistinctSentences([base.note, incoming.note]);
  const mergedTopic =
    (base.topic || "").trim() || (incoming.topic || "").trim() || undefined;

  return {
    ...base,
    term: mergedTerm || base.term,
    translation: mergedTranslation || base.translation,
    partOfSpeech: mergedPos || undefined,
    phonetic: mergedPhonetic || undefined,
    exampleSentence: mergedExample || undefined,
    note: mergedNote || undefined,
    topic: mergedTopic,
    selected: base.selected || incoming.selected,
  };
}

/**
 * 100% offline, algorithmic deduplication and same-meaning consolidation:
 * 1) Exact duplicates (same term + same translation) -> keeps only 1 entry (with richest metadata).
 * 2) Same term (different meanings) or same meaning (synonyms) -> merges all terms, meanings,
 *    examples, notes, and grammatical tags into a single comprehensive vocabulary entry.
 * 3) Also reconciles against existing workspace cards so re-uploads never create duplicates.
 */
export function consolidateVocabDrafts(
  rawDrafts: ImportedVocabDraft[],
  existingCards: VocabCard[]
): ConsolidationResult {
  const validDrafts = rawDrafts.filter(
    (d) => d.term.trim().length > 0 && d.translation.trim().length > 0
  );

  let exactDuplicatesRemoved = 0;
  let sameMeaningMerged = 0;
  let mergedIntoExistingCount = 0;

  // Step 1: Consolidate within the uploaded batch
  const buckets: MergedBucket[] = [];

  for (const item of validDrafts) {
    const itemTermNorm = normalizeBasic(item.term);
    const itemTransNorm = normalizeBasic(item.translation);
    const exactKey = `${itemTermNorm}|||${itemTransNorm}`;
    const sig = buildBucketSignature(item.term, item.translation);

    let matchedBucket: MergedBucket | null = null;
    let matchKind: "exact" | "same-term" | "same-meaning" | null = null;

    for (const bucket of buckets) {
      if (bucket.exactPairs.has(exactKey)) {
        matchedBucket = bucket;
        matchKind = "exact";
        break;
      }
      const bTermNorm = normalizeBasic(bucket.draft.term);
      const bTransNorm = normalizeBasic(bucket.draft.translation);
      const kind = setsHaveMatch(
        itemTermNorm,
        itemTransNorm,
        sig.termSet,
        sig.meaningSet,
        bTermNorm,
        bTransNorm,
        bucket.termSet,
        bucket.meaningSet
      );
      if (kind) {
        // Avoid over-merging > 6 unrelated synonyms in one card unless exact/same-term
        if (kind === "same-meaning" && bucket.termSet.size >= 6) {
          continue;
        }
        matchedBucket = bucket;
        matchKind = kind;
        break;
      }
    }

    if (!matchedBucket) {
      buckets.push({
        draft: { ...item },
        termSet: sig.termSet,
        meaningSet: sig.meaningSet,
        exactPairs: new Set([exactKey]),
      });
    } else {
      matchedBucket.exactPairs.add(exactKey);
      matchedBucket.draft = mergeTwoDraftRecords(matchedBucket.draft, item);
      const updatedSig = buildBucketSignature(
        matchedBucket.draft.term,
        matchedBucket.draft.translation
      );
      matchedBucket.termSet = updatedSig.termSet;
      matchedBucket.meaningSet = updatedSig.meaningSet;

      if (matchKind === "exact") {
        exactDuplicatesRemoved++;
      } else {
        sameMeaningMerged++;
      }
    }
  }

  // Step 2: Reconcile consolidated drafts against already-existing cards in workspace
  const existingStates = existingCards.map((card) => ({
    card,
    termNorm: normalizeBasic(card.term),
    transNorm: normalizeBasic(card.translation),
    ...buildBucketSignature(card.term, card.translation),
  }));

  const existingUpdatesMap = new Map<string, ExistingCardMergeUpdate>();
  const finalDrafts: ImportedVocabDraft[] = [];

  for (const bucket of buckets) {
    const d = bucket.draft;
    const dTermNorm = normalizeBasic(d.term);
    const dTransNorm = normalizeBasic(d.translation);

    let matchedExisting: (typeof existingStates)[number] | null = null;
    let matchKind: "exact" | "same-term" | "same-meaning" | null = null;

    for (const ex of existingStates) {
      const kind = setsHaveMatch(
        dTermNorm,
        dTransNorm,
        bucket.termSet,
        bucket.meaningSet,
        ex.termNorm,
        ex.transNorm,
        ex.termSet,
        ex.meaningSet
      );
      if (kind) {
        if (kind === "same-meaning" && ex.termSet.size >= 6) {
          continue;
        }
        matchedExisting = ex;
        matchKind = kind;
        break;
      }
    }

    if (!matchedExisting) {
      finalDrafts.push(d);
      continue;
    }

    // Merge into the existing card without creating a duplicate entry
    const currentCardState = matchedExisting.card;
    const prevUpdate = existingUpdatesMap.get(currentCardState.id);
    const asDraft: ImportedVocabDraft = {
      id: currentCardState.id,
      packageId: currentCardState.packageId,
      term: prevUpdate ? prevUpdate.term : currentCardState.term,
      translation: prevUpdate
        ? prevUpdate.translation
        : currentCardState.translation,
      partOfSpeech: prevUpdate
        ? prevUpdate.partOfSpeech
        : currentCardState.partOfSpeech,
      phonetic: prevUpdate ? prevUpdate.phonetic : currentCardState.phonetic,
      exampleSentence: prevUpdate
        ? prevUpdate.exampleSentence
        : currentCardState.exampleSentence,
      note: prevUpdate ? prevUpdate.note : currentCardState.note,
      topic: prevUpdate ? prevUpdate.topic : currentCardState.topic,
      selected: true,
    };

    const mergedExisting = mergeTwoDraftRecords(asDraft, d);
    existingUpdatesMap.set(currentCardState.id, {
      cardId: currentCardState.id,
      term: mergedExisting.term,
      translation: mergedExisting.translation,
      partOfSpeech: mergedExisting.partOfSpeech,
      phonetic: mergedExisting.phonetic,
      exampleSentence: mergedExisting.exampleSentence,
      note: mergedExisting.note,
      topic: mergedExisting.topic,
    });

    // Update signature for subsequent items in the same batch
    matchedExisting.termNorm = normalizeBasic(mergedExisting.term);
    matchedExisting.transNorm = normalizeBasic(mergedExisting.translation);
    const nextSig = buildBucketSignature(
      mergedExisting.term,
      mergedExisting.translation
    );
    matchedExisting.termSet = nextSig.termSet;
    matchedExisting.meaningSet = nextSig.meaningSet;

    if (matchKind === "exact") {
      exactDuplicatesRemoved++;
    } else {
      sameMeaningMerged++;
    }
    mergedIntoExistingCount++;
  }

  return {
    consolidatedDrafts: finalDrafts,
    existingCardUpdates: Array.from(existingUpdatesMap.values()),
    stats: {
      inputCount: validDrafts.length,
      outputCount: finalDrafts.length,
      exactDuplicatesRemoved,
      sameMeaningMerged,
      mergedIntoExistingCount,
    },
  };
}
