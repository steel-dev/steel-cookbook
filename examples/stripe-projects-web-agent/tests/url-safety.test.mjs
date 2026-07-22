// https://github.com/steel-dev/steel-cookbook/tree/main/examples/stripe-projects-web-agent

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const require = createRequire(
  new URL("../package.json", import.meta.url)
);
const typescript = require("typescript");
const source = await readFile(
  new URL("../lib/url-safety.ts", import.meta.url),
  "utf8"
);
const { outputText } = typescript.transpileModule(source, {
  compilerOptions: {
    module: typescript.ModuleKind.ESNext,
    target: typescript.ScriptTarget.ES2022,
  },
  fileName: "url-safety.ts",
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString(
  "base64"
)}`;
const { createPublicUrlGuard } = await import(moduleUrl);

const PUBLIC_RESULT = [{ address: "93.184.216.34", family: 4 }];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("reuses a successful DNS verdict until its TTL expires", async () => {
  let currentTime = 0;
  let lookupCount = 0;
  const guard = createPublicUrlGuard({
    now: () => currentTime,
    lookupHostname: async () => {
      lookupCount += 1;
      return PUBLIC_RESULT;
    },
  });

  await guard.assert("https://example.com/one");
  currentTime = 29_999;
  await guard.assert("https://example.com/two");
  assert.equal(lookupCount, 1);

  currentTime = 30_000;
  await guard.assert("https://example.com/three");
  assert.equal(lookupCount, 2);
});

test("starts the success TTL after a slow lookup completes", async () => {
  let currentTime = 0;
  let lookupCount = 0;
  const firstLookup = deferred();
  const guard = createPublicUrlGuard({
    now: () => currentTime,
    lookupHostname: async () => {
      lookupCount += 1;
      return lookupCount === 1 ? firstLookup.promise : PUBLIC_RESULT;
    },
  });

  const pending = guard.assert("https://example.com/slow");
  currentTime = 60_000;
  firstLookup.resolve(PUBLIC_RESULT);
  await pending;

  await guard.assert("https://example.com/still-fresh");
  assert.equal(lookupCount, 1);

  currentTime = 90_000;
  await guard.assert("https://example.com/expired");
  assert.equal(lookupCount, 2);
});

test("deduplicates concurrent lookups for the same hostname", async () => {
  let lookupCount = 0;
  const lookup = deferred();
  const guard = createPublicUrlGuard({
    lookupHostname: async () => {
      lookupCount += 1;
      return lookup.promise;
    },
  });

  const first = guard.assert("https://example.com/one");
  const second = guard.assert("https://example.com/two");
  assert.equal(lookupCount, 1);

  lookup.resolve(PUBLIC_RESULT);
  await Promise.all([first, second]);
  assert.equal(lookupCount, 1);
});

test("evicts a failed lookup so a later request can retry", async () => {
  let lookupCount = 0;
  const guard = createPublicUrlGuard({
    lookupHostname: async () => {
      lookupCount += 1;
      if (lookupCount === 1) throw new Error("DNS unavailable");
      return PUBLIC_RESULT;
    },
  });

  await assert.rejects(
    guard.assert("https://example.com/first"),
    /DNS unavailable/
  );
  await guard.assert("https://example.com/retry");
  assert.equal(lookupCount, 2);
});

test("does not replace an in-flight lookup after the success TTL", async () => {
  let currentTime = 0;
  let lookupCount = 0;
  const firstLookup = deferred();
  const guard = createPublicUrlGuard({
    now: () => currentTime,
    lookupHostname: async () => {
      lookupCount += 1;
      return lookupCount === 1 ? firstLookup.promise : PUBLIC_RESULT;
    },
  });

  const first = guard.assert("https://example.com/first");
  currentTime = 30_001;
  const afterTtl = guard.assert("https://example.com/after-ttl");
  assert.equal(lookupCount, 1);

  const firstRejected = assert.rejects(first, /DNS unavailable/);
  const afterTtlRejected = assert.rejects(afterTtl, /DNS unavailable/);
  firstLookup.reject(new Error("DNS unavailable"));
  await Promise.all([firstRejected, afterTtlRejected]);

  await guard.assert("https://example.com/retry");
  await guard.assert("https://example.com/reused");
  assert.equal(lookupCount, 2);
});
