import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_EVENTS, FUNNEL_EVENTS } from "@/lib/api/contracts";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");

/** Event names allowed by the latest events_name_check in the migrations. */
function allowedInDatabase(): string[] {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let names: string[] | null = null;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    const m = [...sql.matchAll(/name\s+text not null check \(name in \(([^)]*)\)\)|events_name_check check \(name in \(([^)]*)\)\)/g)].pop();
    if (m) names = [...(m[1] ?? m[2]).matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  }
  if (!names) throw new Error("no events name check found");
  return names;
}

describe("event names", () => {
  it("every funnel event is allowed by the events table, and nothing else is", () => {
    expect([...allowedInDatabase()].sort()).toEqual([...FUNNEL_EVENTS].sort());
  });

  it("the browser can send quote_click but not lead_created", () => {
    expect(CLIENT_EVENTS).toContain("quote_click");
    expect(CLIENT_EVENTS).not.toContain("lead_created");
  });
});
