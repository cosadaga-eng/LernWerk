export interface VocabLike {
  term: string;
  translation: string;
}

const ANTONYM_PAIR_LIST: Array<[string, string]> = [
  // Deutsch — Eigenschaften, Maße, Zustände, Richtungen, Verben, Nomen
  ["groß", "klein"],
  ["riesig", "winzig"],
  ["lang", "kurz"],
  ["breit", "schmal"],
  ["weit", "eng"],
  ["hoch", "tief"],
  ["hoch", "niedrig"],
  ["dick", "dünn"],
  ["fett", "mager"],
  ["schwer", "leicht"],
  ["neu", "alt"],
  ["jung", "alt"],
  ["modern", "antik"],
  ["schön", "hässlich"],
  ["hübsch", "hässlich"],
  ["gut", "schlecht"],
  ["besser", "schlechter"],
  ["beste", "schlechteste"],
  ["richtig", "falsch"],
  ["wahr", "falsch"],
  ["wahrheit", "lüge"],
  ["möglich", "unmöglich"],
  ["einfach", "schwierig"],
  ["einfach", "kompliziert"],
  ["leicht", "schwierig"],
  ["schnell", "langsam"],
  ["rasch", "langsam"],
  ["laut", "leise"],
  ["laut", "still"],
  ["stark", "schwach"],
  ["kräftig", "schwach"],
  ["hart", "weich"],
  ["voll", "leer"],
  ["offen", "geschlossen"],
  ["auf", "zu"],
  ["geöffnet", "geschlossen"],
  ["frei", "besetzt"],
  ["hell", "dunkel"],
  ["licht", "dunkelheit"],
  ["licht", "schatten"],
  ["weiß", "schwarz"],
  ["warm", "kalt"],
  ["heiß", "kalt"],
  ["heiß", "kühl"],
  ["wärme", "kälte"],
  ["hitze", "kälte"],
  ["feucht", "trocken"],
  ["nass", "trocken"],
  ["sauber", "schmutzig"],
  ["sauberkeit", "schmutz"],
  ["früh", "spät"],
  ["pünktlich", "verspätet"],
  ["immer", "nie"],
  ["immer", "niemals"],
  ["ständig", "selten"],
  ["oft", "selten"],
  ["häufig", "selten"],
  ["heute", "gestern"],
  ["morgen", "gestern"],
  ["anfang", "ende"],
  ["beginn", "ende"],
  ["beginnen", "enden"],
  ["anfangen", "aufhören"],
  ["starten", "stoppen"],
  ["öffnen", "schließen"],
  ["aufmachen", "zumachen"],
  ["kaufen", "verkaufen"],
  ["geben", "nehmen"],
  ["bringen", "holen"],
  ["kommen", "gehen"],
  ["einsteigen", "aussteigen"],
  ["anziehen", "ausziehen"],
  ["einziehen", "ausziehen"],
  ["aufstehen", "hinlegen"],
  ["aufwachen", "schlafen"],
  ["einschlafen", "aufwachen"],
  ["wach", "müde"],
  ["lieben", "hassen"],
  ["liebe", "hass"],
  ["lachen", "weinen"],
  ["freude", "trauer"],
  ["freude", "schmerz"],
  ["glücklich", "traurig"],
  ["fröhlich", "traurig"],
  ["glück", "pech"],
  ["glück", "unglück"],
  ["ruhig", "nervös"],
  ["ruhig", "aufgeregt"],
  ["mutig", "feige"],
  ["mut", "angst"],
  ["hoffnung", "verzweiflung"],
  ["ehrlich", "unehrlich"],
  ["freundlich", "unfreundlich"],
  ["höflich", "unhöflich"],
  ["nett", "gemein"],
  ["klug", "dumm"],
  ["intelligent", "dumm"],
  ["fleißig", "faul"],
  ["fleiß", "faulheit"],
  ["geduldig", "ungeduldig"],
  ["lustig", "ernst"],
  ["streng", "mild"],
  ["gesund", "krank"],
  ["gesundheit", "krankheit"],
  ["lebendig", "tot"],
  ["leben", "sterben"],
  ["leben", "tod"],
  ["gewinnen", "verlieren"],
  ["sieg", "niederlage"],
  ["sieger", "verlierer"],
  ["erfolg", "misserfolg"],
  ["gewinn", "verlust"],
  ["plus", "minus"],
  ["mehr", "weniger"],
  ["viel", "wenig"],
  ["viele", "wenige"],
  ["alles", "nichts"],
  ["alle", "niemand"],
  ["jemand", "niemand"],
  ["etwas", "nichts"],
  ["überall", "nirgendwo"],
  ["oben", "unten"],
  ["vorne", "hinten"],
  ["links", "rechts"],
  ["innen", "außen"],
  ["drinnen", "draußen"],
  ["norden", "süden"],
  ["osten", "westen"],
  ["nah", "fern"],
  ["nähe", "ferne"],
  ["stadt", "dorf"],
  ["tag", "nacht"],
  ["morgen", "abend"],
  ["sonne", "mond"],
  ["sommer", "winter"],
  ["frühling", "herbst"],
  ["himmel", "erde"],
  ["himmel", "hölle"],
  ["krieg", "frieden"],
  ["freiheit", "gefangenschaft"],
  ["freund", "feind"],
  ["freundschaft", "feindschaft"],
  ["erlaubt", "verboten"],
  ["erlaubnis", "verbot"],
  ["erlauben", "verbieten"],
  ["teuer", "billig"],
  ["teuer", "günstig"],
  ["arm", "reich"],
  ["armut", "reichtum"],
  ["frage", "antwort"],
  ["fragen", "antworten"],
  ["problem", "lösung"],
  ["sicherheit", "gefahr"],
  ["sicher", "gefährlich"],
  ["bauen", "zerstören"],
  ["verbessern", "verschlechtern"],
  ["steigen", "sinken"],
  ["wachsen", "schrumpfen"],
  ["scharf", "stumpf"],
  ["süß", "sauer"],
  ["süß", "bitter"],
  ["glatt", "rau"],
  ["rund", "eckig"],
  ["gerade", "krumm"],
  ["tief", "flach"],
  ["abfahrt", "ankunft"],
  ["abfahren", "ankommen"],
  ["eingang", "ausgang"],
  ["hin", "zurück"],
  ["vor", "nach"],
  ["vorher", "nachher"],
  ["früher", "später"],
  ["erste", "letzte"],
  ["zusammen", "getrennt"],
  ["einzeln", "zusammen"],
  ["vergessen", "erinnern"],
  ["verlieren", "finden"],
  ["suchen", "finden"],
  ["schicken", "empfangen"],
  ["senden", "empfangen"],
  ["sparen", "ausgeben"],
  ["einnahmen", "ausgaben"],
  ["vorteil", "nachteil"],
  ["ordnung", "chaos"],
  ["ähnlich", "verschieden"],
  ["gleich", "anders"],
  ["gleich", "verschieden"],
  ["mit", "ohne"],
  ["für", "gegen"],
  ["dafür", "dagegen"],
  ["ja", "nein"],
  ["drücken", "ziehen"],
  ["werfen", "fangen"],
  ["heben", "senken"],
  ["einschalten", "ausschalten"],
  ["anmachen", "ausmachen"],
  ["annehmen", "ablehnen"],
  ["zustimmen", "widersprechen"],
  ["loben", "tadeln"],
  ["lob", "kritik"],

  // English
  ["big", "small"],
  ["large", "small"],
  ["huge", "tiny"],
  ["long", "short"],
  ["wide", "narrow"],
  ["broad", "narrow"],
  ["high", "low"],
  ["tall", "short"],
  ["thick", "thin"],
  ["fat", "thin"],
  ["heavy", "light"],
  ["new", "old"],
  ["young", "old"],
  ["modern", "ancient"],
  ["beautiful", "ugly"],
  ["pretty", "ugly"],
  ["good", "bad"],
  ["better", "worse"],
  ["best", "worst"],
  ["right", "wrong"],
  ["true", "false"],
  ["truth", "lie"],
  ["easy", "difficult"],
  ["easy", "hard"],
  ["simple", "complicated"],
  ["fast", "slow"],
  ["quick", "slow"],
  ["loud", "quiet"],
  ["loud", "silent"],
  ["noisy", "quiet"],
  ["strong", "weak"],
  ["hard", "soft"],
  ["full", "empty"],
  ["open", "closed"],
  ["open", "shut"],
  ["free", "busy"],
  ["bright", "dark"],
  ["light", "dark"],
  ["white", "black"],
  ["warm", "cold"],
  ["hot", "cold"],
  ["warm", "cool"],
  ["wet", "dry"],
  ["clean", "dirty"],
  ["early", "late"],
  ["always", "never"],
  ["often", "rarely"],
  ["often", "seldom"],
  ["today", "yesterday"],
  ["tomorrow", "yesterday"],
  ["before", "after"],
  ["start", "finish"],
  ["begin", "end"],
  ["start", "stop"],
  ["beginning", "end"],
  ["open", "close"],
  ["buy", "sell"],
  ["give", "take"],
  ["come", "go"],
  ["enter", "exit"],
  ["entrance", "exit"],
  ["arrive", "depart"],
  ["arrival", "departure"],
  ["love", "hate"],
  ["laugh", "cry"],
  ["happy", "sad"],
  ["glad", "sad"],
  ["joy", "sorrow"],
  ["calm", "nervous"],
  ["brave", "cowardly"],
  ["courage", "fear"],
  ["polite", "rude"],
  ["kind", "cruel"],
  ["smart", "stupid"],
  ["clever", "stupid"],
  ["hardworking", "lazy"],
  ["funny", "serious"],
  ["healthy", "sick"],
  ["healthy", "ill"],
  ["health", "illness"],
  ["alive", "dead"],
  ["live", "die"],
  ["life", "death"],
  ["win", "lose"],
  ["victory", "defeat"],
  ["success", "failure"],
  ["profit", "loss"],
  ["more", "less"],
  ["much", "little"],
  ["many", "few"],
  ["all", "nothing"],
  ["everything", "nothing"],
  ["everyone", "nobody"],
  ["everywhere", "nowhere"],
  ["up", "down"],
  ["above", "below"],
  ["over", "under"],
  ["top", "bottom"],
  ["front", "back"],
  ["left", "right"],
  ["inside", "outside"],
  ["inner", "outer"],
  ["north", "south"],
  ["east", "west"],
  ["near", "far"],
  ["city", "village"],
  ["day", "night"],
  ["morning", "evening"],
  ["sun", "moon"],
  ["summer", "winter"],
  ["spring", "autumn"],
  ["war", "peace"],
  ["freedom", "slavery"],
  ["friend", "enemy"],
  ["allowed", "forbidden"],
  ["allow", "forbid"],
  ["expensive", "cheap"],
  ["poor", "rich"],
  ["poverty", "wealth"],
  ["question", "answer"],
  ["ask", "answer"],
  ["problem", "solution"],
  ["safe", "dangerous"],
  ["safety", "danger"],
  ["build", "destroy"],
  ["create", "destroy"],
  ["improve", "worsen"],
  ["rise", "fall"],
  ["increase", "decrease"],
  ["sweet", "sour"],
  ["sweet", "bitter"],
  ["smooth", "rough"],
  ["remember", "forget"],
  ["lose", "find"],
  ["send", "receive"],
  ["save", "spend"],
  ["advantage", "disadvantage"],
  ["same", "different"],
  ["similar", "different"],
  ["together", "apart"],
  ["asleep", "awake"],
  ["sleep", "wake"],
  ["push", "pull"],
  ["throw", "catch"],
  ["accept", "reject"],
  ["with", "without"],
  ["yes", "no"],

  // Français
  ["grand", "petit"],
  ["nouveau", "vieux"],
  ["jeune", "vieux"],
  ["bon", "mauvais"],
  ["beau", "laid"],
  ["rapide", "lent"],
  ["chaud", "froid"],
  ["jour", "nuit"],
  ["ouvert", "fermé"],
  ["ouvrir", "fermer"],
  ["plein", "vide"],
  ["haut", "bas"],
  ["gauche", "droite"],
  ["vrai", "faux"],
  ["facile", "difficile"],
  ["riche", "pauvre"],
  ["propre", "sale"],
  ["fort", "faible"],
  ["heureux", "triste"],
  ["heureux", "malheureux"],
  ["aimer", "détester"],
  ["acheter", "vendre"],
  ["entrer", "sortir"],
  ["arriver", "partir"],
  ["commencer", "finir"],
  ["gagner", "perdre"],
  ["toujours", "jamais"],
  ["beaucoup", "peu"],
  ["avec", "sans"],
  ["devant", "derrière"],
  ["dedans", "dehors"],
  ["blanc", "noir"],
  ["cher", "bon marché"],
  ["lumière", "ombre"],
  ["guerre", "paix"],

  // Español
  ["grande", "pequeño"],
  ["nuevo", "viejo"],
  ["joven", "viejo"],
  ["bueno", "malo"],
  ["bonito", "feo"],
  ["rápido", "lento"],
  ["caliente", "frío"],
  ["día", "noche"],
  ["abierto", "cerrado"],
  ["abrir", "cerrar"],
  ["lleno", "vacío"],
  ["alto", "bajo"],
  ["izquierda", "derecha"],
  ["verdadero", "falso"],
  ["fácil", "difícil"],
  ["rico", "pobre"],
  ["caro", "barato"],
  ["limpio", "sucio"],
  ["fuerte", "débil"],
  ["feliz", "triste"],
  ["amar", "odiar"],
  ["comprar", "vender"],
  ["entrar", "salir"],
  ["llegar", "salir"],
  ["empezar", "terminar"],
  ["ganar", "perder"],
  ["siempre", "nunca"],
  ["mucho", "poco"],
  ["con", "sin"],
  ["delante", "detrás"],
  ["dentro", "fuera"],
  ["blanco", "negro"],
  ["guerra", "paz"],

  // Italiano
  ["grande", "piccolo"],
  ["nuovo", "vecchio"],
  ["giovane", "vecchio"],
  ["buono", "cattivo"],
  ["bello", "brutto"],
  ["veloce", "lento"],
  ["caldo", "freddo"],
  ["giorno", "notte"],
  ["aperto", "chiuso"],
  ["aprire", "chiudere"],
  ["pieno", "vuoto"],
  ["alto", "basso"],
  ["sinistra", "destra"],
  ["vero", "falso"],
  ["facile", "difficile"],
  ["ricco", "povero"],
  ["caro", "economico"],
  ["pulito", "sporco"],
  ["forte", "debole"],
  ["felice", "triste"],
  ["comprare", "vendere"],
  ["entrare", "uscire"],
  ["iniziare", "finire"],
  ["vincere", "perdere"],
  ["sempre", "mai"],
  ["bianco", "nero"],
];

