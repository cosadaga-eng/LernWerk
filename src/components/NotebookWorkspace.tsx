import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookMarked,
  Check,
  CheckCircle2,
  Edit3,
  Eye,
  FileText,
  FolderPlus,
  Layers,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { detectPackageLanguageCombo } from "../data/languages";
import {
  detectLearningSubject,
  getPackageSubjectContext,
  getSubjectDefinition,
  SUBJECT_DEFINITIONS,
} from "../data/subjects";
import {
  ImportedVocabDraft,
  LearningSubject,
  NotebookSource,
  TopicNotebook,
  VocabCard,
  VocabPackage,
} from "../types/vocab";
import {
  parseNotebookRawNote,
  parseNotebookSourceFile,
} from "../utils/notebookExtractor";
import {
  expandDraftsWithBidirectional,
  planRandomPackages,
  VOCAB_PACKAGE_SIZE,
} from "../utils/topicOrganizer";
import { consolidateVocabDrafts } from "../utils/vocabConsolidator";
import { FormattedText, hasFormattingMarkers } from "./FormattedText";
import { ImportPackageUpdate } from "./ImportStudio";

interface NotebookWorkspaceProps {
  notebooks: TopicNotebook[];
  sources: NotebookSource[];
  packages: VocabPackage[];
  cards: VocabCard[];
  onCreateNotebook: (draft: {
    title: string;
    subject: LearningSubject;
    description: string;
  }) => TopicNotebook;
  onUpdateNotebook: (
    notebookId: string,
    updates: Partial<TopicNotebook>
  ) => void;
  onDeleteNotebook: (notebookId: string) => void;
  onAddSources: (newSources: NotebookSource[]) => void;
  onDeleteSource: (sourceId: string) => void;
  onImportCards: (
    items: ImportedVocabDraft[],
    packageUpdates: ImportPackageUpdate[]
  ) => void;
  onStudyPackage: (packageId: number) => void;
  onOpenPackageCards: (packageId: number) => void;
}

