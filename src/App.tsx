import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  AppSettings,
  ImportedVocabDraft,
  LearningSubject,
  NotebookSource,
  ReviewQuality,
  StudyMode,
  StudyScope,
  TopicNotebook,
  VocabCard,
  VocabPackage,
} from "./types/vocab";
import { getEffectivePackageLanguages } from "./data/languages";
import { createInitialSrs, scheduleCard, shuffleArray } from "./utils/srs";
import {
  createMissingReverseCards,
  planExistingPackageOppositeSeparation,
} from "./utils/topicOrganizer";
import {
  createEmptyWorkspace,
  DEFAULT_SETTINGS,
  loadWorkspace,
  PersistedWorkspace,
  saveWorkspace,
} from "./utils/storage";
import { AppTab, TopNav } from "./components/TopNav";
import { StudyWorkspace } from "./components/StudyWorkspace";
import { NotebookWorkspace } from "./components/NotebookWorkspace";
import { PackagesGrid } from "./components/PackagesGrid";
import { CardLibrary } from "./components/CardLibrary";
import { ImportPackageUpdate, ImportStudio } from "./components/ImportStudio";
import { CardEditorModal } from "./components/CardEditorModal";
import { getPackageSubjectContext } from "./data/subjects";

function syncPackageLanguages(
  packages: VocabPackage[],
  cards: VocabCard[]
): VocabPackage[] {
  const byPkg = new Map<number, VocabCard[]>();
  for (const c of cards) {
    const list = byPkg.get(c.packageId) || [];
    list.push(c);
    byPkg.set(c.packageId, list);
  }
  return packages.map((p) => {
    const pkgCards = byPkg.get(p.id) || [];
    if (pkgCards.length === 0) {
      if (!p.sourceLang && !p.targetLang) return p;
      return { ...p, sourceLang: "", targetLang: "" };
    }
    const effective = getEffectivePackageLanguages(p, pkgCards);
    const hasReverse =
      Boolean(p.bidirectional) ||
      pkgCards.some((c) => c.cardDirection === "reverse");
    const subjectCtx = getPackageSubjectContext(
      {
        ...p,
        sourceLang: effective.sourceLang,
        targetLang: effective.targetLang,
        bidirectional: hasReverse,
      },
      pkgCards
    );
    if (
      p.sourceLang === effective.sourceLang &&
      p.targetLang === effective.targetLang &&
      p.subject === subjectCtx.subject &&
      p.subjectLabel === subjectCtx.displayLabel &&
      Boolean(p.bidirectional) === hasReverse
    ) {
      return p;
    }
    return {
      ...p,
      bidirectional: hasReverse,
      sourceLang: effective.sourceLang,
      targetLang: effective.targetLang,
      subject:
        p.subject && p.subject !== "auto" ? p.subject : subjectCtx.subject,
      subjectLabel: p.subjectLabel || subjectCtx.displayLabel,
    };
  });
}