function normalizeKey(raw: string): string {
  return raw
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/^[\s•\-–—"'„“‚‘()[\]]+|[\s.!?,;:"'„“‚‘()[\]]+$/g, "")
    .replace(/\s+/g, " ");
}

const ANTONYM_MAP = new Map<string, Set<string>>();

function registerPair(aRaw: string, bRaw: string): void {
  const a = normalizeKey(aRaw);
  const b = normalizeKey(bRaw);
  if (!a || !b || a === b) return;
  if (!ANTONYM_MAP.has(a)) ANTONYM_MAP.set(a, new Set());
  if (!ANTONYM_MAP.has(b)) ANTONYM_MAP.set(b, new Set());
  ANTONYM_MAP.get(a)!.add(b);
  ANTONYM_MAP.get(b)!.add(a);
}

for (const [a, b] of ANTONYM_PAIR_LIST) {
  registerPair(a, b);
}

const LEADING_ARTICLES_RE =
  /^(?:der|die|das|ein|eine|einen|einem|einer|the|a|an|to|sich|le|la|les|un|une|el|los|las|il|lo|i|gli)\s+/i;

function stripLeadingArticles(phrase: string): string {
  let out = phrase;
  for (let i = 0; i < 2; i++) {
    out = out.replace(LEADING_ARTICLES_RE, "").trim();
  }
  return out;
}

const NEGATION_PREFIX_RE = /^(?:nicht|kein|keine|keinen|keinem|keiner|not|no|non|pas|sin|ohne|without)\s+(.+)$/i;

function isMorphologicalOpposite(a: string, b: string): boolean {
  if (a === b || a.length < 3 || b.length < 3) return false;

  // 1. Direct negation phrase: "nicht gut" vs "gut", "not happy" vs "happy"
  const aNeg = a.match(NEGATION_PREFIX_RE);
  if (aNeg && normalizeKey(aNeg[1]) === b) return true;
  const bNeg = b.match(NEGATION_PREFIX_RE);
  if (bNeg && normalizeKey(bNeg[1]) === a) return true;

  // 2. Symmetric antonym prefixes on same base
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.length > shorter.length) {
    if (shorter.length >= 4) {
      if (longer === `un${shorter}`) return true;
      if (longer === `dis${shorter}`) return true;
      if (longer === `des${shorter}`) return true;
      if (longer === `non${shorter}`) return true;
      if (longer === `non-${shorter}`) return true;
      if (longer === `anti${shorter}`) return true;
      if (longer === `miss${shorter}`) return true;
      if (longer === `mal${shorter}`) return true;
    }
    if (shorter.length >= 5) {
      if (/^[pbm]/.test(shorter) && longer === `im${shorter}`) return true;
      if (shorter.startsWith("l") && longer === `il${shorter}`) return true;
      if (shorter.startsWith("r") && longer === `ir${shorter}`) return true;
      if (!/^[pbmrl]/.test(shorter) && longer === `in${shorter}`) return true;
    }
  }

  // 3. Suffix oppositions (-voll/-los, -reich/-arm, -ful/-less)
  const suffixPairs: Array<[string, string]> = [
    ["voll", "los"],
    ["reich", "los"],
    ["reich", "arm"],
    ["ful", "less"],
  ];
  for (const [s1, s2] of suffixPairs) {
    if (a.endsWith(s1) && b.endsWith(s2)) {
      const stemA = a.slice(0, -s1.length);
      const stemB = b.slice(0, -s2.length);
      if (stemA.length >= 3 && stemA === stemB) return true;
    }
    if (a.endsWith(s2) && b.endsWith(s1)) {
      const stemA = a.slice(0, -s2.length);
      const stemB = b.slice(0, -s1.length);
      if (stemA.length >= 3 && stemA === stemB) return true;
    }
  }

  // 4. German directional / separable prefix oppositions (ein-/aus-, auf-/zu-, an-/ab-, vor-/nach-)
  const prefixPairs: Array<[string, string]> = [
    ["ein", "aus"],
    ["auf", "zu"],
    ["auf", "ab"],
    ["an", "ab"],
    ["an", "aus"],
    ["vor", "nach"],
    ["hin", "zurück"],
    ["hin", "her"],
  ];
  for (const [p1, p2] of prefixPairs) {
    if (a.startsWith(p1) && b.startsWith(p2)) {
      const stemA = a.slice(p1.length);
      const stemB = b.slice(p2.length);
      if (stemA.length >= 4 && stemA === stemB) return true;
    }
    if (a.startsWith(p2) && b.startsWith(p1)) {
      const stemA = a.slice(p2.length);
      const stemB = b.slice(p1.length);
      if (stemA.length >= 4 && stemA === stemB) return true;
    }
  }

  return false;
}

