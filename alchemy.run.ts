import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";

const app = await alchemy("my-first-app");

const worker = await Worker("hello-worker", {
  accountId: "2cf83362ac17352a6ba5b88293c9d7dd",
  entrypoint: "./src/worker.ts",
});

console.log(`Worker deployed at: ${worker.url}`);
await app.finalize();