export default function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [packages, setPackages] = useState<VocabPackage[]>([]);
  const [cards, setCards] = useState<VocabCard[]>([]);
  const [notebooks, setNotebooks] = useState<TopicNotebook[]>([]);
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [activeTab, setActiveTab] = useState<AppTab>("study");
  const [selectedStudyPackage, setSelectedStudyPackage] =
    useState<StudyScope>("all");
  const [activeSession, setActiveSession] = useState(false);
  const [sessionLaunchTrigger, setSessionLaunchTrigger] = useState(0);
  const [studyMode, setStudyMode] = useState<StudyMode>("flashcard");

  const [libraryFilterPackage, setLibraryFilterPackage] = useState<
    number | "all"
  >("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<VocabCard | null>(null);
  const [editorDefaultPkg, setEditorDefaultPkg] = useState<number>(0);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem("vokabelwerk-theme") === "dark"
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("vokabelwerk-theme", theme);
    } catch {
      // Ignore storage errors
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", isDark ? "#0E1116" : "#F5F6F4");
    }
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    loadWorkspace().then((ws) => {
      if (!mounted) return;
      setPackages(ws.packages);
      setCards(ws.cards);
      setNotebooks(ws.notebooks || []);
      setSources(ws.sources || []);
      setSettings(ws.settings);
      setIsLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveWorkspace({
      packages,
      cards,
      logs: [],
      notebooks,
      sources,
      settings,
    }).catch(() => {});
  }, [cards, isLoaded, notebooks, packages, settings, sources]);

  const handleReviewCard = useCallback(
    (cardId: string, quality: ReviewQuality, correct: boolean) => {
      const now = Date.now();
      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== cardId) return c;
          return {
            ...c,
            lastWrong: !correct,
            srs: scheduleCard(c.srs, quality, now),
            updatedAt: now,
          };
        })
      );
    },
    []
  );

  const handleSaveCard = useCallback(
    (draft: {
      id?: string;
      packageId: number;
      term: string;
      translation: string;
      phonetic?: string;
      partOfSpeech?: string;
      exampleSentence?: string;
      note?: string;
      createBothDirections?: boolean;
    }) => {
      const now = Date.now();
      let resolvedPackageId = draft.packageId;
      let nextPackages = packages;

      if (
        resolvedPackageId <= 0 ||
        !packages.some((p) => p.id === resolvedPackageId)
      ) {
        const nextId = packages.reduce((m, p) => Math.max(m, p.id), 0) + 1;
        const nextNumber =
          packages.reduce((m, p) => Math.max(m, p.number), 0) + 1;
        resolvedPackageId = nextId;
        const pkgTitle = `Eigene Karten ${nextNumber}`;
        nextPackages = [
          ...packages,
          {
            id: nextId,
            number: nextNumber,
            title: pkgTitle,
            groupId: `grp-manual-${now}`,
            groupName: pkgTitle,
            sourceLang: "",
            targetLang: "",
            description: "",
            nextSessionFilter: "all",
          },
        ];
      }

      let nextCards: VocabCard[];
      if (draft.id) {
        nextCards = cards.map((c) =>
          c.id === draft.id
            ? {
                ...c,
                packageId: resolvedPackageId,
                term: draft.term,
                translation: draft.translation,
                phonetic: draft.phonetic,
                partOfSpeech: draft.partOfSpeech,
                exampleSentence: draft.exampleSentence,
                note: draft.note,
                updatedAt: now,
              }
            : c
        );
      } else {
        const pairId = `pair-${now}-${Math.random().toString(36).slice(2, 6)}`;
        const forwardCard: VocabCard = {
          id: `card-${now}-${Math.random().toString(36).slice(2, 7)}`,
          packageId: resolvedPackageId,
          term: draft.term,
          translation: draft.translation,
          phonetic: draft.phonetic,
          partOfSpeech: draft.partOfSpeech,
          exampleSentence: draft.exampleSentence,
          note: draft.note,
          pairId,
          cardDirection: "forward",
          lastWrong: false,
          srs: createInitialSrs(now),
          createdAt: now,
          updatedAt: now,
        };
        const additions: VocabCard[] = [forwardCard];
        if (
          draft.createBothDirections &&
          draft.term.trim().toLowerCase() !== draft.translation.trim().toLowerCase()
        ) {
          additions.push({
            id: `card-${now}-rev-${Math.random().toString(36).slice(2, 7)}`,
            packageId: resolvedPackageId,
            term: draft.translation,
            translation: draft.term,
            partOfSpeech: draft.partOfSpeech,
            exampleSentence: draft.exampleSentence,
            note: draft.note,
            pairId,
            cardDirection: "reverse",
            lastWrong: false,
            srs: createInitialSrs(now),
            createdAt: now,
            updatedAt: now,
          });
        }
        nextCards = [...additions, ...cards];
      }
      setCards(nextCards);
      setPackages(syncPackageLanguages(nextPackages, nextCards));
    },
    [cards, packages]
  );

  const handleDeleteCard = useCallback(
    (cardId: string) => {
      const nextCards = cards.filter((c) => c.id !== cardId);
      setCards(nextCards);
      setPackages((prev) => syncPackageLanguages(prev, nextCards));
    },
    [cards]
  );

  const handleDeletePackage = useCallback(
    (packageId: number) => {
      const nextCards = cards.filter((c) => c.packageId !== packageId);
      setCards(nextCards);
      setPackages((prev) => prev.filter((p) => p.id !== packageId));
      if (selectedStudyPackage === packageId) {
        setSelectedStudyPackage("all");
        setActiveSession(false);
      }
      if (libraryFilterPackage === packageId) {
        setLibraryFilterPackage("all");
      }
    },
    [cards, libraryFilterPackage, selectedStudyPackage]
  );

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      const groupPkgIds = new Set(
        packages.filter((p) => p.groupId === groupId).map((p) => p.id)
      );
      const nextCards = cards.filter((c) => !groupPkgIds.has(c.packageId));
      setCards(nextCards);
      setPackages((prev) => prev.filter((p) => p.groupId !== groupId));
      if (
        selectedStudyPackage === `group:${groupId}` ||
        (typeof selectedStudyPackage === "number" &&
          groupPkgIds.has(selectedStudyPackage))
      ) {
        setSelectedStudyPackage("all");
        setActiveSession(false);
      }
      if (
        typeof libraryFilterPackage === "number" &&
        groupPkgIds.has(libraryFilterPackage)
      ) {
        setLibraryFilterPackage("all");
      }
    },
    [cards, libraryFilterPackage, packages, selectedStudyPackage]
  );

  const handleRenameGroup = useCallback((groupId: string, nextName: string) => {
    const clean = nextName.trim();
    if (!clean) return;
    setPackages((prev) => {
      const groupPkgs = prev.filter((p) => p.groupId === groupId);
      const isSingle = groupPkgs.length === 1;
      return prev.map((p) => {
        if (p.groupId !== groupId) return p;
        const oldGroupName = p.groupName || "";
        let nextTitle = p.title;
        if (isSingle && p.title === oldGroupName) {
          nextTitle = clean;
        } else if (oldGroupName && p.title.startsWith(oldGroupName)) {
          nextTitle = `${clean}${p.title.slice(oldGroupName.length)}`;
        }
        return {
          ...p,
          groupName: clean,
          title: nextTitle,
        };
      });
    });
  }, []);

  const handleImportCards = useCallback(
    (
      items: ImportedVocabDraft[],
      packageUpdates: ImportPackageUpdate[]
    ) => {
      const now = Date.now();
      const newCards: VocabCard[] = items.map((item, idx) => ({
        id: `imp-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        packageId: item.packageId,
        term: item.term.trim(),
        translation: item.translation.trim(),
        partOfSpeech: item.partOfSpeech?.trim() || undefined,
        phonetic: item.phonetic?.trim() || undefined,
        exampleSentence: item.exampleSentence?.trim() || undefined,
        note: item.note?.trim() || undefined,
        topic: item.topic?.trim() || undefined,
        pairId: item.pairId,
        cardDirection: item.cardDirection,
        sourceId: item.sourceId,
        notebookId: item.notebookId,
        lastWrong: false,
        srs: createInitialSrs(now),
        createdAt: now,
        updatedAt: now,
      }));

      const combinedCards = [...newCards, ...cards];
      setCards(combinedCards);

      setPackages((prev) => {
        const updateMap = new Map(packageUpdates.map((u) => [u.id, u]));
        const existingIds = new Set(prev.map((p) => p.id));
        const updatedExisting = prev.map((p) => {
          const upd = updateMap.get(p.id);
          if (!upd) return p;
          return {
            ...p,
            title: upd.title !== undefined ? upd.title : p.title,
            groupId: upd.groupId !== undefined ? upd.groupId : p.groupId,
            groupName:
              upd.groupName !== undefined ? upd.groupName : p.groupName,
            notebookId:
              upd.notebookId !== undefined ? upd.notebookId : p.notebookId,
            sourceIds:
              upd.sourceIds !== undefined ? upd.sourceIds : p.sourceIds,
            sourceTitles:
              upd.sourceTitles !== undefined ? upd.sourceTitles : p.sourceTitles,
            bidirectional:
              upd.bidirectional !== undefined
                ? upd.bidirectional
                : p.bidirectional,
            subject: upd.subject !== undefined ? upd.subject : p.subject,
            subjectLabel:
              upd.subjectLabel !== undefined ? upd.subjectLabel : p.subjectLabel,
            description:
              upd.description !== undefined ? upd.description : p.description,
            sourceLang:
              upd.sourceLang !== undefined ? upd.sourceLang : p.sourceLang,
            targetLang:
              upd.targetLang !== undefined ? upd.targetLang : p.targetLang,
          };
        });

        const newPackages: VocabPackage[] = packageUpdates
          .filter((u) => !existingIds.has(u.id))
          .map((u) => ({
            id: u.id,
            number: u.number,
            title: u.title || `Paket ${String(u.number).padStart(2, "0")}`,
            groupId: u.groupId,
            groupName: u.groupName,
            notebookId: u.notebookId,
            sourceIds: u.sourceIds,
            sourceTitles: u.sourceTitles,
            bidirectional: u.bidirectional,
            subject: u.subject,
            subjectLabel: u.subjectLabel,
            sourceLang: u.sourceLang || "",
            targetLang: u.targetLang || "",
            description: u.description || "",
            nextSessionFilter: "all",
          }));

        const nextPackages = [...updatedExisting, ...newPackages].sort(
          (a, b) => a.number - b.number
        );
        return syncPackageLanguages(nextPackages, combinedCards);
      });
    },
    [cards]
  );

  const handleUpdatePackage = useCallback(
    (packageId: number, updates: Partial<VocabPackage>) => {
      setPackages((prev) =>
        prev.map((p) => (p.id === packageId ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const handleShufflePackage = useCallback((packageId: number) => {
    setCards((prev) => {
      const indices: number[] = [];
      const pkgCards: VocabCard[] = [];
      prev.forEach((c, idx) => {
        if (c.packageId === packageId) {
          indices.push(idx);
          pkgCards.push(c);
        }
      });
      if (pkgCards.length < 2) return prev;
      let shuffled = shuffleArray(pkgCards);
      if (shuffled.every((c, i) => c.id === pkgCards[i].id)) {
        shuffled = [...shuffled.slice(1), shuffled[0]];
      }
      const next = [...prev];
      indices.forEach((origIdx, i) => {
        next[origIdx] = shuffled[i];
      });
      return next;
    });
    setPackages((prev) =>
      prev.map((p) =>
        p.id === packageId ? { ...p, shuffleOrder: true } : p
      )
    );
  }, []);

  const handleCompleteBidirectionalPackage = useCallback(
    (packageId: number) => {
      const pkgCards = cards.filter((c) => c.packageId === packageId);
      const additions = createMissingReverseCards(pkgCards);
      if (additions.length === 0) return;

      const updatedOriginals = cards.map((c) =>
        c.packageId === packageId && !c.cardDirection
          ? {
              ...c,
              pairId: c.pairId || `pair-${c.id}`,
              cardDirection: "forward" as const,
            }
          : c
      );
      const nextCards = [...updatedOriginals, ...additions];
      setCards(nextCards);
      setPackages((prev) =>
        syncPackageLanguages(
          prev.map((p) =>
            p.id === packageId
              ? {
                  ...p,
                  bidirectional: true,
                }
              : p
          ),
          nextCards
        )
      );
    },
    [cards]
  );

  const handleSeparatePackageOpposites = useCallback(
    (packageId: number) => {
      const plan = planExistingPackageOppositeSeparation(
        packageId,
        packages,
        cards
      );
      if (plan.moves.size === 0) return;
      const now = Date.now();
      const nextCards = cards.map((c) => {
        const nextPkgId = plan.moves.get(c.id);
        return nextPkgId !== undefined
          ? { ...c, packageId: nextPkgId, updatedAt: now }
          : c;
      });
      setCards(nextCards);

      setPackages((prev) => {
        const updated = prev.map((p) => {
          const meta = plan.updatedTitles.get(p.id);
          return meta ? { ...p, ...meta } : p;
        });
        const merged = [...updated, ...plan.newPackages].sort(
          (a, b) => a.number - b.number
        );
        return syncPackageLanguages(merged, nextCards);
      });
    },
    [cards, packages]
  );

  // Notebook handlers
  const handleCreateNotebook = useCallback(
    (draft: {
      title: string;
      subject: LearningSubject;
      description: string;
    }): TopicNotebook => {
      const now = Date.now();
      const nb: TopicNotebook = {
        id: `nb-${now}-${Math.random().toString(36).slice(2, 6)}`,
        title: draft.title,
        subject: draft.subject,
        description: draft.description,
        createdAt: now,
        updatedAt: now,
      };
      setNotebooks((prev) => [nb, ...prev]);
      return nb;
    },
    []
  );

  const handleUpdateNotebook = useCallback(
    (notebookId: string, updates: Partial<TopicNotebook>) => {
      setNotebooks((prev) =>
        prev.map((nb) => (nb.id === notebookId ? { ...nb, ...updates } : nb))
      );
    },
    []
  );

  const handleDeleteNotebook = useCallback((notebookId: string) => {
    setNotebooks((prev) => prev.filter((nb) => nb.id !== notebookId));
    setSources((prev) => prev.filter((s) => s.notebookId !== notebookId));
    setPackages((prev) =>
      prev.map((p) =>
        p.notebookId === notebookId ? { ...p, notebookId: undefined } : p
      )
    );
  }, []);

  const handleAddSources = useCallback((newSources: NotebookSource[]) => {
    setSources((prev) => [...newSources, ...prev]);
  }, []);

  const handleDeleteSource = useCallback((sourceId: string) => {
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
  }, []);

  const launchPackageStudy = useCallback((pkgId: number) => {
    setSelectedStudyPackage(pkgId);
    setActiveTab("study");
    setActiveSession(true);
    setSessionLaunchTrigger((prev) => prev + 1);
  }, []);

  const launchGroupStudy = useCallback((groupId: string) => {
    setSelectedStudyPackage(`group:${groupId}`);
    setActiveTab("study");
    setActiveSession(true);
    setSessionLaunchTrigger((prev) => prev + 1);
  }, []);

  const handleExportJsonBackup = () => {
    const payload = JSON.stringify(
      { packages, cards, notebooks, sources, settings },
      null,
      2
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lernwerk-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreJsonBackup = async (file: File | undefined) => {
    if (!file) return;
    setBackupNotice(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<PersistedWorkspace>;
      if (!Array.isArray(parsed.packages)) {
        throw new Error("Ungültige Sicherungsdatei.");
      }
      const loadedCards: VocabCard[] = Array.isArray(parsed.cards)
        ? parsed.cards.map((c) => ({ ...c, lastWrong: Boolean(c.lastWrong) }))
        : [];
      const loadedPkgs = parsed.packages.map((p) => ({
        ...p,
        nextSessionFilter:
          p.nextSessionFilter === "wrong-only"
            ? ("wrong-only" as const)
            : ("all" as const),
        shuffleOrder: Boolean(p.shuffleOrder),
      }));
      setPackages(syncPackageLanguages(loadedPkgs, loadedCards));
      setCards(loadedCards);
      setNotebooks(Array.isArray(parsed.notebooks) ? parsed.notebooks : []);
      setSources(Array.isArray(parsed.sources) ? parsed.sources : []);
      setSettings({
        dailyGoal:
          typeof parsed.settings?.dailyGoal === "number"
            ? parsed.settings.dailyGoal
            : DEFAULT_SETTINGS.dailyGoal,
        shuffleWithinPackages: Boolean(parsed.settings?.shuffleWithinPackages),
      });
      setActiveSession(false);
      setBackupNotice("Sicherung erfolgreich wiederhergestellt.");
    } catch {
      setBackupNotice("Sicherungsdatei konnte nicht gelesen werden.");
    }
  };

  const handleClearAllData = () => {
    const empty = createEmptyWorkspace();
    setPackages(empty.packages);
    setCards(empty.cards);
    setNotebooks(empty.notebooks || []);
    setSources(empty.sources || []);
    setSettings(empty.settings);
    setActiveSession(false);
    setConfirmClearAll(false);
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#F5F6F4] dark:bg-[#0E1116] flex items-center justify-center">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Lernbereich wird geladen...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F6F4] dark:bg-[#0E1116] text-slate-900 dark:text-slate-100">
      <TopNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== "study") setActiveSession(false);
        }}
        totalCards={cards.length}
        inActiveSession={activeTab === "study" && activeSession}
        onPrimaryAction={() => {
          if (activeTab === "study" && activeSession) {
            setActiveSession(false);
          } else if (cards.length === 0) {
            setActiveTab("notebooks");
          } else {
            setActiveTab("study");
            setActiveSession(true);
            setSessionLaunchTrigger((prev) => prev + 1);
          }
        }}
      />

      <main className="flex-1">
        {activeTab === "study" && (
          <StudyWorkspace
            packages={packages}
            cards={cards}
            settings={settings}
            onUpdateSettings={(u) => setSettings((prev) => ({ ...prev, ...u }))}
            onUpdatePackage={handleUpdatePackage}
            onShufflePackage={handleShufflePackage}
            selectedPackageId={selectedStudyPackage}
            onSelectPackageId={setSelectedStudyPackage}
            activeSession={activeSession}
            onSetActiveSession={setActiveSession}
            sessionLaunchTrigger={sessionLaunchTrigger}
            studyMode={studyMode}
            onSetStudyMode={setStudyMode}
            onReviewCard={handleReviewCard}
            onNavigateTab={(tab) => {
              setActiveSession(false);
              setActiveTab(tab);
            }}
            onCreateCard={(defaultPkgId) => {
              setEditingCard(null);
              setEditorDefaultPkg(defaultPkgId);
              setEditorOpen(true);
            }}
            onEditCard={(card) => {
              setEditingCard(card);
              setEditorDefaultPkg(card.packageId);
              setEditorOpen(true);
            }}
          />
        )}

        {activeTab === "notebooks" && (
          <NotebookWorkspace
            notebooks={notebooks}
            sources={sources}
            packages={packages}
            cards={cards}
            onCreateNotebook={handleCreateNotebook}
            onUpdateNotebook={handleUpdateNotebook}
            onDeleteNotebook={handleDeleteNotebook}
            onAddSources={handleAddSources}
            onDeleteSource={handleDeleteSource}
            onImportCards={handleImportCards}
            onStudyPackage={launchPackageStudy}
            onOpenPackageCards={(pkgId) => {
              setLibraryFilterPackage(pkgId);
              setActiveTab("cards");
            }}
          />
        )}

        {activeTab === "packages" && (
          <PackagesGrid
            packages={packages}
            cards={cards}
            onStudyPackage={launchPackageStudy}
            onStudyGroup={launchGroupStudy}
            onOpenPackageCards={(pkgId) => {
              setLibraryFilterPackage(pkgId);
              setActiveTab("cards");
            }}
            onCreateCardInPackage={(pkgId) => {
              setEditingCard(null);
              setEditorDefaultPkg(pkgId);
              setEditorOpen(true);
            }}
            onNavigateImport={() => setActiveTab("import")}
            onUpdatePackage={handleUpdatePackage}
            onRenameGroup={handleRenameGroup}
            onDeletePackage={handleDeletePackage}
            onDeleteGroup={handleDeleteGroup}
            onShufflePackage={handleShufflePackage}
            onSeparatePackageOpposites={handleSeparatePackageOpposites}
            onCompleteBidirectionalPackage={handleCompleteBidirectionalPackage}
          />
        )}

        {activeTab === "cards" && (
          <CardLibrary
            packages={packages}
            cards={cards}
            settings={settings}
            filterPackageId={libraryFilterPackage}
            onChangeFilterPackage={setLibraryFilterPackage}
            onCreateCard={(defaultPkgId) => {
              setEditingCard(null);
              setEditorDefaultPkg(defaultPkgId);
              setEditorOpen(true);
            }}
            onEditCard={(card) => {
              setEditingCard(card);
              setEditorDefaultPkg(card.packageId);
              setEditorOpen(true);
            }}
            onDeleteCard={handleDeleteCard}
            onNavigateImport={() => setActiveTab("import")}
          />
        )}

        {activeTab === "import" && (
          <ImportStudio
            packages={packages}
            onImportCards={handleImportCards}
            onOpenPackageCards={(pkgId) => {
              setLibraryFilterPackage(pkgId);
              setActiveTab("cards");
            }}
            onStudyPackage={launchPackageStudy}
            onNavigatePackages={() => setActiveTab("packages")}
          />
        )}
      </main>

      <footer className="border-t border-stone-200 dark:border-slate-800 bg-white dark:bg-[#161B22] mt-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span>LernWerk · 100% Offline</span>
            {backupNotice && (
              <span className="text-slate-800 dark:text-slate-200 font-medium">
                {backupNotice}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-5">
            <button
              type="button"
              onClick={() =>
                setTheme((prev) => (prev === "dark" ? "light" : "dark"))
              }
              aria-pressed={theme === "dark"}
              aria-label="Darstellung zwischen Light Mode und Dark Mode umschalten"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-slate-700 bg-[#FAF9F6] dark:bg-[#1C222B] text-slate-700 dark:text-slate-200 hover:border-stone-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleExportJsonBackup}
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
            >
              Sicherung exportieren
            </button>
            <label className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer">
              <span>Sicherung laden</span>
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  handleRestoreJsonBackup(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
            {!confirmClearAll ? (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="hover:text-rose-700 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                Alle Daten leeren
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <span>Wirklich alles leeren?</span>
                <button
                  type="button"
                  onClick={handleClearAllData}
                  className="font-semibold underline cursor-pointer"
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="text-slate-600 dark:text-slate-400 underline cursor-pointer"
                >
                  Abbrechen
                </button>
              </span>
            )}
          </div>
        </div>
      </footer>

      <CardEditorModal
        isOpen={editorOpen}
        card={editingCard}
        defaultPackageId={editorDefaultPkg}
        packages={packages}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveCard}
      />
    </div>
  );
}
