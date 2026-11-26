import { useMemo, useState } from "react";
import { Edit3, Plus, Search, Trash2, Upload } from "lucide-react";
import { AppSettings, SrsState, VocabCard, VocabPackage } from "../types/vocab";
import { getStateLabel } from "../utils/srs";
import { FormattedText, stripFormattingMarkers } from "./FormattedText";

interface CardLibraryProps {
  packages: VocabPackage[];
  cards: VocabCard[];
  settings: AppSettings;
  filterPackageId: number | "all";
  onChangeFilterPackage: (pkgId: number | "all") => void;
  onCreateCard: (defaultPkgId: number) => void;
  onEditCard: (card: VocabCard) => void;
  onDeleteCard: (cardId: string) => void;
  onNavigateImport: () => void;
}

export function CardLibrary({
  packages,
  cards,
  settings: _settings,
  filterPackageId,
  onChangeFilterPackage,
  onCreateCard,
  onEditCard,
  onDeleteCard,
  onNavigateImport,
}: CardLibraryProps) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<
    "all" | "wrong" | SrsState
  >("all");

  const packageMap = useMemo(() => {
    const map = new Map<number, VocabPackage>();
    packages.forEach((p) => map.set(p.id, p));
    return map;
  }, [packages]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (filterPackageId !== "all" && c.packageId !== filterPackageId)
        return false;
      if (stateFilter === "wrong" && !c.lastWrong) return false;
      if (
        stateFilter !== "all" &&
        stateFilter !== "wrong" &&
        c.srs.state !== stateFilter
      ) {
        return false;
      }
      if (q) {
        const rawHay = `${c.term} ${c.translation} ${c.topic || ""} ${c.partOfSpeech || ""} ${c.exampleSentence || ""} ${c.note || ""}`;
        const hay = `${rawHay} ${stripFormattingMarkers(rawHay)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cards, filterPackageId, search, stateFilter]);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-stone-200 dark:border-slate-800">
        <div>
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-1 tabular-nums">
            Kartenverwaltung · {filteredCards.length} von {cards.length} Karten angezeigt
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Lernkarten
          </h1>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onNavigateImport}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161B22] border border-stone-300 dark:border-slate-700 hover:bg-stone-50 dark:hover:bg-[#1C222B] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-4 h-4" />
            <span>Importieren</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onCreateCard(
                filterPackageId === "all"
                  ? packages[0]?.id ?? 0
                  : filterPackageId
              )
            }
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Neue Lernkarte</span>
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-4 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            dir="auto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Vorderseite, Antwort, Kategorie oder Beispiel durchsuchen..."
            className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-white dark:bg-[#161B22] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
          />
        </div>

        <select
          aria-label="Nach Paket filtern"
          value={filterPackageId === "all" ? "all" : String(filterPackageId)}
          onChange={(e) => {
            const v = e.target.value;
            onChangeFilterPackage(v === "all" ? "all" : Number(v));
          }}
          className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#161B22] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
        >
          <option value="all">Alle Pakete</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.groupName && p.groupName !== p.title
                ? `${p.groupName} — ${p.title}`
                : p.title}{" "}
              (Paket {String(p.number).padStart(2, "0")})
            </option>
          ))}
        </select>
      </div>

      {/* Status Segmented Bar */}
      <div className="flex items-center gap-1 p-1 bg-stone-200/60 dark:bg-[#1C222B] rounded-xl w-fit max-w-full overflow-x-auto">
        {(
          [
            { id: "all", label: "Alle" },
            { id: "wrong", label: "Zuletzt falsch" },
            { id: "neu", label: "Neu" },
            { id: "lernen", label: "Im Aufbau" },
            { id: "wiederholen", label: "Wiederholung" },
            { id: "gemeistert", label: "Gemeistert" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStateFilter(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              stateFilter === tab.id
                ? "bg-white dark:bg-[#161B22] text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cards Table */}
      {filteredCards.length === 0 ? (
        <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl p-12 text-center study-card-shadow">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {cards.length === 0
              ? "Noch keine eigenen Lernkarten vorhanden. Erstellen Sie Ihre erste Karte oder importieren Sie eine CSV-, Word- oder PDF-Datei."
              : "Keine Lernkarten für diesen Filter gefunden."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() =>
                onCreateCard(
                  filterPackageId === "all"
                    ? packages[0]?.id ?? 0
                    : filterPackageId
                )
              }
              className="px-4 py-2 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 rounded-lg cursor-pointer"
            >
              Lernkarte erstellen
            </button>
            <button
              type="button"
              onClick={onNavigateImport}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-stone-300 dark:border-slate-700 rounded-lg hover:bg-stone-50 dark:hover:bg-[#1C222B] cursor-pointer"
            >
              Datei importieren
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl overflow-hidden study-card-shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-[#FAF9F6] dark:bg-[#1C222B]">
                  <th className="py-3 pl-5 pr-3 font-medium">
                    Vorderseite (Begriff / Frage)
                  </th>
                  <th className="py-3 px-3 font-medium">
                    Rückseite (Antwort / Übersetzung)
                  </th>
                  <th className="py-3 px-3 font-medium">Paket</th>
                  <th className="py-3 px-3 font-medium">Lernstand</th>
                  <th className="py-3 px-3 font-medium text-right">Gewusst</th>
                  <th className="py-3 pl-3 pr-5 font-medium text-right">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-slate-800/80 text-sm">
                {filteredCards.map((card) => {
                  const pkg = packageMap.get(card.packageId);

                  return (
                    <tr
                      key={card.id}
                      className="hover:bg-stone-50/80 dark:hover:bg-[#1C222B]/80 transition-colors"
                    >
                      <td className="py-3.5 pl-5 pr-3 align-top">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              dir="auto"
                              className="font-semibold text-slate-900 dark:text-slate-100"
                            >
                              <FormattedText text={card.term} />
                            </span>
                          </div>
                          {(card.topic || card.partOfSpeech || card.exampleSentence) && (
                            <div
                              dir="auto"
                              className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 max-w-md"
                            >
                              {(card.topic || card.partOfSpeech) && (
                                <span className="text-slate-600 dark:text-slate-300 font-medium">
                                  {card.topic || card.partOfSpeech}
                                </span>
                              )}
                              {(card.topic || card.partOfSpeech) &&
                                card.exampleSentence &&
                                " · "}
                              {card.exampleSentence && (
                                <FormattedText text={card.exampleSentence} />
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td
                        dir="auto"
                        className="py-3.5 px-3 align-top text-slate-800 dark:text-slate-200"
                      >
                        <FormattedText text={card.translation} />
                      </td>
                      <td className="py-3.5 px-3 align-top text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {pkg?.title || `Paket ${card.packageId}`}
                        </span>
                        {pkg?.groupName && pkg.groupName !== pkg.title && (
                          <span className="text-slate-400 dark:text-slate-500">
                            {" "}
                            · {pkg.groupName}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 align-top text-xs whitespace-nowrap">
                        <span
                          className={
                            card.lastWrong
                              ? "text-rose-700 dark:text-rose-400 font-medium"
                              : card.srs.state === "gemeistert"
                                ? "text-emerald-700 dark:text-emerald-400 font-medium"
                                : "text-slate-600 dark:text-slate-400"
                          }
                        >
                          {getStateLabel(card.srs.state)}
                          {card.lastWrong ? " · zuletzt falsch" : ""}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 align-top text-right font-mono-tabular text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {card.srs.repetitions > 0
                          ? `${card.srs.repetitions}×`
                          : "—"}
                      </td>
                      <td className="py-3.5 pl-3 pr-5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onEditCard(card)}
                            aria-label={`${card.term} bearbeiten`}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-stone-100 dark:hover:bg-[#1C222B] cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteCard(card.id)}
                            aria-label={`${card.term} löschen`}
                            className="p-1.5 text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
