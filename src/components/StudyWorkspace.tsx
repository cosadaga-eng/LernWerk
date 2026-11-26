import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Layers,
  Plus,
  RotateCw,
  Shuffle,
} from "lucide-react";
import {
  AppSettings,
  PackageNextFilter,
  ReviewQuality,
  StudyMode,
  StudyScope,
  VocabCard,
  VocabPackage,
} from "../types/vocab";
import {
  getPackageSubjectContext,
  PackageSubjectContext,
} from "../data/subjects";
import { detectTextPrimaryLanguage } from "../data/languages";
import {
  separateAdjacentOpposites,
  shuffleIdsWithinPackages,
  sortStudyQueue,
} from "../utils/srs";
import { areVocabOpposites } from "../utils/antonyms";
import { FormattedText } from "./FormattedText";

function isGroupScope(scope: StudyScope): scope is `group:${string}` {
  return typeof scope === "string" && scope.startsWith("group:");
}

function getGroupIdFromScope(scope: `group:${string}`): string {
  return scope.slice(6);
}

interface StudyWorkspaceProps {
  packages: VocabPackage[];
  cards: VocabCard[];
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onUpdatePackage: (packageId: number, updates: Partial<VocabPackage>) => void;
  onShufflePackage: (packageId: number) => void;
  selectedPackageId: StudyScope;
  onSelectPackageId: (pkgId: StudyScope) => void;
  activeSession: boolean;
  onSetActiveSession: (active: boolean) => void;
  sessionLaunchTrigger: number;
  studyMode: StudyMode;
  onSetStudyMode: (mode: StudyMode) => void;
  onReviewCard: (
    cardId: string,
    quality: ReviewQuality,
    correct: boolean
  ) => void;
  onNavigateTab: (tab: "notebooks" | "packages" | "cards" | "import") => void;
  onCreateCard: (defaultPkgId: number) => void;
  onEditCard: (card: VocabCard) => void;
}

function getModeLabel(mode: StudyMode): string {
  return mode === "multiple-choice" ? "Multiple-Choice" : "Lernkarten";
}

function isMirrorCard(a: VocabCard, b: VocabCard): boolean {
  if (a.pairId && b.pairId && a.pairId === b.pairId) return true;
  return (
    a.term.trim().toLowerCase() === b.translation.trim().toLowerCase() &&
    a.translation.trim().toLowerCase() === b.term.trim().toLowerCase()
  );
}

function buildMcOptions(
  currentCard: VocabCard,
  allCards: VocabCard[],
  packageSubjectMap: Map<number, PackageSubjectContext>,
  direction: "term-to-trans" | "trans-to-term"
): string[] {
  const correctValue =
    direction === "term-to-trans" ? currentCard.translation : currentCard.term;
  const currentCtx = packageSubjectMap.get(currentCard.packageId);
  const expectedLang = currentCtx?.isLanguageDeck
    ? detectTextPrimaryLanguage(correctValue)
    : "unknown";

  const matchesAnswerLanguage = (c: VocabCard): boolean => {
    if (isMirrorCard(currentCard, c)) return false;
    if (currentCard.cardDirection && c.cardDirection) {
      if (currentCard.cardDirection !== c.cardDirection) return false;
    }
    if (expectedLang !== "unknown") {
      const candText = direction === "term-to-trans" ? c.translation : c.term;
      const candLang = detectTextPrimaryLanguage(candText);
      if (candLang !== "unknown" && candLang !== expectedLang) return false;
    }
    return true;
  };

  const samePkg = allCards.filter(
    (c) =>
      c.id !== currentCard.id &&
      c.packageId === currentCard.packageId &&
      matchesAnswerLanguage(c)
  );
  const sameDomainOtherPkg = allCards.filter((c) => {
    if (c.id === currentCard.id || c.packageId === currentCard.packageId) {
      return false;
    }
    if (!matchesAnswerLanguage(c)) return false;
    const otherCtx = packageSubjectMap.get(c.packageId);
    if (!currentCtx || !otherCtx) return false;
    if (currentCtx.isLanguageDeck) {
      return (
        otherCtx.isLanguageDeck &&
        currentCtx.languagePairLabel !== "" &&
        otherCtx.languagePairLabel === currentCtx.languagePairLabel
      );
    }
    return otherCtx.subject === currentCtx.subject;
  });

  const pool = [...samePkg, ...sameDomainOtherPkg];
  const distractors: string[] = [];
  const seen = new Set<string>([correctValue.trim().toLowerCase()]);

  const scorePool = (items: VocabCard[]) =>
    items
      .map((c, idx) => ({
        val: direction === "term-to-trans" ? c.translation : c.term,
        score:
          ((c.id.charCodeAt(c.id.length - 1) || idx) * 31 +
            currentCard.id.length * 17 +
            idx) %
          97,
      }))
      .sort((a, b) => a.score - b.score);

  const nonOppositePool = pool.filter((c) => !areVocabOpposites(currentCard, c));
  const oppositePool = pool.filter((c) => areVocabOpposites(currentCard, c));

  for (const candidatePool of [nonOppositePool, oppositePool]) {
    for (const candidate of scorePool(candidatePool)) {
      if (distractors.length >= 3) break;
      const norm = candidate.val.trim().toLowerCase();
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        distractors.push(candidate.val);
      }
    }
    if (distractors.length >= 3) break;
  }

  const combined = [correctValue, ...distractors];
  const shift =
    currentCard.id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) %
    combined.length;
  return [...combined.slice(shift), ...combined.slice(0, shift)];
}

