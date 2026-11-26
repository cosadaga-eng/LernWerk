import { createInitialCards, createInitialLogs, createInitialPackages } from "../data/initialData";
import { getEffectivePackageLanguages } from "../data/languages";
import {
  AppSettings,
  NotebookSource,
  ReviewLog,
  TopicNotebook,
  VocabCard,
  VocabPackage,
} from "../types/vocab";

const DB_NAME = "vokabelwerk-db";
const DB_VERSION = 1;
const STORE_KEY = "workspace-v2";

export interface PersistedWorkspace {
  packages: VocabPackage[];
  cards: VocabCard[];
  logs: ReviewLog[];
  notebooks?: TopicNotebook[];
  sources?: NotebookSource[];
  settings: AppSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  dailyGoal: 20,
  shuffleWithinPackages: false,
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB nicht verfügbar"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("workspace")) {
        db.createObjectStore("workspace");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createEmptyWorkspace(): PersistedWorkspace {
  return {
    packages: createInitialPackages(),
    cards: createInitialCards(),
    logs: createInitialLogs(),
    notebooks: [],
    sources: [],
    settings: DEFAULT_SETTINGS,
  };
}

function normalizeWorkspace(raw: Partial<PersistedWorkspace>): PersistedWorkspace {
  const cards: VocabCard[] = Array.isArray(raw.cards)
    ? raw.cards.map((c) => ({
        id: c.id,
        packageId: c.packageId,
        term: c.term,
        translation: c.translation,
        phonetic: c.phonetic,
        partOfSpeech: c.partOfSpeech,
        exampleSentence: c.exampleSentence,
        note: c.note,
        topic: c.topic,
        pairId: c.pairId,
        cardDirection: c.cardDirection,
        sourceId: c.sourceId,
        notebookId: c.notebookId,
        lastWrong: Boolean(c.lastWrong),
        srs: c.srs,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    : [];

  const cardsByPkg = new Map<number, VocabCard[]>();
  for (const c of cards) {
    const list = cardsByPkg.get(c.packageId) || [];
    list.push(c);
    cardsByPkg.set(c.packageId, list);
  }

  const packages: VocabPackage[] = (raw.packages || [])
    .filter((p) => {
      const pkgCards = cardsByPkg.get(p.id) || [];
      if (pkgCards.length > 0) return true;
      return !/^Paket \d+$/i.test((p.title || "").trim());
    })
    .map((p) => {
      const pkgCards = cardsByPkg.get(p.id) || [];
      const effective = getEffectivePackageLanguages(p, pkgCards);
      return {
        id: p.id,
        number: p.number,
        title: p.title,
        groupId: p.groupId,
        groupName: p.groupName,
        notebookId: p.notebookId,
        sourceIds: Array.isArray(p.sourceIds) ? p.sourceIds : undefined,
        sourceTitles: Array.isArray(p.sourceTitles) ? p.sourceTitles : undefined,
        bidirectional:
          p.bidirectional !== undefined
            ? Boolean(p.bidirectional)
            : pkgCards.some((c) => c.cardDirection === "reverse"),
        subject: p.subject,
        subjectLabel: p.subjectLabel,
        sourceLang: pkgCards.length > 0 ? effective.sourceLang : "",
        targetLang: pkgCards.length > 0 ? effective.targetLang : "",
        description: p.description || "",
        nextSessionFilter: p.nextSessionFilter === "wrong-only" ? "wrong-only" : "all",
        shuffleOrder: Boolean(p.shuffleOrder),
      };
    });

  const notebooks: TopicNotebook[] = Array.isArray(raw.notebooks)
    ? raw.notebooks.map((nb) => ({
        id: nb.id,
        title: nb.title || "Unbenanntes Notebook",
        subject: nb.subject || "auto",
        description: nb.description || "",
        createdAt: nb.createdAt || Date.now(),
        updatedAt: nb.updatedAt || nb.createdAt || Date.now(),
      }))
    : [];

  const sources: NotebookSource[] = Array.isArray(raw.sources)
    ? raw.sources.map((src) => ({
        id: src.id,
        notebookId: src.notebookId,
        title: src.title || "Quelle",
        sourceType: src.sourceType || "notes",
        rawText: src.rawText || "",
        extractedItems: Array.isArray(src.extractedItems)
          ? src.extractedItems
          : [],
        wordCount: typeof src.wordCount === "number" ? src.wordCount : 0,
        extractionMethod: src.extractionMethod || "Lokale Quellenanalyse",
        createdAt: src.createdAt || Date.now(),
      }))
    : [];

  return {
    packages,
    cards,
    logs: [],
    notebooks,
    sources,
    settings: {
      dailyGoal:
        typeof raw.settings?.dailyGoal === "number"
          ? raw.settings.dailyGoal
          : DEFAULT_SETTINGS.dailyGoal,
      shuffleWithinPackages: Boolean(raw.settings?.shuffleWithinPackages),
    },
  };
}

export async function loadWorkspace(): Promise<PersistedWorkspace> {
  try {
    const db = await openDb();
    return await new Promise<PersistedWorkspace>((resolve, reject) => {
      const tx = db.transaction("workspace", "readonly");
      const store = tx.objectStore("workspace");
      const getReq = store.get(STORE_KEY);
      getReq.onsuccess = () => {
        const result = getReq.result as PersistedWorkspace | undefined;
        if (result && Array.isArray(result.packages)) {
          resolve(normalizeWorkspace(result));
        } else {
          const fresh = createEmptyWorkspace();
          saveWorkspace(fresh).catch(() => {});
          resolve(fresh);
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedWorkspace;
        if (parsed && Array.isArray(parsed.packages)) {
          return normalizeWorkspace(parsed);
        }
      }
    } catch {
      // Ignore storage errors
    }
    return createEmptyWorkspace();
  }
}

export async function saveWorkspace(data: PersistedWorkspace): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("workspace", "readwrite");
      const store = tx.objectStore("workspace");
      const putReq = store.put(data, STORE_KEY);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch {
      // Ignore quota errors on fallback
    }
  }
}
