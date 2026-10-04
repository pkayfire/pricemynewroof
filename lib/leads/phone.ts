// US phone numbers to E.164 (+1XXXXXXXXXX), validated against the NANP format.

/** Returns +1NXXNXXXXXX, or null if the input isn't a valid US (NANP) number. */
export function toE164US(input: string): string | null {
  const trimmed = input.trim();
  if (!/^[+\d\s().\-]{10,32}$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && !digits.startsWith("1")) return null; // another country code
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // Area code and exchange can't start with 0 or 1; N11 area codes (411, 911…) aren't assignable.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  if (digits[1] === "1" && digits[2] === "1") return null;
  return `+1${digits}`;
}
