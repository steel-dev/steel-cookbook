import fs from "fs/promises";
import path from "path";
import { compileMDX } from "../utils/compile-mdx";
import { fileURLToPath } from "url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(directory, "../dist");
const MDX_DIR = path.join(directory, "../mdx");

async function build() {
  console.log("Starting MDX compilation...");

  try {
    // 1. Ensure the root output directory exists and is clean
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Output directory '${OUTPUT_DIR}' prepared.`);

    // 2. Read all files from the MDX directory
    const allFiles = await fs.readdir(MDX_DIR);
    const mdxFiles = allFiles.filter((file) => file.endsWith(".mdx"));

    if (mdxFiles.length === 0) {
      console.warn(`No .mdx files found in '${MDX_DIR}'. Build finished.`);
      return;
    }

    console.log(`Found ${mdxFiles.length} MDX files to compile.`);

    const manifest: any = [];

    // 3. Loop over each MDX file and compile it
    for (const fileName of mdxFiles) {
      const filePath = path.join(MDX_DIR, fileName);
      console.log(`- Compiling ${fileName}...`);

      const source = await fs.readFile(filePath, "utf-8");
      const { content, toc, meta } = await compileMDX(source, "json");
      const { markdown } = await compileMDX(source, "markdown");

      // Determine the output folder name from the mdx filename (e.g., "example.mdx" -> "example")
      const outputFolderName = path.basename(fileName, ".mdx");
      const exampleOutputDir = path.join(OUTPUT_DIR, outputFolderName);

      // Create a dedicated folder for this example's assets
      await fs.mkdir(exampleOutputDir, { recursive: true });

      // Write the compiled content, TOC, and metadata
      await fs.writeFile(
        path.join(exampleOutputDir, "content.json"),
        content,
        "utf-8"
      );
      await fs.writeFile(
        path.join(exampleOutputDir, "toc.json"),
        toc,
        "utf-8"
      );
      await fs.writeFile(
        path.join(exampleOutputDir, "meta.json"),
        JSON.stringify(meta, null, 2),
        "utf-8"
      );
      await fs.writeFile(
        path.join(exampleOutputDir, "readme.md"),
        markdown,
        "utf-8"
      );

      // Add this example's metadata to our manifest
      manifest.push({
        slug: outputFolderName,
        ...meta,
      });
    }

    // 4. Write the final manifest file to the root of the output directory
    await fs.writeFile(
      path.join(OUTPUT_DIR, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );
    console.log("Successfully wrote manifest.json.");

    console.log(
      "\nBuild complete! Check the 'dist' directory for the compiled output."
    );
  } catch (error) {
    console.error("An error occurred during the build process:", error);
    process.exit(1); // Exit with an error code
  }
}

build();