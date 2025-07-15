import alchemy from "alchemy";
import { R2Bucket, Worker } from "alchemy/cloudflare";

const app = await alchemy("steel-code-registry", {
  stage: "dev",
});

export const bucket = await R2Bucket("steel-code-registry-assets", {
  name: "steel-code-registry-assets",
  accountId: "2cf83362ac17352a6ba5b88293c9d7dd",
});

export const worker = await Worker("steel-code-registry-cdn", {
  name: "steel-code-registry-dev",
  accountId: "2cf83362ac17352a6ba5b88293c9d7dd",
  entrypoint: "./src/worker.ts",
  bindings: {
    BUCKET: bucket,
  },
  url: true,
});

console.log(`Worker deployed at: ${worker.url}`);
await app.finalize();