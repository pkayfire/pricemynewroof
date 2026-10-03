// Tests never make live network calls (CLAUDE.md). Any attempt fails loudly.
import net from "node:net";
import { beforeAll } from "vitest";

const blocked = (what: string) => () => {
  throw new Error(`Network access is disabled in tests (${what}). Use a recorded fixture.`);
};

beforeAll(() => {
  globalThis.fetch = blocked("fetch") as unknown as typeof fetch;
  net.Socket.prototype.connect = blocked("net.Socket.connect") as unknown as typeof net.Socket.prototype.connect;
});
