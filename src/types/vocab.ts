export type SrsState = "neu" | "lernen" | "wiederholen" | "gemeistert";

export type ReviewQuality = 1 | 3 | 4 | 5;

export type StudyMode = "flashcard" | "multiple-choice";

export type PackageNextFilter = "all" | "wrong-only";

export type StudyScope = number | "all" | `group:${string}`;

export type LearningSubject =
  | "auto"
  | "sprachen"
  | "wissen"
  | "mint"
  | "medizin"
  | "wirtschaft"
  | "studium"
  | "sonstiges";

export type CardDirection = "forward" | "reverse";

export type NotebookSourceType = "pdf" | "docx" | "csv" | "txt" | "notes";

export interface ExtractedSourceItem {
  term: string;
  translation: string;
  partOfSpeech?: string;
  phonetic?: string;
  exampleSentence?: string;
  note?: string;
  topic?: string;
}

export interface NotebookSource {
  id: string;
  notebookId: string;
  title: string;
  sourceType: NotebookSourceType;
  rawText: string;
  extractedItems: ExtractedSourceItem[];
  wordCount: number;
  extractionMethod: string;
  createdAt: number;
}

export interface TopicNotebook {
  id: string;
  title: string;
  subject: LearningSubject;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface SrsSchedule {
  easeFactor: number;
  interval: number;
  repetitions: number;
  lapses: number;
  state: SrsState;
  dueDate: number;
  lastReviewedAt?: number;
}

export interface VocabCard {
  id: string;
  packageId: number;
  term: string;
  translation: string;
  phonetic?: string;
  partOfSpeech?: string;
  exampleSentence?: string;
  note?: string;
  topic?: string;
  pairId?: string;
  cardDirection?: CardDirection;
  sourceId?: string;
  notebookId?: string;
  lastWrong?: boolean;
  srs: SrsSchedule;
  createdAt: number;
  updatedAt: number;
}

export interface VocabPackage {
  id: number;
  number: number;
  title: string;
  groupId?: string;
  groupName?: string;
  notebookId?: string;
  sourceIds?: string[];
  sourceTitles?: string[];
  bidirectional?: boolean;
  subject?: LearningSubject;
  subjectLabel?: string;
  sourceLang: string;
  targetLang: string;
  description: string;
  nextSessionFilter: PackageNextFilter;
  shuffleOrder?: boolean;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  packageId: number;
  mode: StudyMode;
  quality: ReviewQuality;
  correct: boolean;
  timestamp: number;
}

export interface AppSettings {
  dailyGoal: number;
  shuffleWithinPackages: boolean;
}

export interface ImportedVocabDraft {
  id: string;
  term: string;
  translation: string;
  partOfSpeech?: string;
  phonetic?: string;
  exampleSentence?: string;
  note?: string;
  topic?: string;
  pairId?: string;
  cardDirection?: CardDirection;
  sourceId?: string;
  sourceTitle?: string;
  notebookId?: string;
  packageId: number;
  selected: boolean;
}
