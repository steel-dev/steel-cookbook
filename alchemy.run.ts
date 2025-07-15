import alchemy from "alchemy";
import { Worker, R2Bucket } from "alchemy/cloudflare";

const app = await alchemy("steel-code-registry", {
  stage: "dev",
});

const bucket = await R2Bucket("steel-code-registry-assets", {
  accountId: "2cf83362ac17352a6ba5b88293c9d7dd",
});

export const worker = await Worker("steel-code-registry-cdn", {
  name: "email-forwarder-dev",
  accountId: "2cf83362ac17352a6ba5b88293c9d7dd",
  entrypoint: "./src/worker.ts",
  bindings: {
    BUCKET: bucket,
  },
  url: true,
});

console.log(`Worker deployed at: ${worker.url}`);
await app.finalize();