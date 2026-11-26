import { useMemo, useState } from "react";
import {
  Check,
  Edit3,
  FolderOpen,
  Layers,
  Play,
  Plus,
  Search,
  Shuffle,
  Split,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  getPackageSubjectContext,
  SUBJECT_DEFINITIONS,
} from "../data/subjects";
import {
  LearningSubject,
  PackageNextFilter,
  VocabCard,
  VocabPackage,
} from "../types/vocab";
import { findOppositePairs } from "../utils/antonyms";
import { createMissingReverseCards } from "../utils/topicOrganizer";

interface PackagesGridProps {
  packages: VocabPackage[];
  cards: VocabCard[];
  onStudyPackage: (packageId: number) => void;
  onStudyGroup: (groupId: string) => void;
  onOpenPackageCards: (packageId: number) => void;
  onCreateCardInPackage: (packageId: number) => void;
  onNavigateImport: () => void;
  onUpdatePackage: (packageId: number, updates: Partial<VocabPackage>) => void;
  onRenameGroup: (groupId: string, nextName: string) => void;
  onDeletePackage: (packageId: number) => void;
  onDeleteGroup: (groupId: string) => void;
  onShufflePackage: (packageId: number) => void;
  onSeparatePackageOpposites: (packageId: number) => void;
  onCompleteBidirectionalPackage: (packageId: number) => void;
}

type StatusFilter = "all" | "filled" | "wrong";

interface PackageGroup {
  groupId: string;
  groupName: string;
  isRealGroup: boolean;
  packages: VocabPackage[];
  totalCards: number;
  wrongCards: number;
  domainLabels: string[];
}

