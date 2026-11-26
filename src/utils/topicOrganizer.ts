import {
  detectCardLanguageCombo,
  detectPackageLanguageCombo,
  LanguageCombination,
} from "../data/languages";
import {
  detectLearningSubject,
  getSubjectDefinition,
} from "../data/subjects";
import {
  ImportedVocabDraft,
  LearningSubject,
  VocabCard,
  VocabPackage,
} from "../types/vocab";
import { areVocabOpposites } from "./antonyms";
import { createInitialSrs, shuffleArray } from "./srs";

export const VOCAB_PACKAGE_SIZE = 50;

export interface OrganizedPackagePlan {
  packageId: number;
  packageNumber: number;
  groupId: string;
  groupName: string;
  suggestedTitle: string;
  suggestedDescription: string;
  detectedCombo: LanguageCombination | null;
  detectedSubject: Exclude<LearningSubject, "auto">;
  subjectLabel: string;
  bidirectional: boolean;
  uniquePairCount: number;
  totalCardCount: number;
  items: ImportedVocabDraft[];
  isNewSlot: boolean;
}

export interface RandomOrganizationResult {
  updatedDrafts: ImportedVocabDraft[];
  packagePlans: OrganizedPackagePlan[];
  extraPackagesNeeded: VocabPackage[];
  separatedOppositesCount: number;
}

/**
 * Organizes an imported learning list (vocabulary, formulas, exam questions, facts, etc.)
 * into its own brand-new group of packages:
 * - Creates a dedicated new group (`groupId`, `groupName`) so every list remains self-contained.
 * - If a list has <= 50 entries, it strictly stays ONE single package named after `listName`.
 * - If a list has > 50 entries, it splits randomly into Math.ceil(N / 50) packages of up to
 *   50 entries each, named `<listName> (1-50)`, `<listName> (51-100)`, etc., while separating
 *   opposites across those buckets whenever possible.
 * - For vocabulary sets (`sprachen`), `bidirectional` defaults to true so every vocabulary
 *   entry creates both directions (50 vocabulary entries = 100 cards in the package).
 */
