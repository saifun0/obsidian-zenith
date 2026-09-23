/**
 * Place names across scripts.
 *
 * The geocoder indexes every alternate name a place has, so "Ставрополь" finds
 * Stavropol — but it can only hand back the Russian name when its data carries
 * one marked as such, and for some large cities it does not. The city the user
 * typed then comes back as "Stavropol’", listed next to villages that DID come
 * back in Russian, and the one real city looks like the odd one out.
 *
 * Three small tools answer that: a skeleton that lets two spellings of one
 * name compare equal, a reverse romanisation that recovers the Cyrillic form,
 * and a tidy-up for the region names the provider capitalises oddly.
 */

// ── Comparing across scripts ──────────────────────────

const CYR_TO_LAT: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
    ь: '', э: 'e', ю: 'yu', я: 'ya',
    // Ukrainian, Belarusian and Kazakh letters, so their places compare too.
    і: 'i', ї: 'i', є: 'e', ґ: 'g', ў: 'u', ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o',
    ұ: 'u', ү: 'u', һ: 'h',
};

/**
 * A name reduced to what every spelling of it agrees on: Latin letters and
 * digits, no marks, no apostrophes — and no `y` or `j`, which is where
 * romanisations disagree most ("Yekaterinburg" / "Ekaterinburg", "Pyatigorsk"
 * against a plain я). Only ever compared, never shown.
 */
export function nameSkeleton(name: string): string {
    const latin = Array.from(name.toLowerCase(), (ch) => CYR_TO_LAT[ch] ?? ch).join('');
    return latin
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .replace(/[yj]/g, '');
}

/** For "does what was typed begin this name": case and ё folded, nothing more. */
export function foldName(name: string): string {
    return name.toLowerCase().replace(/ё/g, 'е').trim();
}

const HAS_CYRILLIC = /[Ѐ-ӿ]/;

/**
 * How well a name answers a query: 0 it is the whole name, 1 it begins it, 2
 * the provider matched it some other way (an alternate name, a typo).
 *
 * In one script the comparison is literal. Only across scripts does it fall
 * back to skeletons — which are lenient by design, and in one script would
 * call "Ставры" an exact match for "Ставр" once the ы is gone.
 */
export function matchLevel(name: string, query: string): 0 | 1 | 2 {
    const sameScript = HAS_CYRILLIC.test(name) === HAS_CYRILLIC.test(query);
    const a = sameScript ? foldName(name) : nameSkeleton(name);
    const b = sameScript ? foldName(query) : nameSkeleton(query);
    if (!b) return 2;
    return a === b ? 0 : a.startsWith(b) ? 1 : 2;
}

// ── Recovering the Cyrillic ───────────────────────────

/** Longest first: `shch` must win over `sh`, `kh` over a lone `k`. */
const LAT_TO_CYR: ReadonlyArray<[string, string]> = [
    ['shch', 'щ'],
    ['kh', 'х'],
    ['zh', 'ж'],
    ['ch', 'ч'],
    ['sh', 'ш'],
    ['ts', 'ц'],
    ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['z', 'з'],
    ['i', 'и'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'],
    ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'],
];

const LAT_VOWELS = new Set(['a', 'e', 'ë', 'i', 'o', 'u', 'y']);
const Y_PAIRS: Record<string, string> = { a: 'я', u: 'ю', e: 'е', ë: 'ё', o: 'ё' };
const SOFT = new Set(['’', "'", 'ʹ', '`']);
const HARD = new Set(['”', '"', 'ʺ']);

/**
 * A Russian name romanised the way the geocoder's data does it (BGN/PCGN,
 * "Stavropol’", "Mineral’nyye Vody"), turned back into Cyrillic. Null when the
 * name holds a letter that system never produces — it is then not a Russian
 * name, and guessing would invent one.
 *
 * Not reversible in every case (`ts` is ц in "Tsimlyansk" and т+с in
 * "Bratsk"), which is why the caller only uses the result when it agrees with
 * what the user typed.
 */
export function cyrillicFromLatin(name: string): string | null {
    let out = '';
    let i = 0;
    const lower = name.toLowerCase();

    while (i < lower.length) {
        const ch = lower[i];
        const prev = i > 0 ? lower[i - 1] : '';
        const atWordStart = i === 0 || /[\s-]/.test(prev);
        let piece: string | null = null;
        let used = 1;

        if (/[\s-]/.test(ch)) {
            piece = ch;
        } else if (SOFT.has(ch)) {
            piece = 'ь';
        } else if (HARD.has(ch)) {
            piece = 'ъ';
        } else if (ch === 'ë') {
            piece = 'ё';
        } else if (ch === 'y') {
            const next = lower[i + 1] ?? '';
            if (Y_PAIRS[next]) {
                // "ya", "yu", "ye", "yo" are one letter: я, ю, е, ё — "Pyotr"
                // is Пётр. Except "Yo" opening a word, which in place names is
                // far more often Йо (Йошкар-Ола) than Ё.
                piece = next === 'o' && atWordStart ? 'йо' : Y_PAIRS[next];
                used = 2;
            } else if (LAT_VOWELS.has(prev)) {
                // After a vowel, й — including after ы, which is how "-yy"
                // spells the adjective ending: "Novyy" is Новый.
                piece = 'й';
            } else {
                piece = 'ы';
            }
        } else if (ch === 'e') {
            // A bare "e" is э where е would have been written "ye": at the
            // start of a word and after a vowel.
            piece = atWordStart || LAT_VOWELS.has(prev) ? 'э' : 'е';
        } else {
            const match = LAT_TO_CYR.find(([lat]) => lower.startsWith(lat, i));
            if (match) {
                piece = match[1];
                used = match[0].length;
            }
        }

        if (piece === null) return null;
        // Keep the capitals where the romanisation had them.
        out += name[i] !== lower[i] ? piece.charAt(0).toUpperCase() + piece.slice(1) : piece;
        i += used;
    }

    return out;
}

/**
 * The name to show for a hit, given what was typed.
 *
 * Only for a query in Cyrillic answered in Latin; everything else is shown as
 * the provider named it. The recovered form is used only when it begins with
 * what the user typed — so a romanisation that reverses wrongly is caught by
 * the one reference available — and failing that, a query that IS the whole
 * name (by skeleton) is shown as typed.
 */
export function displayName(name: string, query: string): string {
    if (!HAS_CYRILLIC.test(query) || HAS_CYRILLIC.test(name)) return name;

    const recovered = cyrillicFromLatin(name);
    if (recovered && foldName(recovered).startsWith(foldName(query))) return recovered;

    if (nameSkeleton(query) === nameSkeleton(name)) {
        const typed = query.trim();
        return typed.charAt(0).toUpperCase() + typed.slice(1);
    }
    return name;
}

// ── Regions ───────────────────────────────────────────

/** Generic words the provider capitalises mid-name: "Ростовская Область". */
const GENERIC_WORDS = new Set([
    'область',
    'край',
    'район',
    'округ',
    'автономный',
    'автономная',
    'республика',
    'городской',
    'муниципальный',
]);

/** "Ростовская Область" → "Ростовская область". The first word is left alone. */
export function tidyRegion(region: string | undefined): string | undefined {
    if (!region) return region;
    return region
        .split(' ')
        .map((word, i) => (i > 0 && GENERIC_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word))
        .join(' ');
}
