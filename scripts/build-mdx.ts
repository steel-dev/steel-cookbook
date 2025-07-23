import fs from "fs/promises";
import path from "path";
import { compileMDX } from "../utils/compile-mdx";
import { fileURLToPath } from "url";
import { execSync, execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const directory = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(directory, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "./dist");
const MDX_DIR = path.join(ROOT_DIR, "./mdx");
const GROUPS_FILE = path.join(MDX_DIR, "groups.json");

// Uses git ls-files to filter out ignored files
export async function packageTemplate(srcDir: string, outFile: string) {
  const absSrc = path.resolve(srcDir);
  const absOut = path.resolve(outFile);

  await fs.mkdir(path.dirname(absOut), { recursive: true });

  const { stdout: gitRoot } = await exec("git", ["rev-parse", "--show-toplevel"]);
  const repoRoot = gitRoot.trim();

  const { stdout } = await exec("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: repoRoot,
  });

  const files = stdout
    .split("\0")
    .filter(Boolean)
    .map((file) => ({
      abs: path.resolve(repoRoot, file),
      relToSrc: path.relative(absSrc, path.resolve(repoRoot, file)),
    }))
    .filter(({ relToSrc }) => !relToSrc.startsWith("..") && !path.isAbsolute(relToSrc))
    .map(({ relToSrc }) => relToSrc);

  if (files.length === 0) throw new Error("No files to package");

  await exec("tar", ["-czf", absOut, "-C", absSrc, ...files]);
}

async function build() {
  console.log("Starting MDX compilation...");

  try {
    // 1. Ensure the root output directory exists and is clean
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Output directory '${OUTPUT_DIR}' prepared.`);

    // <-- 2. Load and parse the groups JSON file
    console.log("Loading group definitions from groups.json...");
    const groupsFileContents = await fs.readFile(GROUPS_FILE, "utf-8");
    const groupsDefinition = JSON.parse(groupsFileContents);
    // Extract the array from the 'examples' key as per your file structure
    const groups = groupsDefinition.examples || [];
    console.log(`Loaded ${groups.length} group definitions.`);

    // 3. Read all files from the MDX directory
    const allFiles = await fs.readdir(MDX_DIR);
    const mdxFiles = allFiles.filter((file) => file.endsWith(".mdx"));

    if (mdxFiles.length === 0) {
      console.warn(`No .mdx files found in '${MDX_DIR}'. Build finished.`);
      return;
    }

    console.log(`Found ${mdxFiles.length} MDX files to compile.`);

    const manifest: any = [];

    // 4. Loop over each MDX file and compile it
    for (const fileName of mdxFiles) {
      const filePath = path.join(MDX_DIR, fileName);
      console.log(`- Compiling ${fileName}...`);

      const source = await fs.readFile(filePath, "utf-8");
      const { content, toc, meta } = await compileMDX(source, "json");
      const { markdown } = await compileMDX(source, "markdown");

      // ... (rest of the file writing and packaging logic is unchanged)
      const outputFolderName = path.basename(fileName, ".mdx");
      const exampleOutputDir = path.join(OUTPUT_DIR, outputFolderName);
      await fs.mkdir(exampleOutputDir, { recursive: true });
      await fs.writeFile(
        path.join(exampleOutputDir, "content.json"),
        content,
        "utf-8",
      );
      await fs.writeFile(
        path.join(exampleOutputDir, "toc.json"),
        toc,
        "utf-8",
      );
      await fs.writeFile(
        path.join(exampleOutputDir, "meta.json"),
        JSON.stringify(meta, null, 2),
        "utf-8",
      );
      await fs.writeFile(
        path.join(exampleOutputDir, "readme.md"),
        markdown,
        "utf-8",
      );
      const template = path.join(ROOT_DIR, meta.directory as string);
      const output = path.join(
        OUTPUT_DIR,
        "templates",
        (meta.id as string) + ".tar.gz",
      );
      await packageTemplate(template, output);
      const templateDirectory = path.relative(OUTPUT_DIR, output);
      manifest.push({
        slug: outputFolderName,
        ...meta,
        template: templateDirectory,
      });
    }

    // <-- 3. Write the final manifest file with both groups and examples
    const shortHash = execSync("git rev-parse --short HEAD").toString().trim();
    const manifestContents = {
      name: "Steel Registry",
      description: "A collection of examples for using Steel",
      version: shortHash,
      groups: groups, // Add the loaded groups array here
      examples: manifest,
    };
    await fs.writeFile(
      path.join(OUTPUT_DIR, "manifest.json"),
      JSON.stringify(manifestContents),
      "utf-8",
    );
    console.log("Successfully wrote manifest.json.");

    console.log(
      "\nBuild complete! Check the 'dist' directory for the compiled output.",
    );
  } catch (error) {
    console.error("An error occurred during the build process:", error);
    process.exit(1); // Exit with an error code
  }
}

build();