export function planRandomPackages(params: {
  items: ImportedVocabDraft[];
  packages: VocabPackage[];
  listName: string;
  groupId: string;
  subject?: LearningSubject;
  bidirectional?: boolean;
  maxPerPackage?: number;
}): RandomOrganizationResult {
  const {
    items,
    packages,
    listName,
    groupId,
    subject = "auto",
    bidirectional,
    maxPerPackage = VOCAB_PACKAGE_SIZE,
  } = params;

  const activeItems = items.filter((i) => i.term.trim() && i.translation.trim());
  if (activeItems.length === 0) {
    return {
      updatedDrafts: items,
      packagePlans: [],
      extraPackagesNeeded: [],
      separatedOppositesCount: 0,
    };
  }

  const cleanGroupName = listName.trim() || "Neue Liste";

  // 1. Determine whether this list is a bilingual language deck or a general subject deck
  const dominantCombo =
    subject === "auto" || subject === "sprachen"
      ? detectPackageLanguageCombo(activeItems)
      : null;

  const resolvedGeneralSubject: Exclude<LearningSubject, "auto"> =
    subject !== "auto"
      ? subject
      : dominantCombo
        ? "sprachen"
        : detectLearningSubject(activeItems, cleanGroupName);

  const itemsByBatch = new Map<
    string,
    { combo: LanguageCombination | null; items: ImportedVocabDraft[] }
  >();

  if (dominantCombo) {
    for (const draft of activeItems) {
      const combo = detectCardLanguageCombo(
        draft.term,
        draft.translation,
        dominantCombo
      );
      const key = combo ? combo.id : "general";
      let entry = itemsByBatch.get(key);
      if (!entry) {
        entry = { combo, items: [] };
        itemsByBatch.set(key, entry);
      }
      entry.items.push(draft);
    }
  } else {
    itemsByBatch.set("general", { combo: null, items: [...activeItems] });
  }

  // 2. Shuffle randomly within each batch.
  //    Strictly keep <= 50 items in ONE package; for > 50 items split into Math.ceil(N / 50)
  //    packages of max 50 while avoiding opposite pairs in the same bucket.
  const rawBuckets: Array<{
    combo: LanguageCombination | null;
    items: ImportedVocabDraft[];
  }> = [];
  let separatedOppositesCount = 0;

  for (const { combo, items: groupItems } of itemsByBatch.values()) {
    const shuffled = shuffleArray(groupItems);
    const targetBucketCount = Math.max(
      1,
      Math.ceil(shuffled.length / maxPerPackage)
    );

    if (targetBucketCount === 1) {
      const refinedCombo = combo ? detectPackageLanguageCombo(shuffled) || combo : null;
      rawBuckets.push({ combo: refinedCombo, items: shuffled });
      continue;
    }

    const groupPackages: ImportedVocabDraft[][] = Array.from(
      { length: targetBucketCount },
      () => []
    );

    for (const draft of shuffled) {
      let chosenBucketIdx = -1;
      let hadOppositeConflict = false;

      for (let b = 0; b < groupPackages.length; b++) {
        if (groupPackages[b].length >= maxPerPackage) continue;
        const hasOpposite = groupPackages[b].some((existing) =>
          areVocabOpposites(existing, draft)
        );
        if (!hasOpposite) {
          chosenBucketIdx = b;
          break;
        } else {
          hadOppositeConflict = true;
        }
      }

      if (chosenBucketIdx !== -1 && hadOppositeConflict) {
        separatedOppositesCount += 1;
      }

      if (chosenBucketIdx === -1) {
        chosenBucketIdx = groupPackages.findIndex(
          (b) => b.length < maxPerPackage
        );
      }

      if (chosenBucketIdx === -1) {
        groupPackages.push([draft]);
      } else {
        groupPackages[chosenBucketIdx].push(draft);
      }
    }

    for (const pkgItems of groupPackages) {
      if (pkgItems.length === 0) continue;
      const refinedCombo = combo ? detectPackageLanguageCombo(pkgItems) || combo : null;
      rawBuckets.push({ combo: refinedCombo, items: pkgItems });
    }
  }

  // 3. Always create brand-new packages for this new list group
  let nextDynamicNumber =
    packages.reduce((max, p) => Math.max(max, p.number), 0) + 1;
  let nextDynamicId =
    packages.reduce((max, p) => Math.max(max, p.id), 0) + 1;

  const extraPackagesNeeded: VocabPackage[] = [];
  const packagePlans: OrganizedPackagePlan[] = [];
  const draftToPkg = new Map<string, number>();

  const totalPackagesInGroup = rawBuckets.length;
  let runningStart = 1;

  for (let idx = 0; idx < rawBuckets.length; idx++) {
    const bucket = rawBuckets[idx];
    const rangeStart = runningStart;
    const rangeEnd = runningStart + bucket.items.length - 1;
    runningStart = rangeEnd + 1;

    const bucketSubject: Exclude<LearningSubject, "auto"> = bucket.combo
      ? "sprachen"
      : resolvedGeneralSubject;
    const isBidirectional =
      bidirectional !== undefined ? bidirectional : bucketSubject === "sprachen";
    const subjectDef = getSubjectDefinition(bucketSubject);
    const subjectLabel = bucket.combo
      ? `${bucket.combo.sourceLang} ${isBidirectional ? "↔" : "→"} ${bucket.combo.targetLang}`
      : subjectDef.shortLabel;

    const uniquePairCount = bucket.items.length;
    const totalCardCount = isBidirectional ? uniquePairCount * 2 : uniquePairCount;

    const title =
      totalPackagesInGroup === 1
        ? cleanGroupName
        : `${cleanGroupName} (${rangeStart}-${rangeEnd})`;
    const description = isBidirectional
      ? `${uniquePairCount} Vokabeln · ${totalCardCount} Karten (beide Richtungen) · ${subjectLabel}`
      : `${totalCardCount} Karten · ${subjectLabel}`;

    const targetPkg: VocabPackage = {
      id: nextDynamicId++,
      number: nextDynamicNumber++,
      title,
      groupId,
      groupName: cleanGroupName,
      bidirectional: isBidirectional,
      subject: bucketSubject,
      subjectLabel,
      sourceLang: bucket.combo?.sourceLang || "",
      targetLang: bucket.combo?.targetLang || "",
      description,
      nextSessionFilter: "all",
    };
    extraPackagesNeeded.push(targetPkg);

    const assignedDrafts: ImportedVocabDraft[] = bucket.items.map((d) => {
      draftToPkg.set(d.id, targetPkg.id);
      return {
        ...d,
        packageId: targetPkg.id,
      };
    });

    packagePlans.push({
      packageId: targetPkg.id,
      packageNumber: targetPkg.number,
      groupId,
      groupName: cleanGroupName,
      suggestedTitle: title,
      suggestedDescription: description,
      detectedCombo: bucket.combo,
      detectedSubject: bucketSubject,
      subjectLabel,
      bidirectional: isBidirectional,
      uniquePairCount,
      totalCardCount,
      items: assignedDrafts,
      isNewSlot: true,
    });
  }

  const updatedDrafts = items.map((d) => {
    const pkgId = draftToPkg.get(d.id);
    return pkgId !== undefined ? { ...d, packageId: pkgId } : d;
  });

  const pkgOrderIndex = new Map<number, number>();
  packagePlans.forEach((plan, idx) => pkgOrderIndex.set(plan.packageId, idx));
  updatedDrafts.sort((a, b) => {
    const oa = pkgOrderIndex.get(a.packageId) ?? 9999;
    const ob = pkgOrderIndex.get(b.packageId) ?? 9999;
    return oa - ob;
  });

  return {
    updatedDrafts,
    packagePlans,
    extraPackagesNeeded,
    separatedOppositesCount,
  };
}

