import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Manifest } from "./types";

const directory = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(directory, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const MANIFEST_FILE = path.join(DIST_DIR, "manifest.json");
const OUTPUT_CSV_FILE = path.join(DIST_DIR, "manifest.csv");

const ENABLE_GROUPING = false;

interface CsvRow {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    languages: string[];
    docs: string;
}

function escapeCsvField(field: string): string {
    return `"${field.replace(/"/g, '""')}"`;
}

async function generateCsv() {
    console.log("Starting CSV generation...");

    try {
        const manifestContents = await fs.readFile(MANIFEST_FILE, "utf-8");
        const manifest: Manifest = JSON.parse(manifestContents);
        console.log("Successfully read manifest.json.");

        const { groups, examples } = manifest;

        const processedItems = new Map<string, { id: string, title: string; description: string; languages: string[], docs: string, thumbnail: string }>();
        const groupsMap = new Map(groups.map((g) => [g.id, g]));

        if (ENABLE_GROUPING) {
            for (const example of examples) {
                if (example.groupId && groupsMap.has(example.groupId)) {
                    const groupId = example.groupId;
                    const group = groupsMap.get(groupId)!;

                    if (!processedItems.has(groupId)) {
                        processedItems.set(groupId, {
                            id: group.id,
                            title: group.title,
                            description: group.description,
                            languages: [],
                            docs: example.docs,
                            thumbnail: example.thumbnail || "",
                        });
                    }
                    processedItems.get(groupId)!.languages.push(example.language);
                } else {
                    processedItems.set(example.id, {
                        id: example.id,
                        title: example.title,
                        description: example.description,
                        languages: [example.language],
                        docs: example.docs,
                        thumbnail: example.thumbnail || "",
                    });
                }
            }
        } else {
            for (const example of examples) {
                processedItems.set(example.id, {
                    id: example.id,
                    title: example.title,
                    description: example.description,
                    languages: [example.language],
                    docs: example.docs,
                    thumbnail: example.thumbnail || "",
                });
            }
        }


        const csvData: CsvRow[] = Array.from(processedItems.values()).map((item) => ({
            id: item.id,
            thumbnail: item.thumbnail,
            title: item.title,
            description: item.description,
            languages: item.languages,
            docs: item.docs,
        }));

        const headers = ["id", "title", "description", "thumbnail", "languages", "docs"];
        const headerRow = headers.map(escapeCsvField).join(",") + "\n";

        const csvRows = csvData.map(row => {
            return [
                escapeCsvField(row.id),
                escapeCsvField(row.title),
                escapeCsvField(row.description),
                escapeCsvField(row.thumbnail),
                escapeCsvField(row.languages.join(";")),
                escapeCsvField(row.docs),
            ].join(",");
        }).join("\n");

        await fs.mkdir(DIST_DIR, { recursive: true });
        await fs.writeFile(OUTPUT_CSV_FILE, headerRow + csvRows, "utf-8");

        console.log(`\nCSV generation complete! Check '${OUTPUT_CSV_FILE}' for the output.`);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
             console.error(`Error: Could not find manifest file at '${MANIFEST_FILE}'.`);
             console.error("Please run the build script first to generate the manifest.");
        } else {
            console.error("An error occurred during CSV generation:", error);
        }
        process.exit(1);
    }
}

generateCsv();
