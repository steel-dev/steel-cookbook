import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
const SCHEMAS_DIR = path.join(ROOT_DIR, "./schemas");
const SCHEMAS_PREFIX = "schemas/";

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

export async function main() {
  console.log(`Uploading schema files from '${SCHEMAS_DIR}' to R2...`);

  const allSchemaFiles = await getFilesRecursively(SCHEMAS_DIR);

  if (allSchemaFiles.length === 0) {
    console.log("No schema files found to upload.");
    return;
  }

  const uploadPromises = allSchemaFiles.map(async (filePath) => {
    const relativePath = path.relative(SCHEMAS_DIR, filePath);
    const r2Key = `${SCHEMAS_PREFIX}${relativePath.replace(/\\/g, "/")}`;

    const fileContent = await fs.readFile(filePath);
    const contentType = "application/schema+json";

    await S3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        Body: fileContent,
        ContentType: contentType,
      }),
    );
    console.log(`  ✔ Uploaded ${relativePath} as ${r2Key}`);
  });

  await Promise.all(uploadPromises);

  console.log(`\n✅ ${allSchemaFiles.length} schema files uploaded successfully!`);
}

main().catch((err) => {
  console.error("\nAn unexpected error occurred:", err);
  process.exit(1);
});