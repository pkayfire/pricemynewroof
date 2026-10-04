// Normalization and hashing for the OpenAI Conversions API user object (developers.openai.com/ads/conversions-api):
// emails trimmed and lowercased; phone numbers keep the country code with "+", spaces and
// punctuation and leading zeroes removed; SHA-256, lowercase hex.
import { sha256Hex } from "@/lib/server/hash";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "").replace(/^0+/, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export const hashEmail = (email: string) => sha256Hex(normalizeEmail(email));
export function hashPhone(phone: string): string | null {
  const n = normalizePhone(phone);
  return n ? sha256Hex(n) : null;
}