/**
 * Expands selected drafts into bidirectional forward + reverse card pairs
 * for packages marked as `bidirectional` (e.g. 50 vocab entries -> 100 cards).
 */
export function expandDraftsWithBidirectional(
  selectedDrafts: ImportedVocabDraft[],
  bidirectionalPkgIds: Set<number>
): ImportedVocabDraft[] {
  const expanded: ImportedVocabDraft[] = [];
  const seenPairsPerPkg = new Map<number, Set<string>>();

  for (const draft of selectedDrafts) {
    const term = draft.term.trim();
    const translation = draft.translation.trim();
    if (!term || !translation) continue;

    const isBidirectional = bidirectionalPkgIds.has(draft.packageId);
    const pairId =
      draft.pairId || `pair-${draft.id}-${Math.random().toString(36).slice(2, 6)}`;

    let pkgSeen = seenPairsPerPkg.get(draft.packageId);
    if (!pkgSeen) {
      pkgSeen = new Set<string>();
      seenPairsPerPkg.set(draft.packageId, pkgSeen);
    }

    const forwardKey = `${term.toLowerCase()}:::${translation.toLowerCase()}`;
    if (!pkgSeen.has(forwardKey)) {
      pkgSeen.add(forwardKey);
      expanded.push({
        ...draft,
        pairId,
        cardDirection: "forward",
      });
    }

    if (isBidirectional && term.toLowerCase() !== translation.toLowerCase()) {
      const reverseKey = `${translation.toLowerCase()}:::${term.toLowerCase()}`;
      if (!pkgSeen.has(reverseKey)) {
        pkgSeen.add(reverseKey);
        expanded.push({
          ...draft,
          id: `${draft.id}-rev`,
          term: translation,
          translation: term,
          phonetic: undefined,
          pairId,
          cardDirection: "reverse",
        });
      }
    }
  }

  return expanded;
}

/**
 * Finds any vocabulary cards in a package that do not yet have a mirror reverse card
 * and returns the newly generated reverse VocabCard entries.
 */
