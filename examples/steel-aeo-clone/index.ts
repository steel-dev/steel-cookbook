import config from "./config";
import {
  runBatchProviders,
  type ProviderKey,
  PROVIDERS,
  DEFAULT_AUTOMATION_PROVIDERS,
} from "./client";
import { fmtMs } from "./utils";

async function main() {
  if (!config.openrouter.apiKey) {
    console.error("Error: OPENROUTER_API_KEY is not set.");
  }
  const startedAt = Date.now();
  const results = await runBatchProviders({
    query: config.query!,
    providers: DEFAULT_AUTOMATION_PROVIDERS,
    limit: config.limit,
    includeNoLinkProviders: true,
  });
  const totalMs = Date.now() - startedAt;
  console.log("");
  console.log("=== Provider Results ===");
  console.log(`Query: ${config.query}`);
  console.log(
    `Providers tested: ${results.length} | Total elapsed: ${fmtMs(totalMs)}`,
  );
  console.log("");

  for (const r of results) {
    const spec = PROVIDERS[r?.provider?.provider as ProviderKey];
    const name = spec?.name ?? String(r?.provider?.provider);
    const header = `${name} (${r?.provider?.provider}) — ${r?.provider?.source} — ${fmtMs(r?.provider?.durationMs || 0)} — ${r?.provider?.success ? "OK" : "FAIL"}`;
    console.log(header);

    if (!r?.provider?.success) {
      if (r?.provider?.error) console.log(`  error: ${r?.provider?.error}`);
      console.log("");
      continue;
    }
    console.log("   top 5 brands mentioned: ");
    if (r?.synthesis?.explicit_ranking) {
      for (const it of r?.synthesis?.explicit_ranking) {
        const line = `${it.position ?? "?"}. ${it.brand}`;
        console.log(`   - ${line}`);
      }
    } else {
      console.log("    ranking: <not detected>");
    }
    console.log("   all brands mentioned: ");
    if (r.synthesis?.all_brand_mentions) {
      for (const it of r?.synthesis?.all_brand_mentions) {
        const line = `${it.position ?? "?"}. ${it.brand}${typeof it.relevance_score === "number" ? ` (score: ${it.relevance_score})` : ""} ${typeof it.recommendation_strength === "string" ? ` (recommendation strength: ${it.recommendation_strength})` : ""} ${typeof it.context === "string" ? ` (context: ${it.context})` : ""}`;
        console.log(`   - ${line}`);
      }
    } else {
      console.log("    all brand mentions: <not detected>");
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err?.message || err);
  process.exit(1);
});