export function PackagesGrid({
  packages,
  cards,
  onStudyPackage,
  onStudyGroup,
  onOpenPackageCards,
  onCreateCardInPackage,
  onNavigateImport,
  onUpdatePackage,
  onRenameGroup,
  onDeletePackage,
  onDeleteGroup,
  onShufflePackage,
  onSeparatePackageOpposites,
  onCompleteBidirectionalPackage,
}: PackagesGridProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [justShuffledId, setJustShuffledId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSubject, setEditSubject] = useState<LearningSubject>("auto");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(
    null
  );

  const packageStats = useMemo(() => {
    const map = new Map<
      number,
      {
        total: number;
        learned: number;
        wrong: number;
        oppositePairs: number;
        missingReverseCount: number;
        domainLabel: string;
        subject: LearningSubject;
      }
    >();
    const cardsByPkg = new Map<number, VocabCard[]>();
    packages.forEach((p) => {
      cardsByPkg.set(p.id, []);
    });
    cards.forEach((c) => {
      cardsByPkg.get(c.packageId)?.push(c);
    });
    packages.forEach((p) => {
      const pkgCards = cardsByPkg.get(p.id) || [];
      const ctx = getPackageSubjectContext(p, pkgCards);
      const missingReverseCount =
        ctx.isLanguageDeck && pkgCards.length > 0
          ? createMissingReverseCards(pkgCards).length
          : 0;
      map.set(p.id, {
        total: pkgCards.length,
        learned: pkgCards.filter((c) => c.srs.repetitions > 0).length,
        wrong: pkgCards.filter((c) => c.lastWrong).length,
        oppositePairs:
          pkgCards.length >= 2 ? findOppositePairs(pkgCards).length : 0,
        missingReverseCount,
        domainLabel: pkgCards.length > 0 ? ctx.displayLabel : "Noch leer",
        subject: ctx.subject,
      });
    });
    return map;
  }, [cards, packages]);

  const filteredPackages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages.filter((pkg) => {
      const stats = packageStats.get(pkg.id)!;
      if (statusFilter === "filled" && stats.total === 0) return false;
      if (statusFilter === "wrong" && stats.wrong === 0) return false;

      if (q) {
        const matches =
          pkg.title.toLowerCase().includes(q) ||
          (pkg.groupName || "").toLowerCase().includes(q) ||
          pkg.description.toLowerCase().includes(q) ||
          stats.domainLabel.toLowerCase().includes(q) ||
          String(pkg.number).padStart(2, "0").includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [packageStats, packages, search, statusFilter]);

  const groupedPackages = useMemo<PackageGroup[]>(() => {
    const groupsMap = new Map<string, PackageGroup>();

    for (const pkg of filteredPackages) {
      const hasGroup = Boolean(pkg.groupId);
      const gid = pkg.groupId || `standalone-${pkg.id}`;
      const gname = pkg.groupName || pkg.title;
      const stats = packageStats.get(pkg.id)!;

      let grp = groupsMap.get(gid);
      if (!grp) {
        grp = {
          groupId: gid,
          groupName: gname,
          isRealGroup: hasGroup,
          packages: [],
          totalCards: 0,
          wrongCards: 0,
          domainLabels: [],
        };
        groupsMap.set(gid, grp);
      }

      grp.packages.push(pkg);
      grp.totalCards += stats.total;
      grp.wrongCards += stats.wrong;
      if (
        stats.total > 0 &&
        stats.domainLabel &&
        !grp.domainLabels.includes(stats.domainLabel)
      ) {
        grp.domainLabels.push(stats.domainLabel);
      }
    }

    return Array.from(groupsMap.values());
  }, [filteredPackages, packageStats]);

  const totalGroupsCount = useMemo(() => {
    const ids = new Set<string>();
    packages.forEach((p) => ids.add(p.groupId || `standalone-${p.id}`));
    return ids.size;
  }, [packages]);

  const startEditing = (pkg: VocabPackage) => {
    setEditingId(pkg.id);
    setEditTitle(pkg.title);
    setEditDesc(pkg.description);
    setEditSubject(pkg.subject || "auto");
  };

  const saveEditing = (pkg: VocabPackage) => {
    const trimmed = editTitle.trim();
    const pkgCards = cards.filter((c) => c.packageId === pkg.id);
    const nextCtx = getPackageSubjectContext(
      { ...pkg, subject: editSubject, subjectLabel: undefined },
      pkgCards
    );
    onUpdatePackage(pkg.id, {
      title: trimmed || `Paket ${String(pkg.number).padStart(2, "0")}`,
      description: editDesc.trim(),
      subject: editSubject,
      subjectLabel: nextCtx.displayLabel,
    });
    setEditingId(null);
  };

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-stone-200 dark:border-slate-800">
        <div>
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-1 tabular-nums">
            {packages.length === 0
              ? "Pakete & Gruppen werden beim Import oder Erstellen angelegt"
              : `${totalGroupsCount} ${
                  totalGroupsCount === 1 ? "Liste / Gruppe" : "Listen / Gruppen"
                } · ${packages.length} ${
                  packages.length === 1 ? "Paket" : "Pakete"
                } · ${cards.length} Karten gesamt`}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            {packages.length === 0
              ? "Paket-Gruppen"
              : `Paket-Gruppen (${totalGroupsCount})`}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {packages.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Gruppe, Paket oder Fach..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-white dark:bg-[#161B22] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
              />
            </div>
          )}
          <button
            type="button"
            onClick={onNavigateImport}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-4 h-4" />
            <span>Neue Liste importieren</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      {packages.length > 0 && (
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-1 p-1 bg-stone-200/60 dark:bg-[#1C222B] rounded-xl overflow-x-auto">
            {(
              [
                { id: "all", label: "Alle" },
                { id: "filled", label: "Mit Karten" },
                { id: "wrong", label: "Mit Fehlern" },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st.id
                    ? "bg-white dark:bg-[#161B22] text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Groups Section List */}
      {packages.length === 0 ? (
        <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-4 study-card-shadow">
          <Layers className="w-10 h-10 text-stone-300 dark:text-slate-600 mx-auto" />
          <div className="space-y-1.5 max-w-lg mx-auto">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Noch keine Pakete vorhanden
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Importieren Sie Vokabeln, Fachbegriffe, Formeln oder
              Prüfungsfragen. Jede Liste bildet eine eigene Gruppe (ab 51
              Einträgen automatisch in 50er-Paketen).
            </p>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={onNavigateImport}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 rounded-xl transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Erste Liste importieren</span>
            </button>
          </div>
        </div>
      ) : groupedPackages.length === 0 ? (
        <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-12 text-center study-card-shadow">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Keine Gruppen oder Pakete entsprechen Ihrer aktuellen Filterauswahl.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setSearch("");
            }}
            className="mt-4 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 border border-stone-300 dark:border-slate-700 rounded-lg hover:bg-stone-50 dark:hover:bg-[#1C222B] cursor-pointer"
          >
            Filter zurücksetzen
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {groupedPackages.map((group) => {
            const isRenamingGroup = editingGroupId === group.groupId;

            return (
              <div key={group.groupId} className="space-y-4">
                {/* Group Header (flat editorial rule — no card-within-card nesting) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-stone-200 dark:border-slate-800">
                  <div className="min-w-0 space-y-1">
                    {isRenamingGroup ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editGroupName}
                          onChange={(e) => setEditGroupName(e.target.value)}
                          placeholder="Gruppenname"
                          className="px-3 py-1.5 text-sm font-semibold bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (editGroupName.trim()) {
                              onRenameGroup(
                                group.groupId,
                                editGroupName.trim()
                              );
                            }
                            setEditingGroupId(null);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 rounded-lg cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Speichern</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingGroupId(null)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-700 rounded-lg cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Abbrechen</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                        <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                          {group.groupName}
                        </h2>
                        {group.isRealGroup && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGroupId(group.groupId);
                              setEditGroupName(group.groupName);
                            }}
                            aria-label={`Gruppe ${group.groupName} umbenennen`}
                            className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                      <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">
                        {group.packages.length}{" "}
                        {group.packages.length === 1 ? "Paket" : "Pakete"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {group.totalCards}{" "}
                        {group.totalCards === 1 ? "Karte" : "Karten"}
                      </span>
                      {group.domainLabels.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{group.domainLabels.join(", ")}</span>
                        </>
                      )}
                      {group.wrongCards > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-rose-700 dark:text-rose-400 font-medium tabular-nums">
                            {group.wrongCards} falsch
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {group.isRealGroup && group.totalCards > 0 && (
                      <button
                        type="button"
                        onClick={() => onStudyGroup(group.groupId)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800/80 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>
                          {group.packages.length > 1
                            ? "Ganze Gruppe lernen"
                            : "Lernen"}
                        </span>
                      </button>
                    )}

                    {group.isRealGroup &&
                      (confirmDeleteGroupId === group.groupId ? (
                        <span className="inline-flex items-center gap-2 text-xs bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/80 rounded-lg px-3 py-1.5 text-rose-800 dark:text-rose-200">
                          <span>Gruppe löschen?</span>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteGroup(group.groupId);
                              setConfirmDeleteGroupId(null);
                            }}
                            className="font-semibold underline cursor-pointer"
                          >
                            Ja
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteGroupId(null)}
                            className="text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            Nein
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteGroupId(group.groupId)}
                          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-400 bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Gruppe löschen</span>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Packages inside this Group */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {group.packages.map((pkg) => {
                    const stats = packageStats.get(pkg.id)!;
                    const learnedPct =
                      stats.total > 0
                        ? Math.round((stats.learned / stats.total) * 100)
                        : 0;
                    const isEditing = editingId === pkg.id;
                    const wrongSelected =
                      pkg.nextSessionFilter === "wrong-only";
                    const canLearn =
                      stats.total > 0 && (!wrongSelected || stats.wrong > 0);

                    return (
                      <article
                        key={pkg.id}
                        className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4 study-card-shadow"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-mono-tabular font-semibold text-slate-700 dark:text-slate-300">
                                Paket {String(pkg.number).padStart(2, "0")}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">
                                {stats.domainLabel}
                              </span>
                            </div>

                            {!isEditing && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => startEditing(pkg)}
                                  aria-label={`Paket ${pkg.number} bearbeiten`}
                                  className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                {confirmDeleteId === pkg.id ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-md px-1.5 py-0.5 text-rose-800 dark:text-rose-200">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onDeletePackage(pkg.id);
                                        setConfirmDeleteId(null);
                                      }}
                                      className="font-semibold underline cursor-pointer"
                                    >
                                      Löschen
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="text-slate-600 dark:text-slate-300 cursor-pointer ml-1"
                                    >
                                      Abbrechen
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(pkg.id)}
                                    aria-label={`Paket ${pkg.number} löschen`}
                                    className="p-1 text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-2.5 mt-1">
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="Paketname"
                                className="w-full px-3 py-1.5 text-sm font-medium bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                              />
                              <select
                                value={editSubject}
                                onChange={(e) =>
                                  setEditSubject(e.target.value as LearningSubject)
                                }
                                aria-label="Fachgebiet wählen"
                                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                              >
                                <option value="auto">
                                  Fachgebiet automatisch erkennen
                                </option>
                                {SUBJECT_DEFINITIONS.map((sub) => (
                                  <option key={sub.id} value={sub.id}>
                                    {sub.label}
                                  </option>
                                ))}
                              </select>
                              <textarea
                                rows={2}
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                placeholder="Beschreibung (optional)"
                                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveEditing(pkg)}
                                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 rounded-lg cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Speichern</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 border border-stone-200 dark:border-slate-700 rounded-lg cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Abbrechen</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                                {pkg.title}
                              </h3>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                                {pkg.description ||
                                  "Inhalte werden automatisch nach Thema und Sprachpaar eingeordnet."}
                              </p>
                              {pkg.sourceTitles && pkg.sourceTitles.length > 0 && (
                                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  Quellen: {pkg.sourceTitles.join(", ")}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span className="text-slate-600 dark:text-slate-400 tabular-nums">
                                {stats.total}{" "}
                                {stats.total === 1 ? "Karte" : "Karten"}
                                {stats.wrong > 0 && (
                                  <span className="text-rose-700 dark:text-rose-400 font-medium">
                                    {" "}
                                    · {stats.wrong} falsch
                                  </span>
                                )}
                              </span>
                              <span
                                className={`tabular-nums ${
                                  stats.total === 0
                                    ? "text-slate-400 dark:text-slate-500"
                                    : learnedPct === 100
                                      ? "text-emerald-700 dark:text-emerald-400 font-medium"
                                      : "text-slate-500 dark:text-slate-400 font-medium"
                                }`}
                              >
                                {stats.total > 0
                                  ? `${stats.learned}/${stats.total} gelernt (${learnedPct}%)`
                                  : "Leer"}
                              </span>
                            </div>
                            <div
                              role="progressbar"
                              aria-valuenow={learnedPct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`Lernfortschritt ${pkg.title}: ${stats.learned} von ${stats.total} Karten gelernt`}
                              className="w-full h-1 bg-stone-100 dark:bg-slate-800 rounded-full overflow-hidden"
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

                          {/* Next Session Scope Selector per Package */}
                          {stats.total > 0 && (
                            <div className="pt-2 border-t border-stone-100 dark:border-slate-800">
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                                Nächster Durchgang:
                              </div>
                              <div className="grid grid-cols-2 gap-1 p-0.5 bg-stone-100 dark:bg-[#11151C] rounded-lg">
                                {(
                                  [
                                    { id: "all", label: "Alle Karten" },
                                    {
                                      id: "wrong-only",
                                      label: `Nur falsche (${stats.wrong})`,
                                    },
                                  ] as Array<{
                                    id: PackageNextFilter;
                                    label: string;
                                  }>
                                ).map((opt) => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() =>
                                      onUpdatePackage(pkg.id, {
                                        nextSessionFilter: opt.id,
                                      })
                                    }
                                    className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
                                      pkg.nextSessionFilter === opt.id
                                        ? "bg-white dark:bg-[#1C222B] text-slate-900 dark:text-slate-100 shadow-sm"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Complete Reverse Direction for existing single-direction vocabulary sets */}
                          {stats.missingReverseCount > 0 && (
                            <div className="pt-2 border-t border-stone-100 dark:border-slate-800 flex items-center justify-between gap-2">
                              <span className="text-[11px] text-sky-800 dark:text-sky-300 font-medium">
                                +{stats.missingReverseCount} Rückkarten möglich
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onCompleteBidirectionalPackage(pkg.id)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <span>Beide Richtungen (×2)</span>
                              </button>
                            </div>
                          )}

                          {/* Opposite Separation Action when a package contains antonyms */}
                          {stats.oppositePairs > 0 &&
                            group.packages.length > 1 && (
                              <div className="pt-2 border-t border-stone-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                                  {stats.oppositePairs}{" "}
                                  {stats.oppositePairs === 1
                                    ? "Gegenteil-Paar"
                                    : "Gegenteil-Paare"}{" "}
                                  enthalten
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onSeparatePackageOpposites(pkg.id)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <Split className="w-3 h-3" />
                                  <span>Gegenteile trennen</span>
                                </button>
                              </div>
                            )}

                          {/* Actions */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100 dark:border-slate-800">
                            <div className="flex items-center gap-1.5">
                              {stats.total > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenPackageCards(pkg.id)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-stone-100 dark:bg-[#1C222B] hover:bg-stone-200 dark:hover:bg-[#252D38] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  Karten
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCreateCardInPackage(pkg.id)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-stone-100 dark:bg-[#1C222B] hover:bg-stone-200 dark:hover:bg-[#252D38] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Karte</span>
                                </button>
                              )}
                              {stats.total > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onShufflePackage(pkg.id);
                                    setJustShuffledId(pkg.id);
                                    window.setTimeout(() => {
                                      setJustShuffledId((curr) =>
                                        curr === pkg.id ? null : curr
                                      );
                                    }, 1800);
                                  }}
                                  title="Karten innerhalb dieses Pakets mischen"
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                                    justShuffledId === pkg.id
                                      ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200"
                                      : pkg.shuffleOrder
                                        ? "border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400 hover:bg-sky-50/50 dark:hover:bg-sky-950/40"
                                        : "border-stone-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-stone-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-white"
                                  }`}
                                >
                                  <Shuffle className="w-3 h-3" />
                                  <span>
                                    {justShuffledId === pkg.id
                                      ? "Gemischt"
                                      : "Mischen"}
                                  </span>
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              disabled={!canLearn}
                              onClick={() => onStudyPackage(pkg.id)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white disabled:bg-stone-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Play className="w-3 h-3" />
                              <span>Lernen</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
