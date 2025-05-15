import { Beam } from "beam";
import { openai } from "@ai-sdk/openai";
import dotenv from "dotenv";
// Load environment variables from .env file
dotenv.config();

async function example() {
  // Initialize Beam with an LLM
  const beam = new Beam({
    llm: openai("gpt-4.1-mini"), // Requires OPENAI_API_KEY in your .env file
    useSteel: true,
    steel: {
      // Steel API key - automatically uses STEEL_API_KEY from env if not provided
      steelAPIKey: process.env.STEEL_API_KEY,
      // Optional: custom connect URL
      // connectUrl: "wss://custom-connect.example.com",
      // Optional: custom base URL
      // baseURL: "https://custom-api.example.com",
    },
  });

  beam.on("text", content => process.stdout.write(content));
  beam.on("plan", content => process.stdout.write(content));
  beam.on("tool-call", toolCall => console.log(`Using tool: ${toolCall.toolName}`));
  beam.on("tool-result", toolResult =>
    console.log(`Tool result: ${JSON.stringify(toolResult, null, 2)}`)
  );

  beam.on("done", result => {
    console.log("\n✅ Task completed!");

    // Display Steel session information
    if (result.steelSession) {
      console.log(`\n🔍 Steel Session Details:`);
      console.log(`Session ID: ${result.steelSession.id}`);
      console.log(`View recording at: ${result.steelSession.viewerUrl}`);
      console.log("\nYou can share this URL to let others view the recording!");
    }
  });

  await beam.initialize();

  try {
    // Run a task
    const result = await beam.run({
      task: "Go to news.ycombinator.com and summarize the top 3 stories",
    });

    console.log(JSON.stringify(result, null, 2));

    console.log("Task completed successfully!");
  } finally {
    // Close the browser when done
    await beam.close();
  }
}

example().catch(console.error); 