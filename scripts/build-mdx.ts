import fs from "fs/promises";
import path from "path";
import { compileMDX } from "../utils/compile-mdx";
import { fileURLToPath } from "url";

// Define the input and output paths
const directory = path.dirname(fileURLToPath(import.meta.url));
const INPUT_FILE_PATH = path.join(directory, "../mdx/example.mdx");
const OUTPUT_DIR = path.join(directory, "../dist");

async function build() {
  console.log("Starting MDX compilation...");

  try {
    // 1. Ensure the output directory exists and is clean
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Output directory '${OUTPUT_DIR}' prepared.`);

    // 2. Read the source MDX file
    const source = await fs.readFile(INPUT_FILE_PATH, "utf-8");
    console.log(`Read source file: '${INPUT_FILE_PATH}'`);

    // 3. Compile the MDX source using our pipeline
    const { content, toc, meta } = await compileMDX(source);
    console.log("Compilation successful.");

    // 4. Write the output files
    await fs.writeFile(
      path.join(OUTPUT_DIR, "content.json"),
      content,
      "utf-8"
    );
    await fs.writeFile(path.join(OUTPUT_DIR, "toc.json"), toc, "utf-8");
    await fs.writeFile(
      path.join(OUTPUT_DIR, "meta.json"),
      JSON.stringify(meta, null, 2), // Pretty-print the meta JSON
      "utf-8"
    );

    console.log("Successfully wrote content.json, toc.json, and meta.json.");
    console.log("\nBuild complete! Check the 'dist' directory for output.");
  } catch (error) {
    console.error("An error occurred during the build process:", error);
    process.exit(1); // Exit with an error code
  }
}

build();