export function createMissingReverseCards(
  pkgCards: VocabCard[],
  now = Date.now()
): VocabCard[] {
  const existingKeys = new Set(
    pkgCards.map(
      (c) => `${c.term.trim().toLowerCase()}:::${c.translation.trim().toLowerCase()}`
    )
  );
  const additions: VocabCard[] = [];

  for (let i = 0; i < pkgCards.length; i++) {
    const c = pkgCards[i];
    const term = c.term.trim();
    const translation = c.translation.trim();
    if (!term || !translation || term.toLowerCase() === translation.toLowerCase()) {
      continue;
    }
    const reverseKey = `${translation.toLowerCase()}:::${term.toLowerCase()}`;
    if (existingKeys.has(reverseKey)) continue;
    existingKeys.add(reverseKey);

    additions.push({
      id: `rev-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      packageId: c.packageId,
      term: translation,
      translation: term,
      partOfSpeech: c.partOfSpeech,
      exampleSentence: c.exampleSentence,
      note: c.note,
      topic: c.topic,
      pairId: c.pairId || `pair-${c.id}`,
      cardDirection: "reverse",
      sourceId: c.sourceId,
      notebookId: c.notebookId,
      lastWrong: false,
      srs: createInitialSrs(now),
      createdAt: now,
      updatedAt: now,
    });
  }

  return additions;
}

/**
 * Moves conflicting opposite cards out of an already populated package into
 * a conflict-free package within the same group.
 */
export function planExistingPackageOppositeSeparation(
  sourcePackageId: number,
  packages: VocabPackage[],
  cards: VocabCard[],
  maxPerPackage = VOCAB_PACKAGE_SIZE
): {
  moves: Map<string, number>;
  newPackages: VocabPackage[];
  updatedTitles: Map<
    number,
    {
      title: string;
      sourceLang: string;
      targetLang: string;
      description: string;
    }
  >;
} {
  const sourcePkg = packages.find((p) => p.id === sourcePackageId);
  const pkgCards = cards.filter((c) => c.packageId === sourcePackageId);
  const kept: VocabCard[] = [];
  const toMove: VocabCard[] = [];

  for (const card of pkgCards) {
    const conflicts = kept.some((k) => areVocabOpposites(k, card));
    if (conflicts) {
      toMove.push(card);
    } else {
      kept.push(card);
    }
  }

  const moves = new Map<string, number>();
  const newPackages: VocabPackage[] = [];
  const updatedTitles = new Map<
    number,
    {
      title: string;
      sourceLang: string;
      targetLang: string;
      description: string;
    }
  >();

  if (toMove.length === 0) {
    return { moves, newPackages, updatedTitles };
  }

  const cardsByPkg = new Map<number, VocabCard[]>();
  packages.forEach((p) => cardsByPkg.set(p.id, []));
  for (const c of cards) {
    if (!cardsByPkg.has(c.packageId)) cardsByPkg.set(c.packageId, []);
    cardsByPkg.get(c.packageId)!.push(c);
  }
  cardsByPkg.set(sourcePackageId, kept);

  const slotCapacity = (pkg: { bidirectional?: boolean }) =>
    pkg.bidirectional ? maxPerPackage * 2 : maxPerPackage;

  const sameGroupPartialSlots = [...packages]
    .filter(
      (p) =>
        p.id !== sourcePackageId &&
        (sourcePkg?.groupId ? p.groupId === sourcePkg.groupId : !p.groupId)
    )
    .sort((a, b) => a.number - b.number)
    .filter((p) => {
      const len = cardsByPkg.get(p.id)?.length || 0;
      return len < slotCapacity(p);
    });

  let nextDynamicNumber =
    packages.reduce((max, p) => Math.max(max, p.number), 0) + 1;
  let nextDynamicId =
    packages.reduce((max, p) => Math.max(max, p.id), 0) + 1;

  const pairTargetPkg = new Map<string, number>();

  for (const card of toMove) {
    let targetPkgId: number | null = card.pairId
      ? pairTargetPkg.get(card.pairId) ?? null
      : null;
    const cardCombo = detectPackageLanguageCombo([card]);

    if (targetPkgId === null) {
      for (const slot of [...sameGroupPartialSlots, ...newPackages]) {
        const existing = cardsByPkg.get(slot.id) || [];
        if (existing.length >= slotCapacity(slot)) continue;
        const existingCombo =
          existing.length > 0 ? detectPackageLanguageCombo(existing) : null;
        if (existingCombo && cardCombo && existingCombo.id !== cardCombo.id) {
          continue;
        }
        if (!existing.some((e) => areVocabOpposites(e, card))) {
          targetPkgId = slot.id;
          existing.push(card);
          cardsByPkg.set(slot.id, existing);
          break;
        }
      }
    } else {
      const existing = cardsByPkg.get(targetPkgId) || [];
      existing.push(card);
      cardsByPkg.set(targetPkgId, existing);
    }

    if (targetPkgId === null) {
      const created: VocabPackage = {
        id: nextDynamicId++,
        number: nextDynamicNumber++,
        title: sourcePkg
          ? `${sourcePkg.title} (Getrennt)`
          : `Paket ${String(nextDynamicNumber - 1).padStart(2, "0")}`,
        groupId: sourcePkg?.groupId,
        groupName: sourcePkg?.groupName,
        notebookId: sourcePkg?.notebookId,
        sourceIds: sourcePkg?.sourceIds,
        sourceTitles: sourcePkg?.sourceTitles,
        bidirectional: sourcePkg?.bidirectional,
        subject: sourcePkg?.subject,
        subjectLabel: sourcePkg?.subjectLabel,
        sourceLang: cardCombo?.sourceLang || sourcePkg?.sourceLang || "",
        targetLang: cardCombo?.targetLang || sourcePkg?.targetLang || "",
        description: sourcePkg
          ? `Getrennte Gegenbegriffe aus ${sourcePkg.title}`
          : "",
        nextSessionFilter: "all",
      };
      newPackages.push(created);
      cardsByPkg.set(created.id, [card]);
      targetPkgId = created.id;
    }

    if (card.pairId) {
      pairTargetPkg.set(card.pairId, targetPkgId);
    }
    moves.set(card.id, targetPkgId);
  }

  return { moves, newPackages, updatedTitles };
}