function makeGroupId(): string {
  return `grp-nb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatSourceTypeLabel(type: NotebookSource["sourceType"]): string {
  switch (type) {
    case "pdf":
      return "PDF";
    case "docx":
      return "Word";
    case "csv":
      return "CSV";
    case "txt":
      return "Text";
    case "notes":
      return "Notiz";
  }
}

export function NotebookWorkspace({
  notebooks,
  sources,
  packages,
  cards,
  onCreateNotebook,
  onUpdateNotebook,
  onDeleteNotebook,
  onAddSources,
  onDeleteSource,
  onImportCards,
  onStudyPackage,
  onOpenPackageCards,
}: NotebookWorkspaceProps) {
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(
    () => notebooks[0]?.id ?? null
  );
  const [showNewNotebookForm, setShowNewNotebookForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [editingNotebook, setEditingNotebook] = useState(false);
  const [editNbTitle, setEditNbTitle] = useState("");
  const [editNbDesc, setEditNbDesc] = useState("");
  const [confirmDeleteNb, setConfirmDeleteNb] = useState(false);

  // Source upload / note creation state
  const [isUploading, setIsUploading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [inspectedSourceId, setInspectedSourceId] = useState<string | null>(
    null
  );

  // Source selection for creating a Lernset
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [setName, setSetName] = useState("");
  const [hasCustomSetName, setHasCustomSetName] = useState(false);
  const [setSubject, setSetSubject] = useState<LearningSubject>("auto");
  const [consolidateSelected, setConsolidateSelected] = useState(true);
  const [bidirectionalOverride, setBidirectionalOverride] = useState<
    boolean | null
  >(null);
  const [editableDrafts, setEditableDrafts] = useState<ImportedVocabDraft[]>(
    []
  );
  const [rightPaneView, setRightPaneView] = useState<"builder" | "source">(
    "builder"
  );
  const [createdBanner, setCreatedBanner] = useState<{
    setName: string;
    cardCount: number;
    pairCount: number;
    bidirectional: boolean;
    packageIds: number[];
  } | null>(null);

  // Keep activeNotebookId valid
  useEffect(() => {
    if (
      activeNotebookId &&
      notebooks.some((nb) => nb.id === activeNotebookId)
    ) {
      return;
    }
    setActiveNotebookId(notebooks[0]?.id ?? null);
  }, [activeNotebookId, notebooks]);

  const activeNotebook = useMemo(
    () => notebooks.find((nb) => nb.id === activeNotebookId) || null,
    [activeNotebookId, notebooks]
  );

  const notebookSources = useMemo(
    () =>
      activeNotebook
        ? sources.filter((s) => s.notebookId === activeNotebook.id)
        : [],
    [activeNotebook, sources]
  );

  const notebookPackages = useMemo(
    () =>
      activeNotebook
        ? packages.filter((p) => p.notebookId === activeNotebook.id)
        : [],
    [activeNotebook, packages]
  );

  const inspectedSource = useMemo(
    () => notebookSources.find((s) => s.id === inspectedSourceId) || null,
    [inspectedSourceId, notebookSources]
  );

  // Reset per-notebook UI state when switching notebook
  useEffect(() => {
    if (!activeNotebook) {
      setSelectedSourceIds([]);
      setInspectedSourceId(null);
      setEditableDrafts([]);
      return;
    }
    const nbSrcIds = sources
      .filter((s) => s.notebookId === activeNotebook.id)
      .map((s) => s.id);
    setSelectedSourceIds(nbSrcIds);
    setInspectedSourceId(null);
    setRightPaneView("builder");
    setSetSubject(activeNotebook.subject);
    setSetName("");
    setHasCustomSetName(false);
    setBidirectionalOverride(null);
    setCreatedBanner(null);
    setEditingNotebook(false);
    setConfirmDeleteNb(false);
  }, [activeNotebook?.id]);

  // Rebuild candidate drafts whenever checked sources or consolidation option change
  useEffect(() => {
    if (!activeNotebook) {
      setEditableDrafts([]);
      return;
    }
    const selectedSrcs = notebookSources.filter((s) =>
      selectedSourceIds.includes(s.id)
    );
    const rawDrafts: ImportedVocabDraft[] = [];
    selectedSrcs.forEach((src) => {
      src.extractedItems.forEach((item, idx) => {
        rawDrafts.push({
          id: `nb-${src.id}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          term: item.term,
          translation: item.translation,
          partOfSpeech: item.partOfSpeech,
          phonetic: item.phonetic,
          exampleSentence: item.exampleSentence,
          note: item.note,
          topic: item.topic,
          sourceId: src.id,
          sourceTitle: src.title,
          notebookId: activeNotebook.id,
          packageId: 0,
          selected: true,
        });
      });
    });

    if (rawDrafts.length === 0) {
      setEditableDrafts([]);
      return;
    }

    if (consolidateSelected) {
      const { consolidatedDrafts } = consolidateVocabDrafts(rawDrafts, []);
      setEditableDrafts(consolidatedDrafts);
    } else {
      setEditableDrafts(rawDrafts);
    }
  }, [activeNotebook, consolidateSelected, notebookSources, selectedSourceIds]);

  const activeDrafts = useMemo(
    () =>
      editableDrafts.filter(
        (d) => d.selected && d.term.trim() && d.translation.trim()
      ),
    [editableDrafts]
  );

  const detectedCombo = useMemo(() => {
    if (activeDrafts.length === 0) return null;
    if (setSubject !== "auto" && setSubject !== "sprachen") return null;
    return detectPackageLanguageCombo(activeDrafts);
  }, [activeDrafts, setSubject]);

  const resolvedSetSubject: Exclude<LearningSubject, "auto"> = useMemo(() => {
    if (setSubject !== "auto") return setSubject;
    if (detectedCombo) return "sprachen";
    if (activeDrafts.length > 0) {
      return detectLearningSubject(
        activeDrafts,
        setName.trim() || activeNotebook?.title || ""
      );
    }
    if (activeNotebook && activeNotebook.subject !== "auto") {
      return activeNotebook.subject;
    }
    return "wissen";
  }, [activeDrafts, activeNotebook, detectedCombo, setName, setSubject]);

  const isVocabSet = resolvedSetSubject === "sprachen";
  const effectiveBidirectional =
    bidirectionalOverride !== null ? bidirectionalOverride : isVocabSet;

  const effectiveSetName = useMemo(() => {
    if (hasCustomSetName && setName.trim()) return setName.trim();
    const selectedSrcs = notebookSources.filter((s) =>
      selectedSourceIds.includes(s.id)
    );
    if (selectedSrcs.length === 1) {
      return selectedSrcs[0].title.replace(/\.[^.]+$/, "");
    }
    if (activeNotebook) {
      return `${activeNotebook.title} · Set ${notebookPackages.length + 1}`;
    }
    return "Neues Lernset";
  }, [
    activeNotebook,
    hasCustomSetName,
    notebookPackages.length,
    notebookSources,
    selectedSourceIds,
    setName,
  ]);

  const plannedSummary = useMemo(() => {
    if (activeDrafts.length === 0) {
      return { packageCount: 0, cardCount: 0, pairCount: 0 };
    }
    const packageCount = Math.max(
      1,
      Math.ceil(activeDrafts.length / VOCAB_PACKAGE_SIZE)
    );
    const pairCount = activeDrafts.length;
    const cardCount = effectiveBidirectional ? pairCount * 2 : pairCount;
    return { packageCount, cardCount, pairCount };
  }, [activeDrafts.length, effectiveBidirectional]);

  const handleCreateNotebookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const created = onCreateNotebook({
      title: newTitle.trim(),
      subject: "auto",
      description: newDesc.trim(),
    });
    setActiveNotebookId(created.id);
    setNewTitle("");
    setNewDesc("");
    setShowNewNotebookForm(false);
  };

  const handleUploadSourceFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeNotebook) return;
    setSourceError(null);
    setIsUploading(true);
    const created: NotebookSource[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const res = await parseNotebookSourceFile(file);
        const now = Date.now();
        created.push({
          id: `src-${now}-${Math.random().toString(36).slice(2, 7)}`,
          notebookId: activeNotebook.id,
          title: res.title,
          sourceType: res.sourceType,
          rawText: res.rawText,
          extractedItems: res.extractedItems,
          wordCount: res.wordCount,
          extractionMethod: res.extractionMethod,
          createdAt: now,
        });
      } catch (err: unknown) {
        errors.push(
          err instanceof Error
            ? err.message
            : `Fehler beim Lesen von ${file.name}.`
        );
      }
    }

    if (created.length > 0) {
      onAddSources(created);
      setSelectedSourceIds((prev) => [...prev, ...created.map((s) => s.id)]);
      setCreatedBanner(null);
    }
    if (errors.length > 0) {
      setSourceError(errors.join(" "));
    }
    setIsUploading(false);
  };

  const handleAddNoteSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNotebook) return;
    setSourceError(null);
    try {
      const res = parseNotebookRawNote(noteTitle, noteBody);
      const now = Date.now();
      const src: NotebookSource = {
        id: `src-${now}-${Math.random().toString(36).slice(2, 7)}`,
        notebookId: activeNotebook.id,
        title: res.title,
        sourceType: res.sourceType,
        rawText: res.rawText,
        extractedItems: res.extractedItems,
        wordCount: res.wordCount,
        extractionMethod: res.extractionMethod,
        createdAt: now,
      };
      onAddSources([src]);
      setSelectedSourceIds((prev) => [...prev, src.id]);
      setNoteTitle("");
      setNoteBody("");
      setShowNoteComposer(false);
      setCreatedBanner(null);
    } catch (err: unknown) {
      setSourceError(
        err instanceof Error
          ? err.message
          : "Notiz konnte nicht verarbeitet werden."
      );
    }
  };

  const handleCreateLernset = () => {
    if (!activeNotebook || activeDrafts.length === 0) return;

    const selectedSrcs = notebookSources.filter((s) =>
      selectedSourceIds.includes(s.id)
    );
    const sourceIds = selectedSrcs.map((s) => s.id);
    const sourceTitles = selectedSrcs.map((s) => s.title);
    const groupId = makeGroupId();

    const planResult = planRandomPackages({
      items: activeDrafts,
      packages,
      listName: effectiveSetName,
      groupId,
      subject: resolvedSetSubject,
      bidirectional: effectiveBidirectional,
      maxPerPackage: VOCAB_PACKAGE_SIZE,
    });

    const bidirectionalIds = new Set(
      planResult.packagePlans
        .filter((p) => p.bidirectional)
        .map((p) => p.packageId)
    );

    const expandedDrafts = expandDraftsWithBidirectional(
      planResult.updatedDrafts,
      bidirectionalIds
    ).map((d) => ({
      ...d,
      notebookId: activeNotebook.id,
    }));

    const packageUpdates: ImportPackageUpdate[] = planResult.packagePlans.map(
      (plan) => {
        const pkgItems = expandedDrafts.filter(
          (d) => d.packageId === plan.packageId
        );
        const subDef = getSubjectDefinition(plan.detectedSubject);
        const subjectLabel = plan.detectedCombo
          ? `${plan.detectedCombo.sourceLang} ${plan.bidirectional ? "↔" : "→"} ${plan.detectedCombo.targetLang}`
          : subDef.shortLabel;

        return {
          id: plan.packageId,
          number: plan.packageNumber,
          title: plan.suggestedTitle,
          groupId,
          groupName: effectiveSetName,
          notebookId: activeNotebook.id,
          sourceIds,
          sourceTitles,
          bidirectional: plan.bidirectional,
          subject: plan.detectedSubject,
          subjectLabel,
          description: plan.bidirectional
            ? `${plan.uniquePairCount} Vokabeln · ${pkgItems.length} Karten (beide Richtungen) · ${subjectLabel}`
            : `${pkgItems.length} Karten · ${subjectLabel}`,
          sourceLang: plan.detectedCombo?.sourceLang || "",
          targetLang: plan.detectedCombo?.targetLang || "",
          isNewSlot: true,
        };
      }
    );

    onImportCards(expandedDrafts, packageUpdates);
    setCreatedBanner({
      setName: effectiveSetName,
      cardCount: expandedDrafts.length,
      pairCount: activeDrafts.length,
      bidirectional: effectiveBidirectional,
      packageIds: planResult.packagePlans.map((p) => p.packageId),
    });
    setSetName("");
    setHasCustomSetName(false);
  };

  const toggleSourceSelected = (sourceId: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
    );
    setCreatedBanner(null);
  };

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-stone-200 dark:border-slate-800">
        <div>
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-1">
            Themen-Notebooks · Eigene Quellen sammeln &amp; gezielt Lernsets
            erstellen
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Notebooks ({notebooks.length})
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowNewNotebookForm((prev) => !prev)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Neues Notebook</span>
        </button>
      </div>

      {/* Create Notebook Form */}
      {(showNewNotebookForm || notebooks.length === 0) && (
        <form
          onSubmit={handleCreateNotebookSubmit}
          className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 study-card-shadow"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                {notebooks.length === 0
                  ? "Erstes Themen-Notebook anlegen"
                  : "Neues Themen-Notebook anlegen"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Laden Sie zu einem Thema PDFs, Arbeitsblätter, Word-Dokumente,
                CSVs oder eigene Notizen hoch und wählen Sie pro Lernset genau
                die gewünschten Quellen aus.
              </p>
            </div>
            {notebooks.length > 0 && (
              <button
                type="button"
                onClick={() => setShowNewNotebookForm(false)}
                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Formular schließen"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label
                htmlFor="nb-new-title"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Thema / Notebook-Name *
              </label>
              <input
                id="nb-new-title"
                type="text"
                required
                dir="auto"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="z. B. Zellbiologie Klausur, BGB Schuldrecht oder Spanisch B1"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="nb-new-desc"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Kurze Beschreibung (optional)
              </label>
              <input
                id="nb-new-desc"
                type="text"
                dir="auto"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="z. B. Alle Vorlesungsskripte und Arbeitsblätter für das Semester"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-stone-100 dark:border-slate-800">
            {notebooks.length > 0 && (
              <button
                type="button"
                onClick={() => setShowNewNotebookForm(false)}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 border border-stone-200 dark:border-slate-700 rounded-xl hover:bg-stone-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Abbrechen
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2 text-xs sm:text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 rounded-xl cursor-pointer whitespace-nowrap"
            >
              Notebook erstellen
            </button>
          </div>
        </form>
      )}

      {/* Notebook Tabs Selector */}
      {notebooks.length > 0 && activeNotebook && (
        <>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {notebooks.map((nb) => {
              const isSelected = nb.id === activeNotebook.id;
              const nbSrcCount = sources.filter(
                (s) => s.notebookId === nb.id
              ).length;
              return (
                <button
                  key={nb.id}
                  type="button"
                  onClick={() => setActiveNotebookId(nb.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 border-slate-900 dark:border-slate-100"
                      : "bg-white dark:bg-[#161B22] text-slate-700 dark:text-slate-300 border-stone-200 dark:border-slate-800 hover:border-stone-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <BookMarked className="w-3.5 h-3.5 shrink-0" />
                  <span>{nb.title}</span>
                  <span
                    className={`font-mono-tabular text-xs ${
                      isSelected
                        ? "text-stone-300 dark:text-slate-600"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {nbSrcCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Notebook Header & Metadata */}
          <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-6 study-card-shadow">
            {editingNotebook ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={editNbTitle}
                  onChange={(e) => setEditNbTitle(e.target.value)}
                  className="md:col-span-2 px-3.5 py-2 text-sm font-semibold bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                  placeholder="Notebook-Name"
                />
                <input
                  type="text"
                  value={editNbDesc}
                  onChange={(e) => setEditNbDesc(e.target.value)}
                  className="md:col-span-2 px-3.5 py-2 text-sm bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                  placeholder="Beschreibung"
                />
                <div className="md:col-span-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (editNbTitle.trim()) {
                        onUpdateNotebook(activeNotebook.id, {
                          title: editNbTitle.trim(),
                          description: editNbDesc.trim(),
                          updatedAt: Date.now(),
                        });
                      }
                      setEditingNotebook(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Speichern</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingNotebook(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-stone-200 dark:border-slate-700 rounded-lg cursor-pointer"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 mb-1">
                    {activeNotebook.subject !== "auto" && (
                      <>
                        <span>
                          {getSubjectDefinition(activeNotebook.subject).label}
                        </span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span className="tabular-nums">
                      {notebookSources.length}{" "}
                      {notebookSources.length === 1 ? "Quelle" : "Quellen"}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {notebookPackages.length}{" "}
                      {notebookPackages.length === 1 ? "Lernset" : "Lernsets"}
                    </span>
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {activeNotebook.title}
                  </h2>
                  {activeNotebook.description && (
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {activeNotebook.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditNbTitle(activeNotebook.title);
                      setEditNbDesc(activeNotebook.description);
                      setEditingNotebook(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 border border-stone-200 dark:border-slate-700 hover:border-stone-300 dark:hover:border-slate-500 rounded-lg cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Bearbeiten</span>
                  </button>
                  {confirmDeleteNb ? (
                    <span className="inline-flex items-center gap-2 text-xs bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-1.5 text-rose-800 dark:text-rose-200">
                      <span>Notebook löschen?</span>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteNotebook(activeNotebook.id);
                          setConfirmDeleteNb(false);
                        }}
                        className="font-semibold underline cursor-pointer"
                      >
                        Ja
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteNb(false)}
                        className="text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Nein
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteNb(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 border border-stone-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Löschen</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {sourceError && (
            <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 flex items-start gap-3 text-rose-950 dark:text-rose-100 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>{sourceError}</div>
            </div>
          )}

          {createdBanner && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3 text-emerald-950 dark:text-emerald-100">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <div className="text-sm">
                  <span className="font-semibold">
                    Lernset „{createdBanner.setName}“ erstellt:
                  </span>{" "}
                  {createdBanner.bidirectional
                    ? `${createdBanner.pairCount} Vokabeln → ${createdBanner.cardCount} Karten (beide Richtungen)`
                    : `${createdBanner.cardCount} Karten`}{" "}
                  in{" "}
                  {createdBanner.packageIds.length === 1
                    ? "1 Paket"
                    : `${createdBanner.packageIds.length} Paketen`}
                  .
                </div>
              </div>
              {createdBanner.packageIds.length > 0 && (
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStudyPackage(createdBanner.packageIds[0])}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Direkt lernen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenPackageCards(createdBanner.packageIds[0])
                    }
                    className="px-4 py-2 text-xs font-medium text-emerald-900 dark:text-emerald-200 bg-white dark:bg-[#161B22] border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/60 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    Karten ansehen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TWO-ZONE NOTEBOOK STUDIO: LEFT = SOURCES, RIGHT = SELECTIVE LERNSET BUILDER / SOURCE INSPECTOR */}
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
            {/* LEFT ZONE: SOURCES */}
            <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-5 space-y-5 study-card-shadow">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Quellen ({notebookSources.length})
                </h3>
                {notebookSources.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedSourceIds(notebookSources.map((s) => s.id))
                      }
                      className="text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 font-medium cursor-pointer"
                    >
                      Alle
                    </button>
                    <span className="text-stone-300 dark:text-slate-700">/</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSourceIds([])}
                      className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      Keine
                    </button>
                  </div>
                )}
              </div>

              {/* Upload Files Dropzone */}
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleUploadSourceFiles(e.dataTransfer.files);
                }}
                className="flex flex-col items-center justify-center border border-dashed border-stone-300 dark:border-slate-700 hover:border-sky-600 dark:hover:border-sky-500 rounded-xl p-5 text-center bg-[#FAF9F6] dark:bg-[#1C222B] transition-colors cursor-pointer"
              >
                <Upload className="w-5 h-5 text-slate-400 dark:text-slate-500 mb-2" />
                <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                  {isUploading
                    ? "Quellen werden lokal gelesen..."
                    : "PDF, Word, Arbeitsblatt, CSV oder Text hochladen"}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Auch mehrere Dateien gleichzeitig · erkennt Hoch-/Tiefstellung
                </span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.csv,.tsv,.txt,.md"
                  onChange={(e) => {
                    handleUploadSourceFiles(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>

              {/* Toggle Paste Note Source */}
              <button
                type="button"
                onClick={() => setShowNoteComposer((prev) => !prev)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1C222B] border border-stone-200 dark:border-slate-700 hover:border-stone-300 dark:hover:border-slate-600 hover:bg-stone-50 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>
                  {showNoteComposer
                    ? "Notiz-Eingabe schließen"
                    : "Text / Notiz als Quelle hinzufügen"}
                </span>
              </button>

              {showNoteComposer && (
                <form
                  onSubmit={handleAddNoteSource}
                  className="pt-3 border-t border-stone-200 dark:border-slate-800 space-y-2.5"
                >
                  <input
                    type="text"
                    required
                    dir="auto"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Quellentitel (z. B. Mitschrieb Kapitel 3)"
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                  />
                  <textarea
                    rows={5}
                    required
                    dir="auto"
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder={
                      "Text, Zusammenfassung, Definitionen oder Vokabeln einfügen...\n\nBeispiele:\n## Zellatmung\nUnter Zellatmung versteht man den Abbau von Glukose zur Gewinnung von ATP.\nPhotosynthese - Umwandlung von Lichtenergie in chemische Energie"
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    className="w-full px-3 py-2 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg cursor-pointer"
                  >
                    Quelle speichern
                  </button>
                </form>
              )}

              {/* Sources List with Selection Checkboxes */}
              {notebookSources.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  Noch keine Quellen in diesem Notebook. Laden Sie Dateien hoch
                  oder fügen Sie eigene Notizen hinzu.
                </div>
              ) : (
                <div className="divide-y divide-stone-100 dark:divide-slate-800/80 border-t border-stone-100 dark:border-slate-800">
                  {notebookSources.map((src) => {
                    const checked = selectedSourceIds.includes(src.id);
                    const isInspected =
                      rightPaneView === "source" &&
                      inspectedSourceId === src.id;
                    return (
                      <div
                        key={src.id}
                        className={`py-3 flex items-start gap-3 ${
                          isInspected
                            ? "bg-sky-50/50 dark:bg-sky-950/30 -mx-2 px-2 rounded-lg"
                            : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSourceSelected(src.id)}
                          aria-label={`Quelle ${src.title} für Lernset auswählen`}
                          className="mt-1 rounded border-stone-300 dark:border-slate-700 dark:bg-[#11151C] text-sky-700 focus:ring-sky-700 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {src.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span>{formatSourceTypeLabel(src.sourceType)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {src.wordCount} Wörter
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
                              {src.extractedItems.length}{" "}
                              {src.extractedItems.length === 1
                                ? "Eintrag"
                                : "Einträge"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectedSourceId(src.id);
                              setRightPaneView("source");
                            }}
                            title="Quelleninhalt ansehen"
                            aria-label={`Quelle ${src.title} ansehen`}
                            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-sky-700 dark:hover:text-sky-400 rounded-md cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteSource(src.id);
                              setSelectedSourceIds((prev) =>
                                prev.filter((id) => id !== src.id)
                              );
                              if (inspectedSourceId === src.id) {
                                setInspectedSourceId(null);
                                setRightPaneView("builder");
                              }
                            }}
                            title="Quelle entfernen"
                            aria-label={`Quelle ${src.title} löschen`}
                            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-700 dark:hover:text-rose-400 rounded-md cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT ZONE: LERNSET BUILDER OR SOURCE INSPECTOR */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 study-card-shadow">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-100 dark:border-slate-800">
                  <div className="inline-flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#11151C] rounded-xl">
                    <button
                      type="button"
                      onClick={() => setRightPaneView("builder")}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                        rightPaneView === "builder"
                          ? "bg-white dark:bg-[#1C222B] text-slate-900 dark:text-slate-100 shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      Lernset aus Quellen erstellen
                    </button>
                    {inspectedSource && (
                      <button
                        type="button"
                        onClick={() => setRightPaneView("source")}
                        className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap max-w-[220px] truncate ${
                          rightPaneView === "source"
                            ? "bg-white dark:bg-[#1C222B] text-slate-900 dark:text-slate-100 shadow-sm"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        Quelle: {inspectedSource.title}
                      </button>
                    )}
                  </div>

                  {rightPaneView === "builder" && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {selectedSourceIds.length} von {notebookSources.length}{" "}
                      Quellen gewählt
                    </span>
                  )}
                </div>

                {rightPaneView === "source" && inspectedSource ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                          {inspectedSource.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {inspectedSource.extractionMethod} ·{" "}
                          {inspectedSource.wordCount} Wörter ·{" "}
                          {inspectedSource.extractedItems.length} erkannte
                          Einträge
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRightPaneView("builder")}
                        className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 cursor-pointer"
                      >
                        Zurück zum Lernset-Generator
                      </button>
                    </div>

                    <div className="bg-[#FAF9F6] dark:bg-[#1C222B] border border-stone-200 dark:border-slate-800 rounded-xl p-4 max-h-96 overflow-y-auto">
                      <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                        <FormattedText text={inspectedSource.rawText} />
                      </pre>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Lernset Settings */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="nb-set-name"
                          className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5"
                        >
                          <FolderPlus className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                          <span>Name des neuen Lernsets</span>
                        </label>
                        <input
                          id="nb-set-name"
                          type="text"
                          dir="auto"
                          value={setName}
                          onChange={(e) => {
                            setSetName(e.target.value);
                            setHasCustomSetName(e.target.value.trim().length > 0);
                          }}
                          placeholder={effectiveSetName}
                          className="w-full px-3.5 py-2 text-sm bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="nb-set-subject"
                          className="block text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5"
                        >
                          Fachgebiet für dieses Lernset
                        </label>
                        <select
                          id="nb-set-subject"
                          value={setSubject}
                          onChange={(e) => {
                            const next = e.target.value as LearningSubject;
                            setSetSubject(next);
                            setBidirectionalOverride(null);
                          }}
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                        >
                          <option value="auto">Automatisch erkennen</option>
                          {SUBJECT_DEFINITIONS.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={consolidateSelected}
                            onChange={(e) =>
                              setConsolidateSelected(e.target.checked)
                            }
                            className="rounded border-stone-300 dark:border-slate-700 dark:bg-[#11151C] text-sky-700 focus:ring-sky-700"
                          />
                          <span>
                            Doppelte Einträge zwischen gewählten Quellen
                            bereinigen
                          </span>
                        </label>

                        {isVocabSet && (
                          <label className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={effectiveBidirectional}
                              onChange={(e) =>
                                setBidirectionalOverride(e.target.checked)
                              }
                              className="rounded border-stone-300 dark:border-slate-700 dark:bg-[#11151C] text-sky-700 focus:ring-sky-700"
                            />
                            <span>
                              Beide Richtungen erstellen (Hin &amp; Rück — 50
                              Vokabeln = 100 Karten)
                            </span>
                          </label>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={activeDrafts.length === 0}
                        onClick={handleCreateLernset}
                        className="px-5 py-2.5 text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 disabled:bg-stone-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {activeDrafts.length === 0
                          ? "Keine Einträge ausgewählt"
                          : effectiveBidirectional
                            ? `Lernset erstellen (${plannedSummary.pairCount} Vokabeln → ${plannedSummary.cardCount} Karten)`
                            : `Lernset erstellen (${plannedSummary.cardCount} Karten)`}
                      </button>
                    </div>

                    {/* Preview of Cards from Selected Sources */}
                    {editableDrafts.length === 0 ? (
                      <div className="py-10 text-center border-t border-stone-100 dark:border-slate-800">
                        <Layers className="w-8 h-8 text-stone-300 dark:text-slate-700 mx-auto mb-2" />
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                          {notebookSources.length === 0
                            ? "Laden Sie links mindestens eine Quelle hoch oder fügen Sie eine Lernnotiz ein."
                            : selectedSourceIds.length === 0
                              ? "Wählen Sie links eine oder mehrere Quellen per Checkbox aus, um daraus ein Lernset zu erstellen."
                              : "In den ausgewählten Quellen wurden keine automatischen Lernpaare erkannt. Sie können die Quelle im Textformat („Begriff - Erklärung“) ergänzen."}
                        </p>
                      </div>
                    ) : (
                      <div className="border-t border-stone-200 dark:border-slate-800 pt-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            Vorschau aus gewählten Quellen:{" "}
                            <strong className="text-slate-800 dark:text-slate-200 tabular-nums">
                              {activeDrafts.length} Einträge
                            </strong>{" "}
                            ·{" "}
                            {plannedSummary.packageCount === 1
                              ? "1 Paket"
                              : `${plannedSummary.packageCount} Pakete (je max. ${VOCAB_PACKAGE_SIZE})`}
                            {effectiveBidirectional && (
                              <span>
                                {" "}
                                · insgesamt{" "}
                                <strong className="text-sky-700 dark:text-sky-400 tabular-nums">
                                  {plannedSummary.cardCount} Karten
                                </strong>{" "}
                                (beide Richtungen)
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="overflow-x-auto max-h-96 overflow-y-auto border border-stone-200 dark:border-slate-800 rounded-xl">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="sticky top-0 bg-[#FAF9F6] dark:bg-[#1C222B] border-b border-stone-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 z-10">
                              <tr>
                                <th className="py-2 pl-3 pr-2 w-8">
                                  <input
                                    type="checkbox"
                                    checked={
                                      activeDrafts.length ===
                                      editableDrafts.length
                                    }
                                    onChange={(e) =>
                                      setEditableDrafts((prev) =>
                                        prev.map((d) => ({
                                          ...d,
                                          selected: e.target.checked,
                                        }))
                                      )
                                    }
                                    className="rounded border-stone-300 dark:border-slate-700 dark:bg-[#11151C]"
                                  />
                                </th>
                                <th className="py-2 px-2 font-medium">
                                  Vorderseite
                                </th>
                                <th className="py-2 px-2 font-medium">
                                  Rückseite
                                </th>
                                <th className="py-2 px-2 font-medium">Quelle</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100 dark:divide-slate-800/80">
                              {editableDrafts.map((row) => (
                                <tr key={row.id} className="align-top">
                                  <td className="py-2 pl-3 pr-2 pt-2.5">
                                    <input
                                      type="checkbox"
                                      checked={row.selected}
                                      onChange={(e) =>
                                        setEditableDrafts((prev) =>
                                          prev.map((d) =>
                                            d.id === row.id
                                              ? {
                                                  ...d,
                                                  selected: e.target.checked,
                                                }
                                              : d
                                          )
                                        )
                                      }
                                      className="rounded border-stone-300 dark:border-slate-700 dark:bg-[#11151C]"
                                    />
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <input
                                      type="text"
                                      dir="auto"
                                      value={row.term}
                                      onChange={(e) =>
                                        setEditableDrafts((prev) =>
                                          prev.map((d) =>
                                            d.id === row.id
                                              ? { ...d, term: e.target.value }
                                              : d
                                          )
                                        )
                                      }
                                      className="w-full min-w-[140px] px-2 py-1 text-xs bg-white dark:bg-[#11151C] border border-stone-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                                    />
                                    {hasFormattingMarkers(row.term) && (
                                      <div
                                        dir="auto"
                                        className="mt-1 px-1 text-[11px] text-slate-600 dark:text-slate-300"
                                      >
                                        <FormattedText text={row.term} />
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <input
                                      type="text"
                                      dir="auto"
                                      value={row.translation}
                                      onChange={(e) =>
                                        setEditableDrafts((prev) =>
                                          prev.map((d) =>
                                            d.id === row.id
                                              ? {
                                                  ...d,
                                                  translation: e.target.value,
                                                }
                                              : d
                                          )
                                        )
                                      }
                                      className="w-full min-w-[180px] px-2 py-1 text-xs bg-white dark:bg-[#11151C] border border-stone-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                                    />
                                    {hasFormattingMarkers(row.translation) && (
                                      <div
                                        dir="auto"
                                        className="mt-1 px-1 text-[11px] text-slate-600 dark:text-slate-300"
                                      >
                                        <FormattedText text={row.translation} />
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap max-w-[150px] truncate">
                                    {row.sourceTitle || "Quelle"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Created Lernsets in this Notebook */}
              <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 study-card-shadow">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Erstellte Lernsets in diesem Notebook (
                    {notebookPackages.length})
                  </h3>
                </div>

                {notebookPackages.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Noch keine Lernsets aus diesem Notebook erstellt. Wählen Sie
                    Quellen aus und klicken Sie oben auf „Lernset erstellen“.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-100 dark:divide-slate-800/80">
                    {notebookPackages.map((pkg) => {
                      const pkgCards = cards.filter(
                        (c) => c.packageId === pkg.id
                      );
                      const learned = pkgCards.filter(
                        (c) => c.srs.repetitions > 0
                      ).length;
                      const pct =
                        pkgCards.length > 0
                          ? Math.round((learned / pkgCards.length) * 100)
                          : 0;
                      const ctx = getPackageSubjectContext(pkg, pkgCards);

                      return (
                        <div
                          key={pkg.id}
                          className="py-3.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                                {pkg.title}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                · {ctx.displayLabel}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                              <span className="tabular-nums">
                                {pkgCards.length} Karten
                                {pkg.bidirectional
                                  ? ` (${Math.ceil(pkgCards.length / 2)} Vokabeln · hin & zurück)`
                                  : ""}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {learned}/{pkgCards.length} gelernt ({pct}%)
                              </span>
                              {pkg.sourceTitles &&
                                pkg.sourceTitles.length > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate max-w-sm">
                                      Quellen: {pkg.sourceTitles.join(", ")}
                                    </span>
                                  </>
                                )}
                            </div>
                            <div className="mt-2 w-full max-w-md h-1 bg-stone-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  pct === 100
                                    ? "bg-emerald-500"
                                    : "bg-sky-600/85 dark:bg-sky-500"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onOpenPackageCards(pkg.id)}
                              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-stone-100 dark:bg-[#1C222B] hover:bg-stone-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
                            >
                              Karten
                            </button>
                            <button
                              type="button"
                              disabled={pkgCards.length === 0}
                              onClick={() => onStudyPackage(pkg.id)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white disabled:bg-stone-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 rounded-lg cursor-pointer whitespace-nowrap"
                            >
                              <Play className="w-3 h-3" />
                              <span>Lernen</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
