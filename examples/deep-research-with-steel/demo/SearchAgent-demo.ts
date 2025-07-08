#!/usr/bin/env node

import { EventEmitter } from "events";
import { SearchAgent } from "../src/agents/SearchAgent";
import { SteelClient } from "../src/providers/providers";
import { loadConfig } from "../src/config";

async function demoSearchAgent() {
  console.log("🚀 SearchAgent Demo - SERP → Scrape Flow\n");

  try {
    // Load configuration
    const config = loadConfig();

    // Create Steel client and event emitter
    const steelClient = new SteelClient(config.steel.apiKey);
    const eventEmitter = new EventEmitter();

    // Create SearchAgent
    const searchAgent = new SearchAgent(steelClient, eventEmitter);

    // Set up event listeners to show what's happening
    eventEmitter.on("tool-call", (event) => {
      console.log(`🔧 Tool Call: ${event.toolName}`);
      if (event.query) console.log(`   Query: "${event.query}"`);
      if (event.url) console.log(`   URL: ${event.url}`);
    });

    eventEmitter.on("tool-result", (event) => {
      const status = event.success ? "✅ Success" : "❌ Failed";
      console.log(`${status}: ${event.toolName}`);
      if (event.resultCount)
        console.log(`   Found ${event.resultCount} results`);
      if (event.contentLength)
        console.log(`   Content length: ${event.contentLength} chars`);
      if (event.error) console.log(`   Error: ${event.error}`);
    });

    // Demo the search functionality
    console.log("🔍 Searching for: 'TypeScript best practices'\n");

    const result = await searchAgent.searchSERP("TypeScript best practices", {
      maxResults: 3,
      timeout: 15000,
    });

    console.log("\n📊 Search Results Summary:");
    console.log(`- Query: "${result.query}"`);
    console.log(`- Total Results: ${result.totalResults}`);
    console.log(`- Search Time: ${result.searchTime}ms`);

    console.log("\n📄 Individual Results:");
    result.results.forEach((searchResult, index) => {
      console.log(`\n${index + 1}. ${searchResult.title}`);
      console.log(`   URL: ${searchResult.url}`);
      console.log(`   Relevance: ${searchResult.relevanceScore}`);
      console.log(
        `   Content Preview: ${searchResult.content.substring(0, 150)}...`
      );
      console.log(`   Source: ${searchResult.metadata?.source}`);
    });

    console.log("\n🎉 Demo completed successfully!");
  } catch (error) {
    console.error("❌ Demo failed:", error);
  }
}

if (require.main === module) {
  demoSearchAgent().catch(console.error);
}
