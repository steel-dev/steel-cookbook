import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadObjectCommand,
  _Object,
} from "@aws-sdk/client-s3";
import "dotenv/config";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
} = process.env;

if (
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET_NAME
) {
  throw new Error("Missing one or more required R2 environment variables.");
}

const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const directory = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(directory, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "./dist");
const MANIFEST_FILEPATH = path.join(OUTPUT_DIR, "./manifest.json");
const VERSIONS_PREFIX = "versions/";

async function getFilesRecursively(dir: string): Promise<string[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFilesRecursively(res) : res;
    }),
  );
  return files.flat();
}

async function listAllObjects(prefix: string) {
  const objects: _Object[] = [];
  let isTruncated = true;
  let continuationToken: string | undefined;

  while (isTruncated) {
    const response = await S3.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    if (response.Contents) {
      objects.push(...response.Contents);
    }
    isTruncated = !!response.IsTruncated;
    continuationToken = response.NextContinuationToken;
  }

  return objects;
}

function getContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".json":
      return "application/json";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".gz":
      return "application/gzip";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export async function main() {
  const manifestContent = await fs.readFile(MANIFEST_FILEPATH, "utf-8");
  const manifest: { version?: string } = JSON.parse(manifestContent);
  const newVersion = manifest.version;

  if (!newVersion) {
    throw new Error("Manifest is missing a 'version' field.");
  }
  console.log(`Deploying new version: ${newVersion}`);

  console.log(`\nUploading files for version '${newVersion}'...`);
  const allFiles = await getFilesRecursively(OUTPUT_DIR);

  const uploadPromises = allFiles.map(async (filePath) => {
    const relativePath = path.relative(OUTPUT_DIR, filePath);
    const r2Key = `${VERSIONS_PREFIX}${newVersion}/${relativePath}`;
    const fileContent = await fs.readFile(filePath);
    const contentType = getContentType(filePath);

    await S3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        Body: fileContent,
        ContentType: contentType,
      }),
    );
    console.log(`  ✔ Uploaded ${relativePath} (as ${contentType})`);
  });

  await Promise.all(uploadPromises);

  console.log("\nUpdating root manifest.json...");
  await S3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: "manifest.json",
      Body: manifestContent,
    }),
  );
  console.log("  ✔ Root manifest updated.");

  await cleanupOldVersions(newVersion);

  console.log("\n✅ Deployment complete!");
}

async function cleanupOldVersions(newVersion: string) {
  console.log("\n🧹 Cleaning up old versions by deployment time...");

  const listResponse = await S3.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: VERSIONS_PREFIX,
      Delimiter: "/",
    }),
  );

  const versionPrefixes = listResponse.CommonPrefixes?.map(p => {
    return p.Prefix!.replace(VERSIONS_PREFIX, "").replace("/", "");
  }) ?? [];

  if (!versionPrefixes.includes(newVersion)) {
    versionPrefixes.push(newVersion);
  }

  const versionsWithTimestamps = await Promise.all(
    versionPrefixes.map(async (version) => {
      const manifestKey = `${VERSIONS_PREFIX}${version}/manifest.json`;
      try {
        const { LastModified } = await S3.send(
          new HeadObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: manifestKey,
          }),
        );
        return { version, deployedAt: LastModified! };
      } catch (error) {
        console.warn(
          `  - Could not get metadata for version ${version}, skipping.`,
        );
        return null;
      }
    }),
  );

  const sortedVersions = versionsWithTimestamps
    .filter((v): v is { version: string; deployedAt: Date } => v !== null)
    .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());

  if (sortedVersions.length <= 2) {
    console.log("  ✔ No old versions to delete. Keeping all versions.");
    return;
  }

  const versionsToKeep = sortedVersions.slice(0, 2);
  const versionsToDelete = sortedVersions.slice(2);

  console.log(
    `  - Keeping latest version: ${versionsToKeep[0].version} (deployed at ${versionsToKeep[0].deployedAt.toISOString()})`,
  );
  console.log(
    `  - Keeping previous version: ${versionsToKeep[1].version} (deployed at ${versionsToKeep[1].deployedAt.toISOString()})`,
  );

  if (versionsToDelete.length === 0) {
    return;
  }

  for (const { version, deployedAt } of versionsToDelete) {
    console.log(
      `  - Deleting version: ${version} (deployed at ${deployedAt.toISOString()})`,
    );
    const objects = await listAllObjects(`${VERSIONS_PREFIX}${version}/`);
    const keysToDelete = objects.map((obj) => ({ Key: obj.Key! }));

    if (keysToDelete.length > 0) {
      for (let i = 0; i < keysToDelete.length; i += 1000) {
        const chunk = keysToDelete.slice(i, i + 1000);
        await S3.send(
          new DeleteObjectsCommand({
            Bucket: R2_BUCKET_NAME,
            Delete: { Objects: chunk },
          }),
        );
      }
      console.log(`    ✔ Deleted ${keysToDelete.length} files.`);
    }
  }
}

main().catch((err) => {
  console.error("\nAn unexpected error occurred:", err);
  process.exit(1);
});