export function areWordTokensOpposites(rawA: string, rawB: string): boolean {
  const a = stripLeadingArticles(normalizeKey(rawA));
  const b = stripLeadingArticles(normalizeKey(rawB));
  if (!a || !b || a === b) return false;

  if (ANTONYM_MAP.get(a)?.has(b)) return true;
  if (isMorphologicalOpposite(a, b)) return true;

  return false;
}

const SKIP_INNER_WORDS = new Set([
  "der", "die", "das", "ein", "eine", "sehr", "ganz", "etwas", "nicht", "kein",
  "keine", "the", "very", "quite", "not", "no", "to", "be", "sich", "zu", "in",
  "on", "at", "mit", "ohne", "for", "of",
]);

const NEGATION_WORD_START_RE =
  /^(?:nicht|kein|keine|keinen|keinem|keiner|not|no|non|ohne|without|sin)\b/i;

function extractSenseTokens(text: string): string[] {
  const senses = text
    .split(/\s*[;/|,]\s*/)
    .map((s) => stripLeadingArticles(normalizeKey(s)))
    .filter(Boolean);

  const tokens = new Set<string>(senses);
  for (const sense of senses) {
    if (NEGATION_WORD_START_RE.test(sense)) {
      continue;
    }
    const words = sense.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 3) {
      for (const w of words) {
        if (w.length >= 3 && !SKIP_INNER_WORDS.has(w)) {
          tokens.add(w);
        }
      }
    }
  }
  return Array.from(tokens);
}

/**
 * Returns true if two vocabulary entries represent opposites / antonyms
 * (checked across both their terms and their translations).
 */
export function areVocabOpposites(a: VocabLike, b: VocabLike): boolean {
  const aTermTokens = extractSenseTokens(a.term);
  const bTermTokens = extractSenseTokens(b.term);
  for (const at of aTermTokens) {
    for (const bt of bTermTokens) {
      if (areWordTokensOpposites(at, bt)) return true;
    }
  }

  const aTransTokens = extractSenseTokens(a.translation);
  const bTransTokens = extractSenseTokens(b.translation);
  for (const at of aTransTokens) {
    for (const bt of bTransTokens) {
      if (areWordTokensOpposites(at, bt)) return true;
    }
  }

  return false;
}

/**
 * Counts how many conflicting opposite pairs exist inside a list of cards.
 */
export function findOppositePairs<T extends VocabLike>(
  items: T[]
): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (areVocabOpposites(items[i], items[j])) {
        pairs.push([items[i], items[j]]);
      }
    }
  }
  return pairs;
}
