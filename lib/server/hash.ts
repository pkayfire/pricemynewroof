// SHA-256 helpers (Node). Used for consent text hashes, rate-limit keys and IP hashes.
import { createHash } from "node:crypto";

export const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
