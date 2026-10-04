// Finds every number in an explanation: digits, percentages, roof pitches ("8/12") and spelled-out
// numbers ("six", "twenty-one", "two thirds"), which count as numbers (Build decisions).

export interface FoundNumber {
  value: number;
  percent: boolean;
  raw: string;
}

export interface ExtractedNumbers {
  numbers: FoundNumber[];
  /** Rise of every "x/12" pitch mentioned. */
  pitches: number[];
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, dozen: 12, twice: 2, double: 2, triple: 3,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const FRACTIONS: Record<string, number> = {
  half: 1 / 2, halves: 1 / 2, third: 1 / 3, thirds: 1 / 3, quarter: 1 / 4, quarters: 1 / 4,
  fourth: 1 / 4, fourths: 1 / 4, fifth: 1 / 5, fifths: 1 / 5, tenth: 1 / 10, tenths: 1 / 10,
};
const PERCENT_WORDS = new Set(["percent", "pct"]);

const PITCH_RE = /\b(\d{1,2})\s*(?:\/|-in-|\s+in\s+)\s*12\b/gi;
const DIGIT_RE = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s*(?:%|percent\b|per\s+cent\b))?/gi;

function extractSpelled(text: string): FoundNumber[] {
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const out: FoundNumber[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t in FRACTIONS) {
      // "half", "a third" on their own
      out.push({ value: FRACTIONS[t], percent: false, raw: t });
      i++;
      continue;
    }
    if (!(t in UNITS) && !(t in TENS) && t !== "hundred") {
      i++;
      continue;
    }
    let total = 0;
    let current = 0;
    const raw: string[] = [];
    while (i < tokens.length) {
      const w = tokens[i];
      if (w in UNITS) current += UNITS[w];
      else if (w in TENS) current += TENS[w];
      else if (w === "hundred") current = (current || 1) * 100;
      else if (w === "thousand") {
        total += (current || 1) * 1000;
        current = 0;
      } else if (w === "and" && raw.length && i + 1 < tokens.length && (tokens[i + 1] in UNITS || tokens[i + 1] in TENS)) {
        // "one hundred and five"
      } else break;
      raw.push(w);
      i++;
    }
    let value = total + current;
    let percent = false;
    const next = tokens[i];
    if (next && next in FRACTIONS) {
      value = value * FRACTIONS[next];
      raw.push(next);
      i++;
    } else if (next && PERCENT_WORDS.has(next)) {
      percent = true;
      raw.push(next);
      i++;
    } else if (next === "per" && tokens[i + 1] === "cent") {
      percent = true;
      raw.push("per cent");
      i += 2;
    }
    out.push({ value, percent, raw: raw.join(" ") });
  }
  return out;
}

export function extractNumbers(input: string): ExtractedNumbers {
  const pitches: number[] = [];
  let text = input.replace(PITCH_RE, (_m, rise: string) => {
    pitches.push(Number(rise));
    return " ";
  });
  const numbers: FoundNumber[] = [];
  text = text.replace(DIGIT_RE, (m, whole: string, frac: string | undefined, pct: string | undefined) => {
    numbers.push({ value: Number(whole.replace(/,/g, "") + (frac ?? "")), percent: Boolean(pct), raw: m.trim() });
    return " ";
  });
  numbers.push(...extractSpelled(text));
  return { numbers, pitches };
}
