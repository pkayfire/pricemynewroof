// Fetches government inputs into config/sources/*.json. Raw downloads go to config/.cache/ (gitignored).
//
//   pnpm config:fetch [--only=hud,ppi,oews]
//
// Secrets come from the environment (.env.local locally, repo secrets in CI) and are never logged.
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, loadManual } from "./build";
import { downloadOews, oewsSourceFromXlsx } from "./fetchers/bls_oews";
import { extractPpi, fetchPpi } from "./fetchers/bls_ppi";
import { fetchHudCrosswalk, toHudSource } from "./fetchers/hud_crosswalk";
import type { PpiFamily } from "./lib/schema";

const SOURCES_DIR = path.join(CONFIG_DIR, "sources");
const CACHE_DIR = path.join(CONFIG_DIR, ".cache");

function writeSource(name: string, data: unknown) {
  fs.mkdirSync(SOURCES_DIR, { recursive: true });
  const file = path.join(SOURCES_DIR, name);
  // Keep short arrays (e.g. HUD's [cbsa, state]) on one line so the file diffs one ZIP per line.
  const json = JSON.stringify(data, null, 2).replace(/\[\n\s+("[^"\n]*"),\n\s+("[^"\n]*")\n\s+\]/g, "[$1, $2]");
  fs.writeFileSync(file, json + "\n");
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

function writeCache(name: string, data: unknown) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(data));
}

async function fetchHud(today: string) {
  const res = await fetchHudCrosswalk({ token: process.env.HUD_API_TOKEN });
  writeCache("hud_zip_cbsa_all.json", res);
  const src = toHudSource([res], today);
  writeSource("hud_zip_cbsa.json", src);
  console.log(`HUD ${src.year} Q${src.quarter}: ${Object.keys(src.value).length} ZIPs`);
}

async function fetchPpiSources(today: string) {
  const manual = loadManual();
  const { baseDate, families } = manual.ppiSeries;
  const fams = Object.keys(families) as PpiFamily[];
  const res = await fetchPpi({
    apiKey: process.env.BLS_API_KEY,
    seriesIds: fams.map((f) => families[f].seriesId),
    startYear: Number(baseDate.slice(0, 4)),
    endYear: Number(today.slice(0, 4)),
  });
  writeCache("bls_ppi_response.json", res);
  for (const family of fams) {
    const src = extractPpi(res, { family, ...families[family] }, baseDate, today);
    writeSource(`ppi_${family}.json`, src);
    console.log(
      `PPI ${src.seriesId} (${family}): latest ${src.latest.period} = ${src.latest.value}; ` +
        `base ${baseDate} = ${src.base ? src.base.value : "not published yet"}`,
    );
  }
}

async function fetchOews(today: string) {
  const dl = await downloadOews({
    userAgent: process.env.BLS_USER_AGENT,
    cacheDir: CACHE_DIR,
    today: new Date(`${today}T00:00:00Z`),
  });
  const src = await oewsSourceFromXlsx(dl.xlsxPath, { url: dl.url, yy: dl.yy, retrievedAt: today });
  writeSource("oews_47-2181.json", src);
  const counts = { ok: 0, suppressed: 0, not_published: 0 };
  for (const a of src.value) counts[a.status]++;
  console.log(`OEWS ${src.release}: ${src.value.length} areas (${JSON.stringify(counts)})`);
}

async function main(argv: string[]) {
  const envFile = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

  const only = argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? ["hud", "ppi", "oews"];
  const today = new Date().toISOString().slice(0, 10);
  const jobs: Record<string, (t: string) => Promise<void>> = { hud: fetchHud, ppi: fetchPpiSources, oews: fetchOews };
  for (const name of only) {
    const job = jobs[name];
    if (!job) throw new Error(`unknown source "${name}" (expected hud, ppi or oews)`);
    await job(today);
  }
}

main(process.argv.slice(2)).catch((err: Error) => {
  console.error(`config:fetch failed: ${err.message}`);
  process.exitCode = 1;
});
