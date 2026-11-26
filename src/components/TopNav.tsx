export type AppTab = "study" | "notebooks" | "packages" | "cards" | "import";

interface TopNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  totalCards: number;
  inActiveSession: boolean;
  onPrimaryAction: () => void;
}

const NAV_ITEMS: Array<{ id: AppTab; label: string }> = [
  { id: "study", label: "Lernen" },
  { id: "notebooks", label: "Notebooks" },
  { id: "packages", label: "Pakete" },
  { id: "cards", label: "Karten" },
  { id: "import", label: "Import" },
];

export function TopNav({
  activeTab,
  onSelectTab,
  totalCards,
  inActiveSession,
  onPrimaryAction,
}: TopNavProps) {
  const ctaLabel = inActiveSession
    ? "Session beenden"
    : totalCards === 0
      ? "Inhalte importieren"
      : `Jetzt lernen (${totalCards})`;

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#161B22]/95 backdrop-blur-sm border-b border-stone-200/90 dark:border-slate-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onSelectTab("study")}
          className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700 dark:focus-visible:outline-sky-400 cursor-pointer"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="w-5 h-5 text-sky-700 dark:text-sky-400 shrink-0"
            fill="none"
          >
            <rect
              x="5"
              y="3"
              width="14"
              height="16"
              rx="2.5"
              className="stroke-stone-300 dark:stroke-slate-600"
              strokeWidth="1.75"
            />
            <rect
              x="3"
              y="6"
              width="14"
              height="15"
              rx="2.5"
              className="fill-white dark:fill-[#1C222B] stroke-slate-900 dark:stroke-slate-100"
              strokeWidth="1.75"
            />
            <path
              d="M6.5 11.5h7M6.5 15h4.5"
              className="stroke-sky-700 dark:stroke-sky-400"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
          <span>LernWerk</span>
        </button>

        <nav
          aria-label="Hauptnavigation"
          className="flex items-center gap-5 sm:gap-7 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700 dark:focus-visible:outline-sky-400 ${
                  isActive
                    ? "text-slate-900 dark:text-white"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-700 dark:bg-sky-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:focus-visible:outline-sky-400"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </header>
  );
}
