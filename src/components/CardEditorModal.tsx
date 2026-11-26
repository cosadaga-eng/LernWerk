import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getPackageSubjectContext } from "../data/subjects";
import { VocabCard, VocabPackage } from "../types/vocab";
import { FormattedText, hasFormattingMarkers } from "./FormattedText";

interface CardEditorModalProps {
  isOpen: boolean;
  card: VocabCard | null;
  defaultPackageId: number;
  packages: VocabPackage[];
  onClose: () => void;
  onSave: (draft: {
    id?: string;
    packageId: number;
    term: string;
    translation: string;
    phonetic?: string;
    partOfSpeech?: string;
    exampleSentence?: string;
    note?: string;
    createBothDirections?: boolean;
  }) => void;
}

export function CardEditorModal({
  isOpen,
  card,
  defaultPackageId,
  packages,
  onClose,
  onSave,
}: CardEditorModalProps) {
  const [packageId, setPackageId] = useState(defaultPackageId);
  const [term, setTerm] = useState("");
  const [translation, setTranslation] = useState("");
  const [phonetic, setPhonetic] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [exampleSentence, setExampleSentence] = useState("");
  const [note, setNote] = useState("");
  const [createBothDirections, setCreateBothDirections] = useState(true);
  const termRef = useRef<HTMLTextAreaElement>(null);
  const translationRef = useRef<HTMLTextAreaElement>(null);

  const insertScriptMarker = (
    field: "term" | "translation",
    kind: "sup" | "sub"
  ) => {
    const el = field === "term" ? termRef.current : translationRef.current;
    const current = field === "term" ? term : translation;
    const setValue = field === "term" ? setTerm : setTranslation;
    const prefix = kind === "sup" ? "^{" : "_{";

    if (!el) {
      setValue(`${current}${prefix}}`);
      return;
    }

    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const selected = current.slice(start, end);
    const inserted = selected ? `${prefix}${selected}}` : `${prefix}}`;
    const nextValue = current.slice(0, start) + inserted + current.slice(end);
    setValue(nextValue);

    const nextCaret = selected
      ? start + inserted.length
      : start + prefix.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    if (card) {
      setPackageId(card.packageId);
      setTerm(card.term);
      setTranslation(card.translation);
      setPhonetic(card.phonetic || "");
      setPartOfSpeech(card.partOfSpeech || "");
      setExampleSentence(card.exampleSentence || "");
      setNote(card.note || "");
      setCreateBothDirections(false);
    } else {
      setPackageId(defaultPackageId);
      setTerm("");
      setTranslation("");
      setPhonetic("");
      setPartOfSpeech("");
      setExampleSentence("");
      setNote("");
      const pkg = packages.find((p) => p.id === defaultPackageId);
      const ctx = getPackageSubjectContext(pkg, []);
      setCreateBothDirections(Boolean(pkg?.bidirectional) || ctx.isLanguageDeck);
    }
  }, [card, defaultPackageId, isOpen, packages]);

  if (!isOpen) return null;

  const selectedPkg = packages.find((p) => p.id === packageId);
  const subjectCtx = getPackageSubjectContext(selectedPkg, []);

  const frontLabel = selectedPkg?.sourceLang
    ? `Vorderseite (${selectedPkg.sourceLang}) *`
    : selectedPkg
      ? `${subjectCtx.def.termLabel} *`
      : "Vorderseite (Begriff / Frage) *";

  const backLabel = selectedPkg?.targetLang
    ? `Rückseite (${selectedPkg.targetLang}) *`
    : selectedPkg
      ? `${subjectCtx.def.answerLabel} *`
      : "Rückseite (Antwort / Erklärung / Übersetzung) *";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !translation.trim()) return;

    onSave({
      id: card?.id,
      packageId,
      term: term.trim(),
      translation: translation.trim(),
      phonetic: phonetic.trim() || undefined,
      partOfSpeech: partOfSpeech.trim() || undefined,
      exampleSentence: exampleSentence.trim() || undefined,
      note: note.trim() || undefined,
      createBothDirections:
        !card && (Boolean(selectedPkg?.bidirectional) || subjectCtx.isLanguageDeck)
          ? createBothDirections
          : false,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 dark:bg-black/65 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-editor-title"
    >
      <div className="bg-white dark:bg-[#161B22] border border-stone-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white/95 dark:bg-[#161B22]/95 backdrop-blur-sm px-6 py-4 border-b border-stone-200 dark:border-slate-800 flex items-center justify-between gap-4 z-10">
          <h2
            id="card-editor-title"
            className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            {card ? "Lernkarte bearbeiten" : "Neue Lernkarte anlegen"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label
                htmlFor="editor-package"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Lernpaket
              </label>
              <select
                id="editor-package"
                value={packages.some((p) => p.id === packageId) ? packageId : 0}
                onChange={(e) => setPackageId(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
              >
                {packages.map((p) => {
                  const ctx = getPackageSubjectContext(p, []);
                  const tag =
                    p.sourceLang && p.targetLang
                      ? ` · ${p.sourceLang} → ${p.targetLang}`
                      : ctx.displayLabel
                        ? ` · ${ctx.displayLabel}`
                        : "";
                  const prefix =
                    p.groupName && p.groupName !== p.title
                      ? `${p.groupName} — `
                      : "";
                  return (
                    <option key={p.id} value={p.id}>
                      {prefix}
                      {p.title} (Paket {String(p.number).padStart(2, "0")})
                      {tag}
                    </option>
                  );
                })}
                <option value={0}>+ Neues Paket automatisch anlegen</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="editor-term"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {frontLabel}
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => insertScriptMarker("term", "sup")}
                    title="Hochgestellt einfügen (^{...})"
                    className="px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-stone-100 dark:bg-[#1C222B] hover:bg-stone-200 dark:hover:bg-slate-700 rounded border border-stone-200 dark:border-slate-700 cursor-pointer"
                  >
                    x<sup>2</sup>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertScriptMarker("term", "sub")}
                    title="Tiefgestellt einfügen (_{...})"
                    className="px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-stone-100 dark:bg-[#1C222B] hover:bg-stone-200 dark:hover:bg-slate-700 rounded border border-stone-200 dark:border-slate-700 cursor-pointer"
                  >
                    x<sub>2</sub>
                  </button>
                </div>
              </div>
              <textarea
                ref={termRef}
                id="editor-term"
                dir="auto"
                rows={2}
                required
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Vokabel, Frage, Formel (z. B. H_{2}O oder x^{2})"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
              />
              {hasFormattingMarkers(term) && (
                <div
                  dir="auto"
                  className="mt-1.5 px-2.5 py-1.5 text-xs bg-[#FAF9F6] dark:bg-[#1C222B] border border-stone-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200"
                >
                  Vorschau: <FormattedText text={term} />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="editor-translation"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {backLabel}
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => insertScriptMarker("translation", "sup")}
                    title="Hochgestellt einfügen (^{...})"
                    className="px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-stone-100 dark:bg-[#1C222B] hover:bg-stone-200 dark:hover:bg-slate-700 rounded border border-stone-200 dark:border-slate-700 cursor-pointer"
                  >
                    x<sup>2</sup>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertScriptMarker("translation", "sub")}
                    title="Tiefgestellt einfügen (_{...})"
                    className="px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-stone-100 dark:bg-[#1C222B] hover:bg-stone-200 dark:hover:bg-slate-700 rounded border border-stone-200 dark:border-slate-700 cursor-pointer"
                  >
                    x<sub>2</sub>
                  </button>
                </div>
              </div>
              <textarea
                ref={translationRef}
                id="editor-translation"
                dir="auto"
                rows={2}
                required
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                placeholder="Antwort, Übersetzung oder Definition"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
              />
              {hasFormattingMarkers(translation) && (
                <div
                  dir="auto"
                  className="mt-1.5 px-2.5 py-1.5 text-xs bg-[#FAF9F6] dark:bg-[#1C222B] border border-stone-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200"
                >
                  Vorschau: <FormattedText text={translation} />
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="editor-pos"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {selectedPkg
                  ? `${subjectCtx.def.categoryFieldLabel} (optional)`
                  : "Kategorie / Wortart (optional)"}
              </label>
              <input
                id="editor-pos"
                type="text"
                value={partOfSpeech}
                onChange={(e) => setPartOfSpeech(e.target.value)}
                placeholder="z. B. Definition, Formel, Nomen, § BGB"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
              />
            </div>

            <div>
              <label
                htmlFor="editor-phonetic"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {selectedPkg
                  ? `${subjectCtx.def.detailLabel} (optional)`
                  : "Zusatzangabe / Einheit / Lautschrift (optional)"}
              </label>
              <input
                id="editor-phonetic"
                type="text"
                dir="auto"
                value={phonetic}
                onChange={(e) => setPhonetic(e.target.value)}
                placeholder="z. B. Einheit, Jahrgang oder Lautschrift"
                className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-stone-100 dark:border-slate-800 space-y-4">
            <div>
              <label
                htmlFor="editor-example"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {selectedPkg
                  ? `${subjectCtx.def.contextLabel} (optional)`
                  : "Beispiel / Kontext (optional)"}
              </label>
              <input
                id="editor-example"
                type="text"
                dir="auto"
                value={exampleSentence}
                onChange={(e) => setExampleSentence(e.target.value)}
                placeholder="Beispielsatz, Herleitung oder Fallbeispiel"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
              />
            </div>

            <div>
              <label
                htmlFor="editor-note"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Merkhilfe / Notiz (optional)
              </label>
              <input
                id="editor-note"
                type="text"
                dir="auto"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Eselsbrücke oder wichtiger Hinweis"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#11151C] text-slate-900 dark:text-slate-100 border border-stone-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-700 dark:focus:border-sky-500"
              />
            </div>
          </div>

          {!card &&
            (Boolean(selectedPkg?.bidirectional) || subjectCtx.isLanguageDeck) && (
              <label className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 font-medium cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={createBothDirections}
                  onChange={(e) => setCreateBothDirections(e.target.checked)}
                  className="rounded border-stone-300 dark:border-slate-600 text-sky-700 dark:text-sky-500 focus:ring-sky-700"
                />
                <span>
                  Beide Richtungen anlegen (Vorderseite → Rückseite &amp;
                  Rückseite → Vorderseite)
                </span>
              </label>
            )}

          <div className="pt-4 border-t border-stone-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border border-stone-200 dark:border-slate-700 hover:bg-stone-50 dark:hover:bg-[#1C222B] rounded-xl cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-xl cursor-pointer"
            >
              {card ? "Änderungen speichern" : "Lernkarte speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
