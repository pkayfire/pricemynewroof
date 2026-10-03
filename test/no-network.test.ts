import { describe, expect, it } from "vitest";

describe("test network guard", () => {
  it("rejects fetch", () => {
    expect(() => fetch("https://example.com")).toThrow(/Network access is disabled/);
  });
});
