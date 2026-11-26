import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Play,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { detectPackageLanguageCombo } from "../data/languages";
import {
  detectLearningSubject,
  getSubjectDefinition,
  SUBJECT_DEFINITIONS,
} from "../data/subjects";
import {
  ImportedVocabDraft,
  LearningSubject,
  VocabPackage,
} from "../types/vocab";
import {
  CsvParseResult,
  generateCsvTemplate,
  parseCsvContent,
} from "../utils/csvParser";
import {
  parsePdfOffline,
  parseWordDocxOffline,
} from "../utils/offlineDocParser";
import {
  expandDraftsWithBidirectional,
  OrganizedPackagePlan,
  planRandomPackages,
  VOCAB_PACKAGE_SIZE,
} from "../utils/topicOrganizer";
import {
  ConsolidationStats,
  consolidateVocabDrafts,
} from "../utils/vocabConsolidator";
import { FormattedText, hasFormattingMarkers } from "./FormattedText";

export interface ImportPackageUpdate {
  id: number;
  number: number;
  title?: string;
  groupId?: string;
  groupName?: string;
  notebookId?: string;
  sourceIds?: string[];
  sourceTitles?: string[];
  bidirectional?: boolean;
  subject?: LearningSubject;
  subjectLabel?: string;
  description?: string;
  sourceLang?: string;
  targetLang?: string;
  isNewSlot?: boolean;
}

interface ImportStudioProps {
  packages: VocabPackage[];
  onImportCards: (
    items: ImportedVocabDraft[],
    packageUpdates: ImportPackageUpdate[]
  ) => void;
  onOpenPackageCards: (packageId: number) => void;
  onStudyPackage: (packageId: number) => void;
  onNavigatePackages: () => void;
}

type ImportFormat = "csv" | "docx" | "pdf";

function deriveNameFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  return withoutExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function makeNewGroupId(): string {
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ImportStudio({
  packages,
  onImportCards,
  onOpenPackageCards,
  onStudyPackage,
  onNavigatePackages,
}: ImportStudioProps) {
  const existingGroupCount = useMemo(() => {
    const ids = new Set<string>();
    packages.forEach((p) => {
      if (p.groupId) ids.add(p.groupId);
      else ids.add(`legacy-${p.id}`);
    });
    return ids.size;
  }, [packages]);

  const fallbackDefaultName = `Lernset ${existingGroupCount + 1}`;

  const [format, setFormat] = useState<ImportFormat>("csv");
  const [listName, setListName] = useState("");
  const [hasCustomListName, setHasCustomListName] = useState(false);
  const [selectedSubject, setSelectedSubject] =
    useState<LearningSubject>("auto");
  const [pendingGroupId, setPendingGroupId] = useState<string>(() =>
    makeNewGroupId()
  );
  const [consolidateDuplicates, setConsolidateDuplicates] = useState(true);
  const [bidirectionalOverride, setBidirectionalOverride] = useState<
    boolean | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<{
    count: number;
    pairCount: number;
    bidirectional: boolean;
    groupName: string;
    exactRemoved: number;
    mergedCount: number;
    packageIds: number[];
  } | null>(null);

  // CSV state
  const [csvRaw, setCsvRaw] = useState("");
  const [csvParsed, setCsvParsed] = useState<CsvParseResult | null>(null);
  const [csvMapping, setCsvMapping] = useState({
    termCol: 0,
    translationCol: 1,
    exampleCol: -1,
    noteCol: -1,
    posCol: -1,
    packageCol: -1,
  });

  // Raw extracted rows vs consolidated & packaged preview rows
  const [rawExtractedDrafts, setRawExtractedDrafts] = useState<
    ImportedVocabDraft[]
  >([]);
  const [draftRows, setDraftRows] = useState<ImportedVocabDraft[]>([]);
  const [consolidationStats, setConsolidationStats] =
    useState<ConsolidationStats | null>(null);
  const [packagePlans, setPackagePlans] = useState<OrganizedPackagePlan[]>([]);
  const [separatedOppositesCount, setSeparatedOppositesCount] = useState(0);
  const [customPlanTitles, setCustomPlanTitles] = useState<
    Record<number, string>
  >({});
  const [extractionMethod, setExtractionMethod] = useState<string | null>(null);

  const effectiveListName = listName.trim() || fallbackDefaultName;

  const selectedCount = useMemo(
    () =>
      draftRows.filter(
        (r) => r.selected && r.term.trim() && r.translation.trim()
      ).length,
    [draftRows]
  );

  const previewPackageOptions = useMemo(() => {
    return packagePlans.map((plan) => ({
      id: plan.packageId,
      number: plan.packageNumber,
      title: customPlanTitles[plan.packageId] ?? plan.suggestedTitle,
    }));
  }, [customPlanTitles, packagePlans]);

  const liveCountsByPackage = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of draftRows) {
      if (!r.selected || !r.term.trim() || !r.translation.trim()) continue;
      counts.set(r.packageId, (counts.get(r.packageId) || 0) + 1);
    }
    return counts;
  }, [draftRows]);

  const processDraftsPipeline = (
    sourceDrafts: ImportedVocabDraft[],
    options: {
      consolidate: boolean;
      nameForGroup: string;
      groupId: string;
      subject: LearningSubject;
      bidirectional?: boolean | null;
    }
  ) => {
    setRawExtractedDrafts(sourceDrafts);

    if (sourceDrafts.length === 0) {
      setDraftRows([]);
      setConsolidationStats(null);
      setPackagePlans([]);
      setSeparatedOppositesCount(0);
      setCustomPlanTitles({});
      return;
    }

    let workingDrafts = sourceDrafts;
    if (options.consolidate) {
      const consolidated = consolidateVocabDrafts(sourceDrafts, []);
      workingDrafts = consolidated.consolidatedDrafts;
      setConsolidationStats(consolidated.stats);
    } else {
      setConsolidationStats(null);
    }

    if (workingDrafts.length === 0) {
      setDraftRows([]);
      setPackagePlans([]);
      setSeparatedOppositesCount(0);
      setCustomPlanTitles({});
      return;
    }

    const effectiveBidir =
      options.bidirectional !== undefined
        ? options.bidirectional
        : bidirectionalOverride;

    const result = planRandomPackages({
      items: workingDrafts,
      packages,
      listName: options.nameForGroup,
      groupId: options.groupId,
      subject: options.subject,
      bidirectional: effectiveBidir === null ? undefined : effectiveBidir,
      maxPerPackage: VOCAB_PACKAGE_SIZE,
    });

    const initialTitles: Record<number, string> = {};
    for (const plan of result.packagePlans) {
      initialTitles[plan.packageId] = plan.suggestedTitle;
    }

    setPackagePlans(result.packagePlans);
    setSeparatedOppositesCount(result.separatedOppositesCount);
    setCustomPlanTitles(initialTitles);
    setDraftRows(result.updatedDrafts);
  };

  const handleListNameChange = (nextVal: string) => {
    setListName(nextVal);
    setHasCustomListName(nextVal.trim().length > 0);

    const nextEffective = nextVal.trim() || fallbackDefaultName;
    if (packagePlans.length > 0) {
      const total = packagePlans.length;
      let runningStart = 1;
      const updatedPlans = packagePlans.map((plan) => {
        const count = plan.items.length;
        const start = runningStart;
        const end = runningStart + count - 1;
        runningStart = end + 1;
        const suggestedTitle =
          total === 1 ? nextEffective : `${nextEffective} (${start}-${end})`;
        return {
          ...plan,
          groupName: nextEffective,
          suggestedTitle,
        };
      });

      setPackagePlans(updatedPlans);
      const nextTitles: Record<number, string> = {};
      updatedPlans.forEach((p) => {
        nextTitles[p.packageId] = p.suggestedTitle;
      });
      setCustomPlanTitles(nextTitles);
    }
  };

  const handleSubjectChange = (nextSubject: LearningSubject) => {
    setSelectedSubject(nextSubject);
    setBidirectionalOverride(null);
    if (rawExtractedDrafts.length > 0) {
      processDraftsPipeline(rawExtractedDrafts, {
        consolidate: consolidateDuplicates,
        nameForGroup: effectiveListName,
        groupId: pendingGroupId,
        subject: nextSubject,
        bidirectional: null,
      });
    }
  };

  const handleToggleBidirectional = (enabled: boolean) => {
    setBidirectionalOverride(enabled);
    if (rawExtractedDrafts.length > 0) {
      processDraftsPipeline(rawExtractedDrafts, {
        consolidate: consolidateDuplicates,
        nameForGroup: effectiveListName,
        groupId: pendingGroupId,
        subject: selectedSubject,
        bidirectional: enabled,
      });
    }
  };

  const buildDraftsFromCsv = (
    parsed: CsvParseResult,
    mapping: typeof csvMapping
  ): ImportedVocabDraft[] => {
    return parsed.rows
      .map((row, idx) => {
        const term = (row[mapping.termCol] || "").trim();
        const translation = (row[mapping.translationCol] || "").trim();

        return {
          id: `draft-${Date.now()}-${idx}`,
          term,
          translation,
          partOfSpeech: mapping.posCol >= 0 ? row[mapping.posCol] || "" : "",
          exampleSentence:
            mapping.exampleCol >= 0 ? row[mapping.exampleCol] || "" : "",
          note: mapping.noteCol >= 0 ? row[mapping.noteCol] || "" : "",
          packageId: 0,
          selected: Boolean(term && translation),
        };
      })
      .filter((d) => d.term || d.translation);
  };

  const handleCsvInput = (text: string, overrideGroupName?: string) => {
    setCsvRaw(text);
    setErrorMessage(null);
    setSuccessBanner(null);
    if (!text.trim()) {
      setCsvParsed(null);
      processDraftsPipeline([], {
        consolidate: consolidateDuplicates,
        nameForGroup: overrideGroupName || effectiveListName,
        groupId: pendingGroupId,
        subject: selectedSubject,
      });
      return;
    }
    const freshGroupId = makeNewGroupId();
    setPendingGroupId(freshGroupId);
    const parsed = parseCsvContent(text);
    setCsvParsed(parsed);
    setCsvMapping(parsed.detectedMapping);
    const rawDrafts = buildDraftsFromCsv(parsed, parsed.detectedMapping);
    processDraftsPipeline(rawDrafts, {
      consolidate: consolidateDuplicates,
      nameForGroup: overrideGroupName || effectiveListName,
      groupId: freshGroupId,
      subject: selectedSubject,
    });
    setExtractionMethod("Lokale Tabellen-/Text-Erkennung");
  };

  const updateCsvColumnMapping = (
    field: keyof typeof csvMapping,
    colIdx: number
  ) => {
    const next = { ...csvMapping, [field]: colIdx };
    setCsvMapping(next);
    if (csvParsed) {
      const rawDrafts = buildDraftsFromCsv(csvParsed, next);
      processDraftsPipeline(rawDrafts, {
        consolidate: consolidateDuplicates,
        nameForGroup: effectiveListName,
        groupId: pendingGroupId,
        subject: selectedSubject,
      });
    }
  };

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return;
    setErrorMessage(null);
    setSuccessBanner(null);

    const derivedName = deriveNameFromFilename(file.name);
    let chosenName = effectiveListName;
    if (!hasCustomListName && derivedName) {
      setListName(derivedName);
      chosenName = derivedName;
    }

    const lower = file.name.toLowerCase();

    if (
      lower.endsWith(".csv") ||
      lower.endsWith(".tsv") ||
      lower.endsWith(".txt")
    ) {
      setFormat("csv");
      try {
        const text = await file.text();
        handleCsvInput(text, chosenName);
      } catch {
        setErrorMessage("Die CSV/Text-Datei konnte nicht gelesen werden.");
      }
      return;
    }

    if (lower.endsWith(".docx")) {
      setFormat("docx");
      setIsLoading(true);
      setDraftRows([]);
      setPackagePlans([]);
      const freshGroupId = makeNewGroupId();
      setPendingGroupId(freshGroupId);
      try {
        const result = await parseWordDocxOffline(file);
        const drafts: ImportedVocabDraft[] = result.items.map((item, idx) => ({
          id: `docx-${Date.now()}-${idx}`,
          term: item.term.trim(),
          translation: item.translation.trim(),
          partOfSpeech: item.partOfSpeech || "",
          phonetic: item.phonetic || "",
          exampleSentence: item.exampleSentence || "",
          note: item.note || "",
          packageId: 0,
          selected: Boolean(item.term && item.translation),
        }));
        processDraftsPipeline(drafts, {
          consolidate: consolidateDuplicates,
          nameForGroup: chosenName,
          groupId: freshGroupId,
          subject: selectedSubject,
        });
        setExtractionMethod(result.method);
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Fehler beim Verarbeiten des Word-Dokuments."
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (lower.endsWith(".pdf")) {
      setFormat("pdf");
      setIsLoading(true);
      setDraftRows([]);
      setPackagePlans([]);
      const freshGroupId = makeNewGroupId();
      setPendingGroupId(freshGroupId);
      try {
        const result = await parsePdfOffline(file);
        const drafts: ImportedVocabDraft[] = result.items.map((item, idx) => ({
          id: `pdf-${Date.now()}-${idx}`,
          term: item.term.trim(),
          translation: item.translation.trim(),
          partOfSpeech: item.partOfSpeech || "",
          phonetic: item.phonetic || "",
          exampleSentence: item.exampleSentence || "",
          note: item.note || "",
          packageId: 0,
          selected: Boolean(item.term && item.translation),
        }));
        processDraftsPipeline(drafts, {
          consolidate: consolidateDuplicates,
          nameForGroup: chosenName,
          groupId: freshGroupId,
          subject: selectedSubject,
        });
        setExtractionMethod(result.method);
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Fehler beim Verarbeiten der PDF-Datei."
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setErrorMessage(
      "Bitte laden Sie eine .csv-, .tsv-, .txt-, .docx- (Word) oder .pdf-Datei hoch."
    );
  };

  const handleDownloadTemplate = () => {
    const csv = generateCsvTemplate();
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lernwerk-vorlage.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleConsolidation = (enabled: boolean) => {
    setConsolidateDuplicates(enabled);
    if (rawExtractedDrafts.length > 0) {
      processDraftsPipeline(rawExtractedDrafts, {
        consolidate: enabled,
        nameForGroup: effectiveListName,
        groupId: pendingGroupId,
        subject: selectedSubject,
      });
    }
  };

  const handleReshuffleDrafts = () => {
    if (draftRows.length === 0) return;
    processDraftsPipeline(draftRows, {
      consolidate: consolidateDuplicates,
      nameForGroup: effectiveListName,
      groupId: pendingGroupId,
      subject: selectedSubject,
    });
  };

  const handleConfirmImport = () => {
    const valid = draftRows.filter(
      (r) => r.selected && r.term.trim() && r.translation.trim()
    );
    if (valid.length === 0) return;

    const finalGroupId = makeNewGroupId();
    const finalGroupName = effectiveListName;
    const affectedPkgIds = Array.from(new Set(valid.map((v) => v.packageId)));

    const bidirectionalPkgIds = new Set<number>();
    const packageUpdates: ImportPackageUpdate[] = affectedPkgIds.map(
      (pkgId, idx) => {
        const plan = packagePlans.find((p) => p.packageId === pkgId);
        const pkgItems = valid.filter((v) => v.packageId === pkgId);
        const detectedCombo =
          selectedSubject === "auto" || selectedSubject === "sprachen"
            ? plan?.detectedCombo || detectPackageLanguageCombo(pkgItems)
            : null;
        const resolvedSubject: Exclude<LearningSubject, "auto"> =
          selectedSubject !== "auto"
            ? selectedSubject
            : detectedCombo
              ? "sprachen"
              : plan?.detectedSubject ||
                detectLearningSubject(pkgItems, finalGroupName);
        const isBidir =
          bidirectionalOverride !== null
            ? bidirectionalOverride
            : plan
              ? plan.bidirectional
              : resolvedSubject === "sprachen";
        if (isBidir) {
          bidirectionalPkgIds.add(pkgId);
        }
        const subDef = getSubjectDefinition(resolvedSubject);
        const subjectLabel = detectedCombo
          ? `${detectedCombo.sourceLang} ${isBidir ? "↔" : "→"} ${detectedCombo.targetLang}`
          : subDef.shortLabel;
        const customTitle = customPlanTitles[pkgId]?.trim();
        const totalCardsInPkg = isBidir ? pkgItems.length * 2 : pkgItems.length;

        const fallbackTitle =
          affectedPkgIds.length === 1
            ? finalGroupName
            : `${finalGroupName} (${idx + 1})`;

        return {
          id: pkgId,
          number:
            plan?.packageNumber ||
            packages.reduce((m, p) => Math.max(m, p.number), 0) + idx + 1,
          title: customTitle || plan?.suggestedTitle || fallbackTitle,
          groupId: finalGroupId,
          groupName: finalGroupName,
          bidirectional: isBidir,
          subject: resolvedSubject,
          subjectLabel,
          description: isBidir
            ? `${pkgItems.length} Vokabeln · ${totalCardsInPkg} Karten (beide Richtungen) · ${subjectLabel}`
            : `${totalCardsInPkg} Karten · ${subjectLabel}`,
          sourceLang: detectedCombo?.sourceLang || "",
          targetLang: detectedCombo?.targetLang || "",
          isNewSlot: true,
        };
      }
    );

    const expandedCards = expandDraftsWithBidirectional(
      valid,
      bidirectionalPkgIds
    );

    onImportCards(expandedCards, packageUpdates);
    setSuccessBanner({
      count: expandedCards.length,
      pairCount: valid.length,
      bidirectional: bidirectionalPkgIds.size > 0,
      groupName: finalGroupName,
      exactRemoved: consolidationStats?.exactDuplicatesRemoved || 0,
      mergedCount: consolidationStats?.sameMeaningMerged || 0,
      packageIds: affectedPkgIds,
    });

    setRawExtractedDrafts([]);
    setDraftRows([]);
    setConsolidationStats(null);
    setPackagePlans([]);
    setCustomPlanTitles({});
    setCsvRaw("");
    setCsvParsed(null);
    setListName("");
    setHasCustomListName(false);
    setSelectedSubject("auto");
    setBidirectionalOverride(null);
    setPendingGroupId(makeNewGroupId());
  };

  const hasConsolidationEvents = Boolean(
    consolidationStats &&
      (consolidationStats.exactDuplicatesRemoved > 0 ||
        consolidationStats.sameMeaningMerged > 0)
  );

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-stone-200 dark:border-slate-800">
        <div>
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-1">
            100% offline · Vokabeln, Fachwissen, Formeln &amp; Prüfungsfragen · max.{" "}
            {VOCAB_PACKAGE_SIZE} Karten pro Paket
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Lerninhalte importieren
          </h1>
        </div>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161B22] border border-stone-300 dark:border-slate-700 hover:bg-stone-50 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>CSV-Vorlage herunterladen</span>
        </button>
      </div>

      {successBanner && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 text-emerald-950 dark:text-emerald-100">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
            <div className="text-sm space-y-0.5">
              <div>
                <span className="font-semibold">
                  {successBanner.bidirectional
                    ? `${successBanner.pairCount} Vokabeln (${successBanner.count} Karten in beiden Richtungen) in Gruppe „${successBanner.groupName}“ importiert`
                    : `${successBanner.count} Karten in Gruppe „${successBanner.groupName}“ importiert`}
                </span>
                <span>
                  {" "}
                  —{" "}
                  {successBanner.packageIds.length === 1
                    ? "als 1 einzelnes Paket erstellt."
                    : `auf ${successBanner.packageIds.length} Pakete (je max. ${VOCAB_PACKAGE_SIZE} Einträge) aufgeteilt.`}
                </span>
              </div>
              {(successBanner.exactRemoved > 0 ||
                successBanner.mergedCount > 0) && (
                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                  {successBanner.exactRemoved > 0 && (
                    <span>
                      {successBanner.exactRemoved} exakt doppelte entfernt
                    </span>
                  )}
                  {successBanner.exactRemoved > 0 &&
                    successBanner.mergedCount > 0 && <span> · </span>}
                  {successBanner.mergedCount > 0 && (
                    <span>
                      {successBanner.mergedCount} bedeutungsgleiche Einträge
                      zusammengefasst
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {successBanner.packageIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => onStudyPackage(successBanner.packageIds[0])}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Direkt lernen</span>
              </button>
              {successBanner.packageIds.length > 1 ? (
                <button
                  type="button"
                  onClick={onNavigatePackages}
                  className="px-4 py-2 text-xs font-medium text-emerald-900 dark:text-emerald-200 bg-white dark:bg-[#161B22] border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/60 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Gruppe ansehen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onOpenPackageCards(successBanner.packageIds[0])
                  }
                  className="px-4 py-2 text-xs font-medium text-emerald-900 dark:text-emerald-200 bg-white dark:bg-[#161B22] border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/60 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Karten öffnen
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 flex items-start gap-3 text-rose-950 dark:text-rose-100 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* Format Tabs + Group & Subject Settings */}
      <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 study-card-shadow">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-6 items-start">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Importquelle wählen (lokale Verarbeitung)
              </div>
              <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-stone-100 dark:bg-[#11151C] rounded-xl">
                <button
                  type="button"
                  onClick={() => setFormat("csv")}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    format === "csv"
                      ? "bg-white dark:bg-[#1C222B] text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>CSV / Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat("docx")}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    format === "docx"
                      ? "bg-white dark:bg-[#1C222B] text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Word (.docx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat("pdf")}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    format === "pdf"
                      ? "bg-white dark:bg-[#1C222B] text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>PDF (.pdf)</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consolidateDuplicates}
                  onChange={(e) => handleToggleConsolidation(e.target.checked)}
                  className="mt-0.5 rounded border-stone-300 dark:border-slate-700 dark:bg-[#11151C] text-sky-700 focus:ring-sky-700"
                />
                <span>
                  <strong className="font-semibold text-slate-900 dark:text-slate-100">
                    Doppelte &amp; gleiche Einträge innerhalb dieser Liste bereinigen:
                  </strong>{" "}
                  Exakt doppelte Zeilen werden einmalig übernommen; gleiche
                  Antworten zusammengefasst.
                </span>
              </label>

              {(selectedSubject === "sprachen" ||
                packagePlans.some((p) => p.detectedSubject === "sprachen")) && (
                <label className="flex items-start gap-2.5 text-xs text-slate-800 dark:text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={
                      bidirectionalOverride !== null
                        ? bidirectionalOverride
                        : true
                    }
                    onChange={(e) =>
                      handleToggleBidirectional(e.target.checked)
                    }
                    className="mt-0.5 rounded border-stone-300 dark:border-slate-700 dark:bg-[#11151C] text-sky-700 focus:ring-sky-700"
                  />
                  <span>
                    <strong className="font-semibold text-slate-900 dark:text-slate-100">
                      Vokabeln in beide Richtungen erstellen (Hin &amp; Rück):
                    </strong>{" "}
                    Jede Vokabel erzeugt 2 Karten (z. B. 50 Vokabeln = 100
                    Karten im Paket).
                  </span>
                </label>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-4 lg:pt-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-stone-200 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="import-list-name"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5"
                >
                  <FolderPlus className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span>Name der Paket-Gruppe</span>
                </label>
                <input
                  id="import-list-name"
                  type="text"
                  dir="auto"
                  value={listName}
                  onChange={(e) => handleListNameChange(e.target.value)}
                  placeholder={`z. B. Biologie Klausur (${fallbackDefaultName})`}
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                />
              </div>

              <div>
                <label
                  htmlFor="import-subject-select"
                  className="block text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5"
                >
                  Lernbereich / Fachgebiet
                </label>
                <select
                  id="import-subject-select"
                  value={selectedSubject}
                  onChange={(e) =>
                    handleSubjectChange(e.target.value as LearningSubject)
                  }
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

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Jede importierte Liste wird als eigene Gruppe gespeichert. Bis 50
              Einträge entsteht genau{" "}
              <strong className="font-medium text-slate-700 dark:text-slate-200">1 Paket</strong>;
              darüber wird automatisch in 50er-Pakete aufgeteilt.
            </p>
          </div>
        </div>

        {/* Dropzone */}
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFileUpload(e.dataTransfer.files?.[0]);
          }}
          className="flex flex-col items-center justify-center border border-dashed border-stone-300 dark:border-slate-700 hover:border-sky-600 dark:hover:border-sky-500 rounded-2xl p-8 text-center bg-[#FAF9F6] dark:bg-[#1C222B] transition-colors cursor-pointer"
        >
          <Upload className="w-7 h-7 text-slate-400 dark:text-slate-500 mb-3" />
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {isLoading
              ? "Dokument wird lokal analysiert..."
              : format === "csv"
                ? "CSV-, TSV- oder Textdatei hier ablegen oder auswählen"
                : format === "docx"
                  ? "Word-Dokument / Arbeitsblatt (.docx) hier ablegen oder auswählen"
                  : "PDF-Dokument / Arbeitsblatt (.pdf) hier ablegen oder auswählen"}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Geeignet für Vokabeln, Arbeitsblätter, Definitionen, Formeln, Fakten
            oder Fragen mit Antworten (inkl. Hoch- &amp; Tiefstellung).
          </p>
          <input
            type="file"
            accept=".csv,.tsv,.txt,.docx,.pdf"
            onChange={(e) => {
              handleFileUpload(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>

        {/* Direct Text / CSV Paste Option */}
        {format === "csv" && (
          <div>
            <label
              htmlFor="csv-paste-area"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2"
            >
              Oder Inhalte direkt einfügen (z. B. „Frage - Antwort“, „Formel = Lösung“ oder CSV mit Semikolon)
            </label>
            <textarea
              id="csv-paste-area"
              dir="auto"
              rows={4}
              value={csvRaw}
              onChange={(e) => handleCsvInput(e.target.value)}
              placeholder={
                "Photosynthese - Umwandlung von Lichtenergie in Glukose\nSatz des Pythagoras = a² + b² = c²\nla casa;das Haus;Vivo en una casa grande."
              }
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono-tabular bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
            />
          </div>
        )}

        {/* CSV Column Mapping Controls */}
        {format === "csv" && csvParsed && csvParsed.headers.length > 0 && (
          <div className="pt-4 border-t border-stone-100 dark:border-slate-800">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-3">
              Spaltenzuordnung prüfen
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  { key: "termCol", label: "Vorderseite / Frage *" },
                  { key: "translationCol", label: "Rückseite / Antwort *" },
                  { key: "exampleCol", label: "Beispiel / Kontext" },
                  { key: "noteCol", label: "Merkhilfe" },
                ] as const
              ).map((col) => (
                <div key={col.key}>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    {col.label}
                  </label>
                  <select
                    value={csvMapping[col.key]}
                    onChange={(e) =>
                      updateCsvColumnMapping(col.key, Number(e.target.value))
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  >
                    <option value={-1}>— Nicht zugeordnet —</option>
                    {csvParsed.headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h || `Spalte ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Consolidation Notice */}
      {hasConsolidationEvents && consolidationStats && (
        <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sky-950 dark:text-sky-100">
          <div className="text-xs sm:text-sm space-y-0.5">
            <div className="font-semibold">
              Bereinigung innerhalb dieser Liste angewendet (
              {consolidationStats.inputCount} → {consolidationStats.outputCount}{" "}
              Einträge)
            </div>
            <div className="text-xs text-sky-900 dark:text-sky-300">
              {consolidationStats.exactDuplicatesRemoved > 0 && (
                <span>
                  {consolidationStats.exactDuplicatesRemoved} exakt doppelte{" "}
                  {consolidationStats.exactDuplicatesRemoved === 1
                    ? "Eintrag"
                    : "Einträge"}{" "}
                  entfernt
                </span>
              )}
              {consolidationStats.exactDuplicatesRemoved > 0 &&
                consolidationStats.sameMeaningMerged > 0 && <span> · </span>}
              {consolidationStats.sameMeaningMerged > 0 && (
                <span>
                  {consolidationStats.sameMeaningMerged} bedeutungsgleiche
                  Einträge zusammengefasst
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Planned New Group Preview */}
      {draftRows.length > 0 && packagePlans.length > 0 && (
        <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 study-card-shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Neue Gruppe: „{effectiveListName}“ ({packagePlans.length}{" "}
                {packagePlans.length === 1 ? "Paket" : "Pakete"})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {packagePlans.length === 1
                  ? `Bis ${VOCAB_PACKAGE_SIZE} Einträge (${selectedCount}) bleiben in genau 1 Paket.`
                  : `Die ${selectedCount} Einträge werden zufällig auf ${packagePlans.length} Pakete (je max. ${VOCAB_PACKAGE_SIZE}) aufgeteilt.`}
                {separatedOppositesCount > 0 && (
                  <span className="text-sky-700 dark:text-sky-400 font-medium">
                    {" "}
                    ({separatedOppositesCount}{" "}
                    {separatedOppositesCount === 1
                      ? "Gegenbegriff"
                      : "Gegenbegriffe"}{" "}
                    getrennt)
                  </span>
                )}
              </p>
            </div>
            {packagePlans.length > 1 && (
              <button
                type="button"
                onClick={handleReshuffleDrafts}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-stone-100 dark:bg-[#1C222B] hover:bg-stone-200 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Neu zufällig mischen</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {packagePlans.map((plan) => {
              const count = liveCountsByPackage.get(plan.packageId) || 0;
              const finalCards = plan.bidirectional ? count * 2 : count;
              return (
                <div
                  key={plan.packageId}
                  className="border border-stone-200 dark:border-slate-800 rounded-xl p-3.5 bg-[#FAF9F6] dark:bg-[#1C222B] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono-tabular font-semibold text-slate-500 dark:text-slate-400">
                      Paket {String(plan.packageNumber).padStart(2, "0")}
                    </span>
                    <span className="font-mono-tabular font-semibold text-sky-700 dark:text-sky-400">
                      {plan.bidirectional
                        ? `${count} Vok. → ${finalCards} Karten`
                        : `${count} / ${VOCAB_PACKAGE_SIZE} Karten`}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={
                      customPlanTitles[plan.packageId] ?? plan.suggestedTitle
                    }
                    onChange={(e) =>
                      setCustomPlanTitles((prev) => ({
                        ...prev,
                        [plan.packageId]: e.target.value,
                      }))
                    }
                    aria-label={`Paketname für Paket ${plan.packageNumber}`}
                    className="w-full px-2.5 py-1.5 text-xs sm:text-sm font-medium bg-white dark:bg-[#11151C] border border-stone-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                  />
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Bereich:{" "}
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {plan.subjectLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Editable Preview Table */}
      {draftRows.length > 0 && (
        <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl overflow-hidden study-card-shadow">
          <div className="px-6 py-4 border-b border-stone-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Kartenvorschau ({selectedCount} von {draftRows.length}{" "}
                ausgewählt)
              </h2>
              {extractionMethod && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Methode: {extractionMethod} · Einträge können vor dem
                  Speichern angepasst werden.
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={handleConfirmImport}
              className="px-5 py-2.5 text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 disabled:bg-stone-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {(() => {
                const bidirSelected = draftRows.filter(
                  (r) =>
                    r.selected &&
                    r.term.trim() &&
                    r.translation.trim() &&
                    packagePlans.find((p) => p.packageId === r.packageId)
                      ?.bidirectional
                ).length;
                const totalResultCards = selectedCount + bidirSelected;
                return packagePlans.length === 1
                  ? bidirSelected > 0
                    ? `${selectedCount} Vokabeln (${totalResultCards} Karten) importieren`
                    : `${selectedCount} Karten als Paket „${effectiveListName}“ importieren`
                  : bidirSelected > 0
                    ? `${selectedCount} Vokabeln (${totalResultCards} Karten) in ${packagePlans.length} Pakete importieren`
                    : `${selectedCount} Karten in ${packagePlans.length} Pakete importieren`;
              })()}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#FAF9F6] dark:bg-[#1C222B] border-b border-stone-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-5 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={selectedCount === draftRows.length}
                      onChange={(e) =>
                        setDraftRows((prev) =>
                          prev.map((r) => ({ ...r, selected: e.target.checked }))
                        )
                      }
                      className="rounded border-stone-300 dark:border-slate-700 dark:bg-[#11151C]"
                    />
                  </th>
                  <th className="py-2.5 px-2 font-medium">
                    Vorderseite (Begriff / Frage)
                  </th>
                  <th className="py-2.5 px-2 font-medium">
                    Rückseite (Antwort / Übersetzung)
                  </th>
                  <th className="py-2.5 px-2 font-medium">Beispiel / Kontext</th>
                  {previewPackageOptions.length > 1 && (
                    <th className="py-2.5 px-2 font-medium">Paket</th>
                  )}
                  <th className="py-2.5 pl-2 pr-5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-slate-800/80">
                {draftRows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="py-2.5 pl-5 pr-2 pt-3.5">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) =>
                          setDraftRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? { ...r, selected: e.target.checked }
                                : r
                            )
                          )
                        }
                        className="rounded border-stone-300 dark:border-slate-700 dark:bg-[#11151C]"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        dir="auto"
                        value={row.term}
                        onChange={(e) =>
                          setDraftRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, term: e.target.value } : r
                            )
                          )
                        }
                        className="w-full min-w-[140px] px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-[#11151C] border border-stone-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
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
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        dir="auto"
                        value={row.translation}
                        onChange={(e) =>
                          setDraftRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? { ...r, translation: e.target.value }
                                : r
                            )
                          )
                        }
                        className="w-full min-w-[160px] px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-[#11151C] border border-stone-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
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
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        dir="auto"
                        value={row.exampleSentence || ""}
                        placeholder="Optionaler Kontext"
                        onChange={(e) =>
                          setDraftRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? { ...r, exampleSentence: e.target.value }
                                : r
                            )
                          )
                        }
                        className="w-full min-w-[180px] px-2.5 py-1.5 text-xs bg-white dark:bg-[#11151C] border border-stone-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                      />
                    </td>
                    {previewPackageOptions.length > 1 && (
                      <td className="py-2 px-2">
                        <select
                          value={row.packageId}
                          onChange={(e) =>
                            setDraftRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? { ...r, packageId: Number(e.target.value) }
                                  : r
                              )
                            )
                          }
                          className="px-2 py-1.5 text-xs border border-stone-200 dark:border-slate-700 rounded-lg bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 max-w-[220px]"
                        >
                          {previewPackageOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {String(p.number).padStart(2, "0")} · {p.title}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="py-2.5 pl-2 pr-5">
                      <button
                        type="button"
                        onClick={() =>
                          setDraftRows((prev) =>
                            prev.filter((r) => r.id !== row.id)
                          )
                        }
                        aria-label="Zeile entfernen"
                        className="p-1 text-slate-400 dark:text-slate-500 hover:text-rose-700 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