export function StudyWorkspace({
  packages,
  cards,
  settings,
  onUpdateSettings,
  onUpdatePackage,
  onShufflePackage,
  selectedPackageId,
  onSelectPackageId,
  activeSession,
  onSetActiveSession,
  sessionLaunchTrigger,
  studyMode,
  onSetStudyMode,
  onReviewCard,
  onNavigateTab,
  onCreateCard,
  onEditCard,
}: StudyWorkspaceProps) {
  const [globalFilter, setGlobalFilter] = useState<PackageNextFilter>("all");
  const [mcDirection, setMcDirection] = useState<"term-to-trans" | "trans-to-term">(
    "term-to-trans"
  );

  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedMcOption, setSelectedMcOption] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState<{
    reviewed: number;
    correct: number;
    lapsed: number;
  }>({ reviewed: 0, correct: 0, lapsed: 0 });
  const [sessionCompleted, setSessionCompleted] = useState(false);

  const flashcardRef = useRef<HTMLDivElement | null>(null);
  const pointerStartRef = useRef<{
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [justShuffledSession, setJustShuffledSession] = useState(false);
  const [justShuffledPkgId, setJustShuffledPkgId] = useState<number | null>(null);

  const packageMap = useMemo(() => {
    const map = new Map<number, VocabPackage>();
    packages.forEach((p) => map.set(p.id, p));
    return map;
  }, [packages]);

  const cardMap = useMemo(() => {
    const map = new Map<string, VocabCard>();
    cards.forEach((c) => map.set(c.id, c));
    return map;
  }, [cards]);

  const packageSubjectMap = useMemo(() => {
    const byPkg = new Map<number, VocabCard[]>();
    cards.forEach((c) => {
      const list = byPkg.get(c.packageId) || [];
      list.push(c);
      byPkg.set(c.packageId, list);
    });
    const map = new Map<number, PackageSubjectContext>();
    packages.forEach((p) => {
      const pkgCards = byPkg.get(p.id) || [];
      map.set(p.id, getPackageSubjectContext(p, pkgCards));
    });
    return map;
  }, [cards, packages]);

  const selectedPkgObj =
    typeof selectedPackageId === "number"
      ? packageMap.get(selectedPackageId) || null
      : null;

  const selectedGroupId = isGroupScope(selectedPackageId)
    ? getGroupIdFromScope(selectedPackageId)
    : null;

  const activeFilter: PackageNextFilter = selectedPkgObj
    ? selectedPkgObj.nextSessionFilter
    : globalFilter;

  const setScopeFilter = (next: PackageNextFilter) => {
    if (selectedPkgObj) {
      onUpdatePackage(selectedPkgObj.id, { nextSessionFilter: next });
    } else {
      setGlobalFilter(next);
    }
  };

  const scopedCards = useMemo(() => {
    if (selectedPackageId === "all") return cards;
    if (selectedGroupId) {
      return cards.filter(
        (c) => packageMap.get(c.packageId)?.groupId === selectedGroupId
      );
    }
    return cards.filter((c) => c.packageId === selectedPackageId);
  }, [cards, packageMap, selectedGroupId, selectedPackageId]);

  const wrongInScope = useMemo(
    () => scopedCards.filter((c) => c.lastWrong),
    [scopedCards]
  );

  const learnedCount = useMemo(
    () => cards.filter((c) => c.srs.repetitions > 0).length,
    [cards]
  );

  const openCount = cards.length - learnedCount;

  const totalWrongCount = useMemo(
    () => cards.filter((c) => c.lastWrong).length,
    [cards]
  );

  const activePackages = useMemo(() => {
    return packages
      .map((pkg) => {
        const pkgCards = cards.filter((c) => c.packageId === pkg.id);
        const learned = pkgCards.filter((c) => c.srs.repetitions > 0).length;
        const wrong = pkgCards.filter((c) => c.lastWrong).length;
        const ctx = packageSubjectMap.get(pkg.id);
        return {
          pkg,
          total: pkgCards.length,
          learned,
          wrong,
          domainLabel: ctx?.displayLabel || "",
        };
      })
      .filter((entry) => entry.total > 0)
      .sort((a, b) => a.pkg.number - b.pkg.number);
  }, [cards, packageSubjectMap, packages]);

  const activeGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        groupId: string;
        groupName: string;
        isRealGroup: boolean;
        entries: typeof activePackages;
        totalCards: number;
      }
    >();
    for (const entry of activePackages) {
      const hasReal = Boolean(entry.pkg.groupId);
      const gid = entry.pkg.groupId || `standalone-${entry.pkg.id}`;
      const gname = entry.pkg.groupName || entry.pkg.title;
      let grp = map.get(gid);
      if (!grp) {
        grp = {
          groupId: gid,
          groupName: gname,
          isRealGroup: hasReal,
          entries: [],
          totalCards: 0,
        };
        map.set(gid, grp);
      }
      grp.entries.push(entry);
      grp.totalCards += entry.total;
    }
    return Array.from(map.values());
  }, [activePackages]);

  const resetCardInteraction = useCallback(() => {
    setIsFlipped(false);
    setSelectedMcOption(null);
    setSwipeOffset(0);
    setIsDraggingCard(false);
    pointerStartRef.current = null;
  }, []);

  const startSession = useCallback(
    (
      overridePackageId?: StudyScope,
      overrideFilter?: PackageNextFilter
    ) => {
      const scope: StudyScope =
        overridePackageId !== undefined ? overridePackageId : selectedPackageId;
      if (overridePackageId !== undefined) {
        onSelectPackageId(overridePackageId);
      }

      const targetPkg =
        typeof scope === "number" ? packageMap.get(scope) || null : null;
      const targetGroupId = isGroupScope(scope)
        ? getGroupIdFromScope(scope)
        : null;
      const effectiveFilter: PackageNextFilter =
        overrideFilter !== undefined
          ? overrideFilter
          : targetPkg
            ? targetPkg.nextSessionFilter
            : globalFilter;

      const pool =
        scope === "all"
          ? cards
          : targetGroupId
            ? cards.filter(
                (c) => packageMap.get(c.packageId)?.groupId === targetGroupId
              )
            : cards.filter((c) => c.packageId === scope);

      let selectedQueue: string[] = [];

      if (effectiveFilter === "wrong-only") {
        selectedQueue = sortStudyQueue(pool.filter((c) => c.lastWrong)).map(
          (c) => c.id
        );
      } else {
        selectedQueue = sortStudyQueue(pool).map((c) => c.id);
      }

      if (selectedQueue.length === 0) {
        onSetActiveSession(false);
        return;
      }

      selectedQueue = shuffleIdsWithinPackages(
        selectedQueue,
        cardMap,
        (pkgId) =>
          settings.shuffleWithinPackages ||
          Boolean(packageMap.get(pkgId)?.shuffleOrder)
      );
      selectedQueue = separateAdjacentOpposites(selectedQueue, cardMap);

      setQueue(selectedQueue);
      setQueueIndex(0);
      setSessionStats({ reviewed: 0, correct: 0, lapsed: 0 });
      setSessionCompleted(false);
      resetCardInteraction();
      onSetActiveSession(true);
    },
    [
      cardMap,
      cards,
      globalFilter,
      onSelectPackageId,
      onSetActiveSession,
      packageMap,
      resetCardInteraction,
      selectedPackageId,
      settings.shuffleWithinPackages,
    ]
  );

  const handleShuffleActiveQueue = useCallback(() => {
    if (!activeSession || queue.length - queueIndex <= 1) return;
    const head = queue.slice(0, queueIndex);
    const tail = queue.slice(queueIndex);
    let shuffledTail = shuffleIdsWithinPackages(tail, cardMap);
    shuffledTail = separateAdjacentOpposites(shuffledTail, cardMap);
    if (shuffledTail.length > 1 && shuffledTail[0] === tail[0]) {
      const firstCard = cardMap.get(tail[0]);
      const swapIdx = shuffledTail.findIndex(
        (id, idx) =>
          idx > 0 && cardMap.get(id)?.packageId === firstCard?.packageId
      );
      if (swapIdx > 0) {
        const copy = [...shuffledTail];
        [copy[0], copy[swapIdx]] = [copy[swapIdx], copy[0]];
        shuffledTail = copy;
      }
    }
    setQueue([...head, ...shuffledTail]);
    resetCardInteraction();
    if (selectedPkgObj) {
      onShufflePackage(selectedPkgObj.id);
    }
    setJustShuffledSession(true);
    window.setTimeout(() => setJustShuffledSession(false), 1500);
  }, [
    activeSession,
    cardMap,
    onShufflePackage,
    queue,
    queueIndex,
    resetCardInteraction,
    selectedPkgObj,
  ]);

  useEffect(() => {
    if (activeSession && sessionLaunchTrigger > 0) {
      startSession(selectedPackageId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLaunchTrigger]);

  useEffect(() => {
    if (activeSession && queue.length === 0 && !sessionCompleted) {
      startSession();
    }
  }, [activeSession, queue.length, sessionCompleted, startSession]);

  const currentCard = useMemo(() => {
    if (!activeSession || queueIndex >= queue.length) return null;
    const id = queue[queueIndex];
    return cards.find((c) => c.id === id) || null;
  }, [activeSession, cards, queue, queueIndex]);

  const currentPkg = currentCard
    ? packageMap.get(currentCard.packageId)
    : undefined;
  const currentSubjectCtx = currentCard
    ? packageSubjectMap.get(currentCard.packageId) ||
      getPackageSubjectContext(currentPkg, [currentCard])
    : getPackageSubjectContext(undefined, []);

  const mcOptions = useMemo(() => {
    if (!currentCard || studyMode !== "multiple-choice") return [];
    return buildMcOptions(currentCard, cards, packageSubjectMap, mcDirection);
  }, [cards, currentCard, mcDirection, packageSubjectMap, studyMode]);

  const advanceToNext = useCallback(
    (requeueCurrent = false) => {
      let nextQueue = queue;
      if (requeueCurrent && currentCard) {
        nextQueue = [...queue, currentCard.id];
        setQueue(nextQueue);
      }

      const nextIdx = queueIndex + 1;
      if (nextIdx >= nextQueue.length) {
        setSessionCompleted(true);
      } else {
        setQueueIndex(nextIdx);
        resetCardInteraction();
      }
    },
    [currentCard, queue, queueIndex, resetCardInteraction]
  );

  const handleFlashcardRate = useCallback(
    (quality: ReviewQuality) => {
      if (!currentCard) return;
      const isCorrect = quality >= 3;
      onReviewCard(currentCard.id, quality, isCorrect);
      setSessionStats((prev) => ({
        reviewed: prev.reviewed + 1,
        correct: prev.correct + (isCorrect ? 1 : 0),
        lapsed: prev.lapsed + (isCorrect ? 0 : 1),
      }));
      advanceToNext(quality === 1);
    },
    [advanceToNext, currentCard, onReviewCard]
  );

  const handleSelectMc = useCallback(
    (option: string) => {
      if (!currentCard || selectedMcOption !== null) return;
      setSelectedMcOption(option);
      const expected =
        mcDirection === "term-to-trans" ? currentCard.translation : currentCard.term;
      const isCorrect = option === expected;
      const quality: ReviewQuality = isCorrect ? 4 : 1;
      onReviewCard(currentCard.id, quality, isCorrect);
      setSessionStats((prev) => ({
        reviewed: prev.reviewed + 1,
        correct: prev.correct + (isCorrect ? 1 : 0),
        lapsed: prev.lapsed + (isCorrect ? 0 : 1),
      }));
    },
    [currentCard, mcDirection, onReviewCard, selectedMcOption]
  );

  useEffect(() => {
    if (!activeSession || sessionCompleted || !currentCard) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (studyMode === "flashcard" && !isTyping) {
        if (e.code === "Space" || e.key === "Enter") {
          e.preventDefault();
          setIsFlipped((prev) => !prev);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          handleFlashcardRate(1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          handleFlashcardRate(4);
        } else if (isFlipped) {
          if (e.key === "1") handleFlashcardRate(1);
          if (e.key === "2") handleFlashcardRate(4);
        }
      } else if (studyMode === "multiple-choice" && !isTyping) {
        if (selectedMcOption === null) {
          const idx = ["1", "2", "3", "4"].indexOf(e.key);
          if (idx !== -1 && mcOptions[idx]) {
            e.preventDefault();
            handleSelectMc(mcOptions[idx]);
          }
        } else if (e.key === "Enter" || e.code === "Space") {
          e.preventDefault();
          const expected =
            mcDirection === "term-to-trans"
              ? currentCard.translation
              : currentCard.term;
          advanceToNext(selectedMcOption !== expected);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeSession,
    advanceToNext,
    currentCard,
    handleFlashcardRate,
    handleSelectMc,
    isFlipped,
    mcDirection,
    mcOptions,
    selectedMcOption,
    sessionCompleted,
    studyMode,
  ]);

  // --- SESSION COMPLETE SCREEN ---
  if (activeSession && sessionCompleted) {
    const accuracy =
      sessionStats.reviewed > 0
        ? Math.round((sessionStats.correct / sessionStats.reviewed) * 100)
        : 100;

    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-8 sm:p-10 study-card-shadow">
          <div className="flex items-center gap-2.5 text-emerald-700 dark:text-emerald-400 mb-3">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">Lernsession abgeschlossen</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Durchgang beendet
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400 text-sm sm:text-base">
            Ihr Lernstand wurde anhand Ihrer Antworten direkt aktualisiert.
          </p>

          <div className="grid grid-cols-3 gap-6 mt-8 pt-6 border-t border-stone-200/80 dark:border-slate-800">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Bearbeitet</div>
              <div className="mt-1 text-2xl font-display font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {sessionStats.reviewed}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Gewusst-Quote</div>
              <div className="mt-1 text-2xl font-display font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {accuracy}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Nochmal lernen</div>
              <div className="mt-1 text-2xl font-display font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                {sessionStats.lapsed}
              </div>
            </div>
          </div>

          {selectedPkgObj && (
            <div className="mt-6 pt-5 border-t border-stone-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Nächste Auswahl in Paket{" "}
                {String(selectedPkgObj.number).padStart(2, "0")}:
              </span>
              <div className="inline-flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#11151C] rounded-lg">
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePackage(selectedPkgObj.id, {
                      nextSessionFilter: "all",
                    })
                  }
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                    selectedPkgObj.nextSessionFilter === "all"
                      ? "bg-white dark:bg-[#1C222B] text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Alle Karten
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePackage(selectedPkgObj.id, {
                      nextSessionFilter: "wrong-only",
                    })
                  }
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                    selectedPkgObj.nextSessionFilter === "wrong-only"
                      ? "bg-white dark:bg-[#1C222B] text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Nur falsche ({wrongInScope.length})
                </button>
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-stone-200/80 dark:border-slate-800 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onSetActiveSession(false);
                setQueue([]);
                setSessionCompleted(false);
              }}
              className="px-5 py-2.5 text-sm font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 rounded-lg hover:bg-slate-800 dark:hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Zurück zur Übersicht
            </button>
            {wrongInScope.length > 0 && (
              <button
                type="button"
                onClick={() => startSession(selectedPackageId, "wrong-only")}
                className="px-5 py-2.5 text-sm font-medium bg-rose-700 hover:bg-rose-800 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Nur falsche üben ({wrongInScope.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => startSession(selectedPackageId, "all")}
              className="px-5 py-2.5 text-sm font-medium bg-white dark:bg-[#1C222B] border border-stone-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              Erneut üben
            </button>
          </div>
        </div>
      </section>
    );
  }

  // --- ACTIVE STUDY SESSION ---
  if (activeSession && currentCard) {
    const progressPct = Math.round(((queueIndex + 1) / queue.length) * 100);
    const dirLabelForward = currentSubjectCtx.languagePairLabel
      ? currentSubjectCtx.languagePairLabel
      : `${currentSubjectCtx.def.termLabel} → ${currentSubjectCtx.def.answerLabel}`;
    const dirLabelReverse = currentSubjectCtx.isLanguageDeck && currentPkg?.targetLang && currentPkg?.sourceLang
      ? `${currentPkg.targetLang} → ${currentPkg.sourceLang}`
      : `${currentSubjectCtx.def.answerLabel} → ${currentSubjectCtx.def.termLabel}`;

    return (
      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-7 sm:py-9">
        {/* Session Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {currentPkg?.title ||
                `Paket ${String(currentCard.packageId).padStart(2, "0")}`}
            </span>
            {currentSubjectCtx.displayLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span>{currentSubjectCtx.displayLabel}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{getModeLabel(studyMode)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular text-slate-800 dark:text-slate-200 font-medium">
              {queueIndex + 1} / {queue.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {queue.length - queueIndex > 1 && (
              <button
                type="button"
                onClick={handleShuffleActiveQueue}
                title="Verbleibende Karten im Paket mischen"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  justShuffledSession
                    ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300"
                    : "border-stone-200 dark:border-slate-700 bg-white dark:bg-[#161B22] text-slate-600 dark:text-slate-300 hover:border-stone-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>{justShuffledSession ? "Gemischt" : "Mischen"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onEditCard(currentCard)}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={() => {
                onSetActiveSession(false);
                setQueue([]);
              }}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap"
            >
              Beenden
            </button>
          </div>
        </div>

        <div className="w-full h-1 bg-stone-200 dark:bg-slate-800 rounded-full overflow-hidden mb-7">
          <div
            className="h-full bg-sky-700 dark:bg-sky-500 transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* MODE 1: TRUE 3D FLIPPING FLASHCARD */}
        {studyMode === "flashcard" && (
          <>
            <div
              ref={flashcardRef}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                const target = e.target as HTMLElement | null;
                if (target?.closest("button, input, textarea, select, a")) {
                  return;
                }
                pointerStartRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  active: false,
                };
              }}
              onPointerMove={(e) => {
                const start = pointerStartRef.current;
                if (!start) return;
                const dx = e.clientX - start.x;
                const dy = e.clientY - start.y;

                if (!start.active) {
                  if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx)) {
                    pointerStartRef.current = null;
                    return;
                  }
                  if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.15) {
                    start.active = true;
                    setIsDraggingCard(true);
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // Ignore synthetic capture errors
                    }
                  } else {
                    return;
                  }
                }

                const clamped = Math.max(-180, Math.min(180, dx));
                setSwipeOffset(clamped);
              }}
              onPointerUp={(e) => {
                const start = pointerStartRef.current;
                if (!start) return;
                const dx = e.clientX - start.x;
                const dy = e.clientY - start.y;
                const wasActiveDrag = start.active;

                pointerStartRef.current = null;
                setIsDraggingCard(false);
                setSwipeOffset(0);

                if (wasActiveDrag && Math.abs(dx) >= 75) {
                  if (dx > 0) {
                    handleFlashcardRate(4);
                  } else {
                    handleFlashcardRate(1);
                  }
                  return;
                }

                if (!wasActiveDrag && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                  if (!isFlipped) {
                    setIsFlipped(true);
                  } else if (flashcardRef.current) {
                    const rect = flashcardRef.current.getBoundingClientRect();
                    const clickedLeftHalf =
                      e.clientX - rect.left < rect.width / 2;
                    if (clickedLeftHalf) {
                      handleFlashcardRate(1);
                    } else {
                      handleFlashcardRate(4);
                    }
                  }
                }
              }}
              onPointerCancel={() => {
                pointerStartRef.current = null;
                setIsDraggingCard(false);
                setSwipeOffset(0);
              }}
              style={{
                transform:
                  swipeOffset !== 0
                    ? `translateX(${swipeOffset}px) rotate(${swipeOffset * 0.03}deg)`
                    : undefined,
                transition: isDraggingCard
                  ? "none"
                  : "transform 180ms ease-out",
              }}
              className="relative perspective-1400 touch-pan-y select-none cursor-pointer"
            >
              {/* Swipe Feedback Ribbon */}
              {Math.abs(swipeOffset) > 24 && (
                <div
                  className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border shadow-sm ${
                    swipeOffset > 0
                      ? "bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700"
                      : "bg-rose-50 dark:bg-rose-950/90 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700"
                  }`}
                >
                  {swipeOffset > 0 ? (
                    <>
                      <span>Gewusst</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Nochmal lernen</span>
                    </>
                  )}
                </div>
              )}

              {/* 3D Flipping Card Body */}
              <div
                style={{
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
                className="grid w-full preserve-3d card-flip-transition"
              >
                {/* FRONT FACE */}
                <div
                  aria-hidden={isFlipped}
                  className={`col-start-1 row-start-1 backface-hidden min-h-[340px] sm:min-h-[380px] flex flex-col justify-between bg-white dark:bg-[#161B22] border rounded-2xl study-card-shadow overflow-hidden ${
                    swipeOffset > 28
                      ? "border-emerald-400 dark:border-emerald-500"
                      : swipeOffset < -28
                        ? "border-rose-400 dark:border-rose-500"
                        : "border-stone-200 dark:border-slate-800"
                  } ${isFlipped ? "pointer-events-none" : ""}`}
                >
                  {/* Card Top Rule */}
                  <div className="px-6 sm:px-8 py-3.5 border-b border-stone-100 dark:border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        Vorderseite
                      </span>
                      {currentCard.topic && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{currentCard.topic}</span>
                        </>
                      )}
                      {currentCard.partOfSpeech && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{currentCard.partOfSpeech}</span>
                        </>
                      )}
                      {currentCard.lastWrong && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-rose-700 dark:text-rose-400 font-medium">
                            Zuletzt falsch
                          </span>
                        </>
                      )}
                      {currentCard.srs.repetitions > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            {currentCard.srs.repetitions}× gewusst
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsFlipped(true);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Umdrehen</span>
                    </button>
                  </div>

                  {/* Card Front Center */}
                  <div className="px-6 sm:px-10 py-10 flex-1 flex flex-col items-center justify-center text-center">
                    <div className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                      {currentSubjectCtx.def.termLabel}
                    </div>
                    <h2
                      dir="auto"
                      className="font-display text-2xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight text-balance leading-snug whitespace-pre-line"
                    >
                      <FormattedText text={currentCard.term} />
                    </h2>
                    {currentCard.phonetic && (
                      <div
                        dir="auto"
                        className="mt-3 font-mono-tabular text-sm text-slate-500 dark:text-slate-400"
                      >
                        <FormattedText text={currentCard.phonetic} />
                      </div>
                    )}
                  </div>

                  {/* Card Front Footer */}
                  <div className="px-6 sm:px-8 py-3.5 bg-[#FAF9F6] dark:bg-[#1C222B] border-t border-stone-100 dark:border-slate-800 flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Karte antippen oder Leertaste zum Umdrehen
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsFlipped(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Karte umdrehen</span>
                    </button>
                  </div>
                </div>

                {/* BACK FACE */}
                <div
                  aria-hidden={!isFlipped}
                  className={`col-start-1 row-start-1 backface-hidden rotate-y-180 min-h-[340px] sm:min-h-[380px] flex flex-col justify-between bg-[#FAF9F6] dark:bg-[#1C222B] border rounded-2xl study-card-shadow overflow-hidden ${
                    swipeOffset > 28
                      ? "border-emerald-400 dark:border-emerald-500"
                      : swipeOffset < -28
                        ? "border-rose-400 dark:border-rose-500"
                        : "border-stone-200 dark:border-slate-800"
                  } ${!isFlipped ? "pointer-events-none" : ""}`}
                >
                  {/* Back Top Rule */}
                  <div className="px-6 sm:px-8 py-3.5 border-b border-stone-200/80 dark:border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-[#161B22]/80">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sky-800 dark:text-sky-400 shrink-0">
                        Rückseite
                      </span>
                      <span aria-hidden="true">·</span>
                      <span dir="auto" className="truncate text-slate-600 dark:text-slate-300">
                        <FormattedText text={currentCard.term} />
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsFlipped(false);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Zur Vorderseite</span>
                    </button>
                  </div>

                  {/* Back Answer Content */}
                  <div className="px-6 sm:px-10 py-8 flex-1 flex flex-col justify-center">
                    <div className="text-center">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        {currentSubjectCtx.def.answerLabel}
                      </div>
                      <div
                        dir="auto"
                        className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight text-balance leading-snug whitespace-pre-line"
                      >
                        <FormattedText text={currentCard.translation} />
                      </div>
                    </div>

                    {(currentCard.exampleSentence || currentCard.note) && (
                      <div className="mt-6 pt-5 border-t border-stone-200/80 dark:border-slate-800 space-y-3 text-left">
                        {currentCard.exampleSentence && (
                          <div>
                            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                              {currentSubjectCtx.def.contextLabel}
                            </div>
                            <p
                              dir="auto"
                              className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line"
                            >
                              <FormattedText text={currentCard.exampleSentence} />
                            </p>
                          </div>
                        )}

                        {currentCard.note && (
                          <div>
                            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                              Merkhilfe
                            </div>
                            <p
                              dir="auto"
                              className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line"
                            >
                              <FormattedText text={currentCard.note} />
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Back Tap Zones Hint */}
                  <div className="px-6 sm:px-8 py-3 border-t border-stone-200/80 dark:border-slate-800 bg-white/60 dark:bg-[#161B22]/80 grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                      <ArrowLeft className="w-3 h-3 shrink-0" />
                      <span>Links tippen: Nochmal lernen</span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 text-emerald-700 dark:text-emerald-400 text-right">
                      <span>Rechts tippen: Gewusst</span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Subtle Physical Deck Depth */}
              <div
                aria-hidden="true"
                className="mx-5 h-1.5 bg-white/90 dark:bg-[#161B22]/80 border-x border-b border-stone-200/80 dark:border-slate-800 rounded-b-xl"
              />
            </div>

            {/* Solid Red / Green Evaluation Buttons */}
            <div className="mt-5">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleFlashcardRate(1)}
                  className="flex items-center justify-center gap-2 px-5 py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                  <span className="text-sm sm:text-base font-semibold whitespace-nowrap">
                    Nochmal lernen
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFlashcardRate(4)}
                  className="flex items-center justify-center gap-2 px-5 py-4 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  <span className="text-sm sm:text-base font-semibold whitespace-nowrap">
                    Gewusst
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
              <div className="mt-2.5 text-center text-xs text-slate-500 dark:text-slate-400">
                Steuerung: Karte antippen zum Umdrehen · Rot/Grün, Wischen oder Pfeiltasten ← / →
              </div>
            </div>
          </>
        )}

        {/* MODE 2: MULTIPLE-CHOICE */}
        {studyMode === "multiple-choice" && (
          <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl study-card-shadow overflow-hidden">
            <div className="p-6 sm:p-10">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-stone-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>Multiple-Choice</span>
                  {currentCard.lastWrong && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-rose-700 dark:text-rose-400 font-medium">
                        Zuletzt falsch
                      </span>
                    </>
                  )}
                  {currentCard.partOfSpeech && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{currentCard.partOfSpeech}</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setMcDirection((prev) =>
                      prev === "term-to-trans" ? "trans-to-term" : "term-to-trans"
                    )
                  }
                  className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap"
                >
                  Richtung:{" "}
                  {mcDirection === "term-to-trans"
                    ? dirLabelForward
                    : dirLabelReverse}
                </button>
              </div>

              {mcOptions.length < 2 ? (
                <div className="py-8 text-center space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Für Multiple-Choice werden mindestens 2 unterschiedliche
                    Karten im gleichen Themenbereich benötigt.
                  </p>
                  <button
                    type="button"
                    onClick={() => onSetStudyMode("flashcard")}
                    className="px-4 py-2 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Auf Lernkarten-Modus wechseln
                  </button>
                </div>
              ) : (
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    {mcDirection === "term-to-trans"
                      ? currentSubjectCtx.def.mcPromptForward
                      : currentSubjectCtx.def.mcPromptReverse}
                  </div>
                  <h2
                    dir="auto"
                    className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-6 text-balance whitespace-pre-line"
                  >
                    <FormattedText
                      text={
                        mcDirection === "term-to-trans"
                          ? currentCard.term
                          : currentCard.translation
                      }
                    />
                  </h2>

                  <div className="grid grid-cols-1 gap-3">
                    {mcOptions.map((option, idx) => {
                      const expected =
                        mcDirection === "term-to-trans"
                          ? currentCard.translation
                          : currentCard.term;
                      const isChosen = selectedMcOption === option;
                      const isRightAnswer = option === expected;

                      let btnStyle =
                        "bg-white dark:bg-[#1C222B] border-stone-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-stone-400 dark:hover:border-slate-500 hover:bg-stone-50 dark:hover:bg-slate-800";
                      if (selectedMcOption !== null) {
                        if (isRightAnswer) {
                          btnStyle =
                            "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-950 dark:text-emerald-100";
                        } else if (isChosen && !isRightAnswer) {
                          btnStyle =
                            "bg-rose-50 dark:bg-rose-950/50 border-rose-400 dark:border-rose-500 text-rose-950 dark:text-rose-100";
                        } else {
                          btnStyle =
                            "bg-stone-50 dark:bg-[#11151C] border-stone-200 dark:border-slate-800 text-slate-400 dark:text-slate-500";
                        }
                      }

                      return (
                        <button
                          key={`${currentCard.id}-${idx}`}
                          type="button"
                          disabled={selectedMcOption !== null}
                          onClick={() => handleSelectMc(option)}
                          className={`w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left border rounded-xl transition-colors cursor-pointer disabled:cursor-default ${btnStyle}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400 w-5 shrink-0">
                              {idx + 1}.
                            </span>
                            <span
                              dir="auto"
                              className="text-sm sm:text-base font-medium"
                            >
                              <FormattedText text={option} />
                            </span>
                          </div>
                          {selectedMcOption !== null && isRightAnswer && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                              <CheckCircle2 className="w-4 h-4" />
                              Richtig
                            </span>
                          )}
                          {selectedMcOption !== null && isChosen && !isRightAnswer && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400 shrink-0">
                              <AlertCircle className="w-4 h-4" />
                              Falsch
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedMcOption !== null && (
                <div className="mt-6 pt-6 border-t border-stone-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div dir="auto" className="text-sm text-slate-700 dark:text-slate-300">
                    {currentCard.exampleSentence ? (
                      <p>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {currentSubjectCtx.def.contextLabel}:{" "}
                        </span>
                        <FormattedText text={currentCard.exampleSentence} />
                      </p>
                    ) : (
                      <p>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          <FormattedText text={currentCard.term} />
                        </span>{" "}
                        — <FormattedText text={currentCard.translation} />
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const expected =
                        mcDirection === "term-to-trans"
                          ? currentCard.translation
                          : currentCard.term;
                      advanceToNext(selectedMcOption !== expected);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Weiter</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  // --- DEFAULT WORKSPACE LAUNCHER ---
  const launchCount =
    activeFilter === "wrong-only" ? wrongInScope.length : scopedCards.length;

  const canLaunch = scopedCards.length > 0 && launchCount > 0;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10">
      <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-6 sm:p-9 study-card-shadow">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
          <div className="max-w-2xl">
            <h1 className="font-display text-3xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100 tracking-tight text-balance">
              LernWerk
            </h1>
            <p className="mt-3 text-slate-600 dark:text-slate-400 text-sm sm:text-base leading-relaxed max-w-xl">
              Lernkarten und Multiple-Choice für Sprachen, Fachwissen, Formeln,
              Definitionen und Prüfungsvorbereitung — komplett offline in
              eigenen Paketen.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-x-8 gap-y-5 pt-4 lg:pt-0 lg:pl-8 border-t lg:border-t-0 lg:border-l border-stone-200 dark:border-slate-800 shrink-0">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Offen</div>
              <div className="mt-0.5 text-2xl font-display font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                {openCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Zuletzt falsch</div>
              <div className="mt-0.5 text-2xl font-display font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                {totalWrongCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Gelernt</div>
              <div className="mt-0.5 text-2xl font-display font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {learnedCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Karten gesamt</div>
              <div className="mt-0.5 text-2xl font-display font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {cards.length}
              </div>
            </div>
          </div>
        </div>

        {cards.length === 0 ? (
          <div className="mt-8 pt-6 border-t border-stone-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              Noch keine Lernpakete vorhanden. Erstellen Sie ein Themen-Notebook
              mit eigenen Quellen, importieren Sie eine Liste oder legen Sie
              direkt eigene Karten an.
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateTab("notebooks")}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4" />
                <span>Themen-Notebook erstellen</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab("import")}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-[#1C222B] border border-stone-300 dark:border-slate-700 hover:bg-stone-50 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>CSV / Word / PDF importieren</span>
              </button>
              <button
                type="button"
                onClick={() => onCreateCard(packages[0]?.id ?? 0)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-[#1C222B] border border-stone-300 dark:border-slate-700 hover:bg-stone-50 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Erste Karte anlegen</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-8 pt-6 border-t border-stone-200/80 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-5 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Lernmodus
                </label>
                <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-stone-100 dark:bg-[#11151C] rounded-xl w-full sm:w-auto">
                  {(
                    [
                      { id: "flashcard", label: "Lernkarten" },
                      { id: "multiple-choice", label: "Multiple-Choice" },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onSetStudyMode(mode.id)}
                      className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        studyMode === mode.id
                          ? "bg-white dark:bg-[#1C222B] text-slate-900 dark:text-slate-100 shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="study-package-select"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2"
                >
                  Gruppe oder Paket wählen
                </label>
                <select
                  id="study-package-select"
                  value={
                    selectedPackageId === "all"
                      ? "all"
                      : String(selectedPackageId)
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "all" || val.startsWith("group:")) {
                      onSelectPackageId(val as StudyScope);
                    } else {
                      onSelectPackageId(Number(val));
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                >
                  <option value="all">Alle Pakete ({cards.length} Karten)</option>
                  {activeGroups.map((grp) => {
                    if (grp.entries.length === 1) {
                      const entry = grp.entries[0];
                      return (
                        <option key={entry.pkg.id} value={entry.pkg.id}>
                          {entry.pkg.title}
                          {entry.domainLabel ? ` · ${entry.domainLabel}` : ""} (
                          {entry.learned}/{entry.total} gelernt
                          {entry.wrong > 0 ? `, ${entry.wrong} falsch` : ""})
                        </option>
                      );
                    }
                    return (
                      <optgroup key={grp.groupId} label={grp.groupName}>
                        {grp.isRealGroup && (
                          <option value={`group:${grp.groupId}`}>
                            Ganze Gruppe „{grp.groupName}“ ({grp.totalCards}{" "}
                            Karten)
                          </option>
                        )}
                        {grp.entries.map((entry) => (
                          <option key={entry.pkg.id} value={entry.pkg.id}>
                            {entry.pkg.title}
                            {entry.domainLabel ? ` · ${entry.domainLabel}` : ""} (
                            {entry.learned}/{entry.total} gelernt
                            {entry.wrong > 0 ? `, ${entry.wrong} falsch` : ""})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!canLaunch}
                  onClick={() => startSession()}
                  className="w-full lg:w-auto px-6 py-2.5 text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 disabled:bg-stone-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {activeFilter === "wrong-only"
                    ? wrongInScope.length > 0
                      ? `Falsche üben (${wrongInScope.length})`
                      : "Keine falschen Karten"
                    : scopedCards.length > 0
                      ? `Session starten (${scopedCards.length})`
                      : "Paket ist leer"}
                </button>
              </div>
            </div>

            {/* Word Selection Filter + Shuffle Option */}
            <div className="mt-5 pt-4 border-t border-stone-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Auswahl:
                </span>
                <div className="inline-flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#11151C] rounded-xl">
                  <button
                    type="button"
                    onClick={() => setScopeFilter("all")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      activeFilter === "all"
                        ? "bg-white dark:bg-[#1C222B] text-slate-900 dark:text-slate-100 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Alle Karten
                  </button>
                  <button
                    type="button"
                    onClick={() => setScopeFilter("wrong-only")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      activeFilter === "wrong-only"
                        ? "bg-white dark:bg-[#1C222B] text-rose-700 dark:text-rose-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Nur zuletzt falsche ({wrongInScope.length})
                  </button>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={
                    selectedPkgObj
                      ? Boolean(selectedPkgObj.shuffleOrder) ||
                        settings.shuffleWithinPackages
                      : settings.shuffleWithinPackages
                  }
                  onChange={(e) => {
                    const next = e.target.checked;
                    if (selectedPkgObj) {
                      onUpdatePackage(selectedPkgObj.id, {
                        shuffleOrder: next,
                      });
                      if (next) {
                        onShufflePackage(selectedPkgObj.id);
                      } else if (settings.shuffleWithinPackages) {
                        onUpdateSettings({ shuffleWithinPackages: false });
                      }
                    } else {
                      onUpdateSettings({ shuffleWithinPackages: next });
                    }
                  }}
                  className="rounded border-stone-300 dark:border-slate-700 dark:bg-[#11151C] text-sky-700 focus:ring-sky-700"
                />
                <span>Jedes Paket unter sich mischen</span>
              </label>
            </div>
          </>
        )}
      </div>

      {/* Active Packages List */}
      <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 study-card-shadow">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Pakete im Lernplan
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Jede importierte Liste bildet eine eigene Gruppe für ein Fachgebiet oder Sprachpaar
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigateTab("notebooks")}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              Notebooks
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab("import")}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              Inhalte importieren
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab("packages")}
              className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 cursor-pointer whitespace-nowrap shrink-0"
            >
              Alle Pakete öffnen
            </button>
          </div>
        </div>

        {activeGroups.length === 0 ? (
          <div className="py-10 text-center">
            <Layers className="w-8 h-8 text-stone-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Noch keine Pakete vorhanden. Importieren Sie eine Liste oder
              legen Sie neue Karten an.
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab("import")}
              className="mt-4 px-4 py-2 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 rounded-lg cursor-pointer"
            >
              Inhalte importieren
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-200 dark:divide-slate-800">
            {activeGroups.map((grp) => (
              <div key={grp.groupId} className="py-5 first:pt-0 last:pb-0 space-y-3">
                {grp.isRealGroup && grp.entries.length > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Gruppe: {grp.groupName}{" "}
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        · {grp.entries.length} Pakete · {grp.totalCards} Karten
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => startSession(`group:${grp.groupId}`)}
                      className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 cursor-pointer whitespace-nowrap"
                    >
                      Ganze Gruppe lernen
                    </button>
                  </div>
                )}

                <div className="divide-y divide-stone-100 dark:divide-slate-800/80">
                  {grp.entries.map(({ pkg, total, learned, wrong, domainLabel }) => {
                    const learnedPct =
                      total > 0 ? Math.round((learned / total) * 100) : 0;
                    return (
                      <div
                        key={pkg.id}
                        className="py-3.5 flex flex-wrap items-center justify-between gap-4"
                      >
                        <div className="min-w-0 flex-1 max-w-md">
                          <div className="flex items-center gap-2">
                            <span className="font-mono-tabular text-xs text-slate-400 dark:text-slate-500">
                              {String(pkg.number).padStart(2, "0")}
                            </span>
                            <span className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                              {pkg.title}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                            {domainLabel && (
                              <>
                                <span>{domainLabel}</span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <span className="tabular-nums">{total} Karten</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`tabular-nums font-medium ${
                                learnedPct === 100
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-slate-600 dark:text-slate-300"
                              }`}
                            >
                              {learned}/{total} gelernt ({learnedPct}%)
                            </span>
                            {wrong > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums text-rose-700 dark:text-rose-400 font-medium">
                                  {wrong} falsch
                                </span>
                              </>
                            )}
                          </div>
                          <div
                            role="progressbar"
                            aria-valuenow={learnedPct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Lernfortschritt ${pkg.title}: ${learned} von ${total} Karten gelernt`}
                            className="mt-2 w-full h-1 bg-stone-100 dark:bg-slate-800 rounded-full overflow-hidden"
                          >
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                learnedPct === 100
                                  ? "bg-emerald-500"
                                  : "bg-sky-600/85 dark:bg-sky-500"
                              }`}
                              style={{ width: `${learnedPct}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {total > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                onShufflePackage(pkg.id);
                                setJustShuffledPkgId(pkg.id);
                                window.setTimeout(() => {
                                  setJustShuffledPkgId((curr) =>
                                    curr === pkg.id ? null : curr
                                  );
                                }, 1800);
                              }}
                              title="Karten innerhalb dieses Pakets mischen"
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                                justShuffledPkgId === pkg.id
                                  ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300"
                                  : pkg.shuffleOrder
                                    ? "border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400 hover:bg-sky-50/50 dark:hover:bg-sky-950/40"
                                    : "border-stone-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-stone-400 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-white"
                              }`}
                            >
                              <Shuffle className="w-3 h-3" />
                              <span>
                                {justShuffledPkgId === pkg.id
                                  ? "Gemischt"
                                  : "Mischen"}
                              </span>
                            </button>
                          )}
                          {wrong > 0 && (
                            <button
                              type="button"
                              onClick={() => startSession(pkg.id, "wrong-only")}
                              className="px-3 py-1.5 text-xs font-medium border border-rose-200 dark:border-rose-800/80 hover:border-rose-400 dark:hover:border-rose-600 text-rose-700 dark:text-rose-400 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Nur falsche ({wrong})
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={
                              pkg.nextSessionFilter === "wrong-only" &&
                              wrong === 0
                            }
                            onClick={() => startSession(pkg.id)}
                            className="px-3.5 py-1.5 text-xs font-medium border border-stone-200 dark:border-slate-700 hover:border-stone-400 dark:hover:border-slate-500 text-slate-800 dark:text-slate-200 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:border-stone-100 dark:disabled:border-slate-800 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {pkg.nextSessionFilter === "wrong-only"
                              ? wrong > 0
                                ? `Falsche (${wrong})`
                                : "Keine falschen"
                              : "Lernen"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
