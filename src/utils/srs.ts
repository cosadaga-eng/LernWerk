import { ReviewQuality, SrsSchedule, SrsState, VocabCard } from "../types/vocab";
import { areVocabOpposites } from "./antonyms";

export function createInitialSrs(now = Date.now()): SrsSchedule {
  return {
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    lapses: 0,
    state: "neu",
    dueDate: now,
  };
}

/**
 * Mastery-based algorithmic card progression (no due dates or time intervals):
 *  - quality === 1 ("Nochmal lernen"): resets streak, increments lapses, marks state "lernen".
 *  - quality >= 3 ("Gewusst" / "Mit Hinweis"): increments repetitions and advances state
 *    ("lernen" -> "wiederholen" -> "gemeistert").
 */
export function scheduleCard(
  current: SrsSchedule,
  quality: ReviewQuality,
  now = Date.now()
): SrsSchedule {
  let easeFactor = current.easeFactor;
  let repetitions = current.repetitions;
  let lapses = current.lapses;
  let state: SrsState = current.state;

  if (quality === 1) {
    repetitions = 0;
    lapses += 1;
    easeFactor = Math.max(1.3, Number((easeFactor - 0.2).toFixed(2)));
    state = "lernen";
    return {
      easeFactor,
      interval: 0,
      repetitions,
      lapses,
      state,
      dueDate: now,
      lastReviewedAt: now,
    };
  }

  const qDelta = 5 - quality;
  easeFactor = easeFactor + (0.1 - qDelta * (0.08 + qDelta * 0.02));
  easeFactor = Math.max(1.3, Math.min(3.0, Number(easeFactor.toFixed(2))));

  repetitions += 1;

  if (repetitions >= 3 && quality >= 4) {
    state = "gemeistert";
  } else if (repetitions >= 2) {
    state = "wiederholen";
  } else {
    state = "lernen";
  }

  return {
    easeFactor,
    interval: 0,
    repetitions,
    lapses,
    state,
    dueDate: now,
    lastReviewedAt: now,
  };
}

/**
 * Orders study cards by learning priority (previously wrong & in-learning first,
 * mastered cards last) without any time-based or due-date gating.
 */
export function sortStudyQueue(cards: VocabCard[]): VocabCard[] {
  const rankState = (state: SrsState): number => {
    switch (state) {
      case "lernen":
        return 0;
      case "neu":
        return 1;
      case "wiederholen":
        return 2;
      case "gemeistert":
        return 3;
    }
  };

  return [...cards].sort((a, b) => {
    const aWrong = a.lastWrong ? 0 : 1;
    const bWrong = b.lastWrong ? 0 : 1;
    if (aWrong !== bWrong) return aWrong - bWrong;

    const aRank = rankState(a.srs.state);
    const bRank = rankState(b.srs.state);
    if (aRank !== bRank) return aRank - bRank;

    if (a.srs.repetitions !== b.srs.repetitions) {
      return a.srs.repetitions - b.srs.repetitions;
    }
    return a.srs.easeFactor - b.srs.easeFactor;
  });
}

export function getStateLabel(state: SrsState): string {
  switch (state) {
    case "neu":
      return "Neu";
    case "lernen":
      return "Im Aufbau";
    case "wiederholen":
      return "Wiederholung";
    case "gemeistert":
      return "Gemeistert";
  }
}

export function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Shuffles card IDs strictly within each package so packages never mix together.
 */
export function shuffleIdsWithinPackages(
  cardIds: string[],
  cardMap: Map<string, VocabCard>,
  shouldShufflePackage?: (packageId: number) => boolean
): string[] {
  const packageOrder: number[] = [];
  const buckets = new Map<number, string[]>();

  for (const id of cardIds) {
    const card = cardMap.get(id);
    const pkgId = card ? card.packageId : -1;
    let bucket = buckets.get(pkgId);
    if (!bucket) {
      bucket = [];
      buckets.set(pkgId, bucket);
      packageOrder.push(pkgId);
    }
    bucket.push(id);
  }

  const result: string[] = [];
  for (const pkgId of packageOrder) {
    const bucket = buckets.get(pkgId)!;
    const doShuffle = shouldShufflePackage ? shouldShufflePackage(pkgId) : true;
    result.push(...(doShuffle && bucket.length > 1 ? shuffleArray(bucket) : bucket));
  }
  return result;
}

function areMirrorCards(a: VocabCard, b: VocabCard): boolean {
  if (a.pairId && b.pairId && a.pairId === b.pairId) return true;
  const aTerm = a.term.trim().toLowerCase();
  const aTrans = a.translation.trim().toLowerCase();
  const bTerm = b.term.trim().toLowerCase();
  const bTrans = b.translation.trim().toLowerCase();
  return aTerm === bTrans && aTrans === bTerm;
}

/**
 * Reorders a study queue minimally so opposite/antonym cards and mirror
 * bidirectional pairs never appear directly adjacent to one another.
 */
export function separateAdjacentOpposites(
  cardIds: string[],
  cardMap: Map<string, VocabCard>
): string[] {
  if (cardIds.length <= 2) return cardIds;
  const remaining = [...cardIds];
  const ordered: string[] = [];

  const hasConflict = (a?: VocabCard, b?: VocabCard): boolean => {
    if (!a || !b) return false;
    return areVocabOpposites(a, b) || areMirrorCards(a, b);
  };

  while (remaining.length > 0) {
    const prev = ordered.length > 0 ? cardMap.get(ordered[ordered.length - 1]) : undefined;
    if (!prev) {
      ordered.push(remaining.shift()!);
      continue;
    }

    // Prefer safe candidates that still have a sibling/opposite waiting in `remaining`
    // so paired cards don't get stranded together at the very end of the queue.
    let bestSafeIdx = -1;
    let bestPriority = -1;

    for (let i = 0; i < remaining.length; i++) {
      const cand = cardMap.get(remaining[i]);
      if (hasConflict(prev, cand)) continue;

      let siblingCount = 0;
      if (cand) {
        for (let j = 0; j < remaining.length; j++) {
          if (i === j) continue;
          if (hasConflict(cand, cardMap.get(remaining[j]))) {
            siblingCount++;
          }
        }
      }

      if (siblingCount > bestPriority) {
        bestPriority = siblingCount;
        bestSafeIdx = i;
      }
    }

    if (bestSafeIdx !== -1) {
      ordered.push(remaining.splice(bestSafeIdx, 1)[0]);
      continue;
    }

    // No safe candidate to append at the end: try inserting into a non-conflicting gap
    const forcedId = remaining.shift()!;
    const forcedCard = cardMap.get(forcedId);
    let inserted = false;
    for (let pos = 0; pos < ordered.length; pos++) {
      const left = pos > 0 ? cardMap.get(ordered[pos - 1]) : undefined;
      const right = cardMap.get(ordered[pos]);
      if (!hasConflict(left, forcedCard) && !hasConflict(forcedCard, right)) {
        ordered.splice(pos, 0, forcedId);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      ordered.push(forcedId);
    }
  }

  return ordered;
}
