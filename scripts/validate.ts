import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mri from "mri";
import { validRange, minVersion, coerce, compare } from "semver";

const exec = promisify(execFile);

type Severity = "error" | "warning";

interface Issue {
  code: string;
  message: string;
  severity: Severity;
}

interface ExampleReport {
  id: string;
  dir: string;
  contentHash: string;
  totalBytes: number;
  largestFileBytes: number;
  issues: Issue[];
  kind: "node" | "python" | "unknown";
}

interface SummaryReport {
  total: number;
  checked: number;
  errors: number;
  warnings: number;
}

interface FullReport {
  summary: SummaryReport;
  examples: ExampleReport[];
}

const directory = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(directory, "..");
const EXAMPLES_DIR = path.join(ROOT_DIR, "examples");
const DIST_DIR = path.join(ROOT_DIR, "dist");

async function getRepoRoot(): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listExampleDirs(): Promise<string[]> {
  const dirents = await fs.readdir(EXAMPLES_DIR, { withFileTypes: true });
  return dirents
    .filter((d) => d.isDirectory())
    .map((d) => path.join(EXAMPLES_DIR, d.name));
}

function exampleIdFromDir(dir: string): string {
  return path.basename(dir);
}

function isValidId(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    const c = await fs.readFile(p, "utf-8");
    return JSON.parse(c) as T;
  } catch {
    return null;
  }
}

// Utilities for content normalization and policy checks
function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

let rootLicenseCache: string | null = null;
async function getRootLicenseText(): Promise<string | null> {
  if (rootLicenseCache !== null) return rootLicenseCache;
  try {
    const abs = path.join(ROOT_DIR, "LICENSE");
    const txt = await fs.readFile(abs, "utf-8");
    rootLicenseCache = normalizeNewlines(txt).trim();
    return rootLicenseCache;
  } catch {
    return null;
  }
}

function isProbablyBinary(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".zip",
  ".gz",
  ".tar",
  ".tgz",
  ".7z",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".bin",
]);

function fileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

async function checkTextFormatting(
  repoRoot: string,
  rel: string
): Promise<Issue[]> {
  const issues: Issue[] = [];
  const abs = path.join(repoRoot, rel);
  try {
    const buf = await fs.readFile(abs);
    const ext = fileExt(abs);
    if (binaryExtensions.has(ext) || isProbablyBinary(buf)) return issues;
    const s = buf.toString("utf-8");
    if (s.includes("\uFFFD")) {
      issues.push({
        code: "common.text.non_utf8",
        message: `non-UTF-8 or invalid UTF-8 sequences: ${rel}`,
        severity: "error",
      });
    }
    if (/\r\n/.test(s)) {
      issues.push({
        code: "common.text.crlf",
        message: `CRLF line endings detected: ${rel}`,
        severity: "error",
      });
    }
    if (s.length > 0 && !s.endsWith("\n")) {
      issues.push({
        code: "common.text.missing_final_newline",
        message: `final newline missing: ${rel}`,
        severity: "error",
      });
    }
  } catch {
    // ignore unreadable files
  }
  return issues;
}

async function gitTrackedFilesUnder(
  repoRoot: string,
  relDir: string
): Promise<string[]> {
  const { stdout } = await exec("git", ["ls-files", "-z", "--", relDir], {
    cwd: repoRoot,
  });
  return stdout.split("\0").filter(Boolean);
}

async function computeContentHash(
  repoRoot: string,
  relFiles: string[]
): Promise<{ hash: string; totalBytes: number; largestFileBytes: number }> {
  const hasher = createHash("sha256");
  let totalBytes = 0;
  let largest = 0;
  const sorted = [...relFiles].sort();
  for (const rel of sorted) {
    hasher.update(rel);
    const abs = path.join(repoRoot, rel);
    const buf = await fs.readFile(abs);
    totalBytes += buf.length;
    if (buf.length > largest) largest = buf.length;
    hasher.update(buf);
  }
  return { hash: hasher.digest("hex"), totalBytes, largestFileBytes: largest };
}

async function detectKind(
  exampleDir: string
): Promise<"node" | "python" | "unknown"> {
  if (await pathExists(path.join(exampleDir, "package.json"))) return "node";
  if (await pathExists(path.join(exampleDir, "requirements.txt")))
    return "python";
  if (await pathExists(path.join(exampleDir, "pyproject.toml")))
    return "python";
  return "unknown";
}

async function checkNodeExample(exampleDir: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  const pkgPath = path.join(exampleDir, "package.json");
  const pkg = await readJson<any>(pkgPath);
  if (!pkg)
    issues.push({
      code: "node.missing_package_json",
      message: "package.json missing or invalid",
      severity: "error",
    });
  if (
    pkg &&
    pkg.scripts &&
    typeof pkg.scripts.postinstall === "string" &&
    pkg.scripts.postinstall.trim().length > 0
  ) {
    issues.push({
      code: "node.postinstall_forbidden",
      message: "postinstall script is not allowed",
      severity: "error",
    });
  }
  if (pkg && !(pkg.scripts && (pkg.scripts.start || pkg.scripts.build))) {
    issues.push({
      code: "node.missing_scripts",
      message: "missing start/build script",
      severity: "warning",
    });
  }

  // steel-sdk minimum version and version spec sanity
  if (pkg) {
    const deps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.optionalDependencies || {}),
    } as Record<string, string>;
    if (Object.prototype.hasOwnProperty.call(deps, "steel-sdk")) {
      const spec = String(deps["steel-sdk"]);
      const bad =
        spec === "latest" ||
        spec === "*" ||
        spec.startsWith("git+") ||
        spec.startsWith("http://") ||
        spec.startsWith("https://") ||
        spec.startsWith("file:");
      if (bad) {
        issues.push({
          code: "node.steel_sdk_bad_spec",
          message: `steel-sdk version spec not allowed: ${spec}`,
          severity: "error",
        });
      } else if (process.env.MIN_STEEL_SDK) {
        const range = validRange(spec);
        if (!range) {
          issues.push({
            code: "node.steel_sdk_invalid_range",
            message: `steel-sdk has invalid semver range: ${spec}`,
            severity: "error",
          });
        } else {
          const min = minVersion(range);
          if (!min) {
            issues.push({
              code: "node.steel_sdk_unresolvable_range",
              message: `steel-sdk range cannot resolve minimum: ${spec}`,
              severity: "error",
            });
          } else {
            const minRequired = minVersion(
              validRange(`>=${process.env.MIN_STEEL_SDK!.trim()}`) as string
            );
            if (minRequired && min.compare(minRequired) < 0) {
              issues.push({
                code: "node.steel_sdk_below_min",
                message: `steel-sdk minimum ${process.env.MIN_STEEL_SDK} required, found ${spec}`,
                severity: "error",
              });
            }
          }
        }
      }
    } else {
      issues.push({
        code: "node.steel_sdk_missing",
        message: "steel-sdk not declared in dependencies",
        severity: "warning",
      });
    }
  }
  // package.json name must match example directory name
  const id = exampleIdFromDir(exampleDir);
  if (pkg) {
    if (!pkg.name || typeof pkg.name !== "string") {
      issues.push({
        code: "node.missing_name",
        message: "package.json name is missing",
        severity: "error",
      });
    } else if (pkg.name !== id) {
      issues.push({
        code: "node.pkg_name_mismatch",
        message: `package.json name '${pkg.name}' does not match directory '${id}'`,
        severity: "error",
      });
    }
  }
  return issues;
}

function pyVersionGE(a: string, b: string): boolean {
  const va = coerce(a);
  const vb = coerce(b);
  if (!va || !vb) return false;
  return compare(va, vb) >= 0;
}

function parseRequirements(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  for (const line of lines) {
    if (line.startsWith("-e ") || line.startsWith("http")) continue;
    const parts = line.split(/\s*;\s*/)[0];
    const m = parts.match(
      /^([A-Za-z0-9_.\-]+)\s*([<>=!~]{1,2})?\s*([^,\s]+)?(,.*)?$/
    );
    if (!m) continue;
    const name = m[1].toLowerCase();
    const op = m[2] || "";
    const ver = m[3] || "";
    let spec = "";
    if (op && ver) spec = `${op}${ver}`;
    map.set(name, spec);
  }
  return map;
}

function getMinPyRequirementsFromEnv(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("MIN_PY_")) continue;
    if (!v) continue;
    const pkg = k
      .replace(/^MIN_PY_/, "")
      .toLowerCase()
      .replace(/_/g, "-");
    map.set(pkg, v.trim());
  }
  return map;
}

function specEnsuresMin(spec: string, min: string): boolean {
  if (!spec) return false;
  // Accept forms: ==1.2.3, >=1.2.3, >1.2.3, ~=1.2.3
  const m = spec.match(/^([<>=~]{1,2})(.+)$/);
  if (!m) return false;
  const op = m[1];
  const ver = m[2];
  switch (op) {
    case "==":
      return pyVersionGE(ver, min);
    case ">=":
    case "~=":
      return pyVersionGE(ver, min);
    case ">":
      return pyVersionGE(ver, min); // conservative: >x where x>=min passes
    default:
      return false; // upper bounds (<=, <) or unknown do not ensure min
  }
}

async function checkPythonExample(exampleDir: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  const reqPath = path.join(exampleDir, "requirements.txt");
  const mainPy = path.join(exampleDir, "main.py");
  const hasMain = await pathExists(mainPy);
  const hasPyproject = await pathExists(
    path.join(exampleDir, "pyproject.toml")
  );
  if (!hasMain && !hasPyproject) {
    issues.push({
      code: "py.missing_entry",
      message: "missing main.py or pyproject.toml",
      severity: "warning",
    });
  }

  const minEnv = getMinPyRequirementsFromEnv();
  if (await pathExists(reqPath)) {
    const txt = await fs.readFile(reqPath, "utf-8");
    const reqs = parseRequirements(txt);
    // steel-sdk: require declaration, forbid URL/VCS/path specs, enforce min
    const steelSpec = reqs.get("steel-sdk") || "";
    const lines = txt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    const steelLines = lines.filter((l) => /^steel-sdk\b/i.test(l));
    if (!steelSpec && steelLines.length === 0) {
      issues.push({
        code: "py.steel_sdk_missing",
        message: "steel-sdk not declared in requirements.txt",
        severity: "warning",
      });
    } else {
      const hasBad = steelLines.some((l) =>
        /(git\+|https?:\/\/|file:\/\/|@\s*(git\+|https?:\/\/|file:\/\/))/.test(
          l
        )
      );
      if (hasBad) {
        issues.push({
          code: "py.steel_sdk_bad_spec",
          message: "steel-sdk version spec not allowed: direct URL/VCS/path",
          severity: "error",
        });
      }
      const minSteel = (
        process.env.MIN_PY_STEEL_SDK ||
        process.env.MIN_STEEL_SDK ||
        ""
      ).trim();
      if (minSteel) {
        if (!specEnsuresMin(steelSpec, minSteel)) {
          issues.push({
            code: "py.steel_sdk_below_min",
            message: `steel-sdk minimum ${minSteel} required, found spec '${steelSpec || "unspecified"}'`,
            severity: "error",
          });
        }
      }
    }
    for (const [pkg, minVer] of minEnv) {
      const spec = reqs.get(pkg);
      if (!spec) {
        issues.push({
          code: "py.pkg_missing",
          message: `${pkg} not declared in requirements.txt`,
          severity: "warning",
        });
        continue;
      }
      if (!specEnsuresMin(spec, minVer)) {
        issues.push({
          code: "py.pkg_below_min",
          message: `${pkg} must be >= ${minVer}, found spec '${spec}'`,
          severity: "error",
        });
      }
    }
  } else if (minEnv.size > 0) {
    // No requirements.txt but minima requested
    for (const [pkg] of minEnv) {
      issues.push({
        code: "py.requirements_missing",
        message: `requirements.txt missing; cannot verify ${pkg}`,
        severity: "warning",
      });
    }
  }

  return issues;
}

async function checkCommon(
  exampleDir: string,
  repoRoot: string,
  relDir: string,
  relFiles: string[]
): Promise<Issue[]> {
  const issues: Issue[] = [];
  const id = exampleIdFromDir(exampleDir);
  if (!isValidId(id))
    issues.push({
      code: "common.invalid_id",
      message: `invalid id: ${id}`,
      severity: "error",
    });
  const licensePath = path.join(exampleDir, "LICENSE");
  if (!(await pathExists(licensePath)))
    issues.push({
      code: "common.missing_license",
      message: "LICENSE missing",
      severity: "error",
    });
  const ignored = [
    "node_modules/",
    "venv/",
    ".venv/",
    "__pycache__/",
    "dist/",
    "build/",
    ".DS_Store",
  ];
  for (const rel of relFiles) {
    const norm = rel.replace(/\\/g, "/");
    for (const ig of ignored) {
      if (norm.includes(ig)) {
        issues.push({
          code: "common.ignored_artifact_tracked",
          message: `tracked artifact: ${rel}`,
          severity: "error",
        });
        break;
      }
    }
  }

  const forbiddenDirs = new Set([".ruff_cache", ".pytest_cache"]);
  const forbiddenFiles = new Set([
    ".python-version",
    ".tool-versions",
    ".npmrc",
    ".pypirc",
    "poetry.toml",
  ]);

  async function* walk(dir: string): AsyncGenerator<string> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const d of dirents) {
      const abs = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (forbiddenDirs.has(d.name)) {
          issues.push({
            code: "common.artifact_forbidden",
            message: `forbidden directory: ${path.relative(repoRoot, abs)}`,
            severity: "error",
          });
          continue;
        }
        if (
          [
            "node_modules",
            "venv",
            ".venv",
            "__pycache__",
            "dist",
            "build",
          ].includes(d.name)
        )
          continue;
        yield* walk(abs);
      } else if (d.isFile()) {
        const base = path.basename(abs);
        if (forbiddenFiles.has(base) || base.startsWith("coverage.")) {
          issues.push({
            code: "common.artifact_forbidden",
            message: `forbidden artifact: ${path.relative(repoRoot, abs)}`,
            severity: "error",
          });
          continue;
        }
        yield abs;
      }
    }
  }

  for await (const _ of walk(exampleDir)) {
    // walk emits issues for forbidden artifacts
  }

  // LICENSE content equality with root LICENSE
  const licensePathAbs = path.join(exampleDir, "LICENSE");
  if (await pathExists(licensePathAbs)) {
    try {
      const root = await getRootLicenseText();
      if (root) {
        const content = normalizeNewlines(
          await fs.readFile(licensePathAbs, "utf-8")
        ).trim();
        if (content !== root) {
          issues.push({
            code: "common.license_mismatch",
            message: "LICENSE content differs from root LICENSE",
            severity: "error",
          });
        }
      }
    } catch {}
  }

  // Text formatting checks for tracked files under this example
  for (const rel of relFiles) {
    if (!rel.startsWith(relDir)) continue;
    const textIssues = await checkTextFormatting(repoRoot, rel);
    issues.push(...textIssues);
  }
  return issues;
}

async function changedExampleDirs(
  repoRoot: string,
  sinceSha?: string
): Promise<string[] | null> {
  if (!sinceSha) return null;
  try {
    const { stdout } = await exec(
      "git",
      ["diff", "--name-only", `${sinceSha}...HEAD`, "--", "examples/"],
      { cwd: repoRoot }
    );
    const files = stdout.split("\n").filter(Boolean);
    const set = new Set<string>();
    for (const f of files) {
      const parts = f.split(path.sep);
      const idx = parts.indexOf("examples");
      if (idx >= 0 && parts.length > idx + 1) {
        const sub = parts.slice(0, idx + 2).join(path.sep);
        set.add(path.join(repoRoot, sub));
      }
    }
    return Array.from(set);
  } catch {
    return null;
  }
}

async function main() {
  const args = mri(process.argv.slice(2), {
    string: ["since"],
  });

  const repoRoot = await getRepoRoot();
  await fs.mkdir(DIST_DIR, { recursive: true });

  const allDirs = await listExampleDirs();
  const since =
    typeof args.since === "string" && args.since.length > 0
      ? args.since
      : undefined;
  const changed = await changedExampleDirs(repoRoot, since);
  const targetDirs =
    changed && changed.length > 0
      ? allDirs.filter((d) => changed.includes(d))
      : allDirs;

  const reports: ExampleReport[] = [];

  // Gather tsconfig.json canonical representation across examples
  const tsconfigMap = new Map<string, string | null>();
  for (const dir of allDirs) {
    const p = path.join(dir, "tsconfig.json");
    if (await pathExists(p)) {
      try {
        const raw = await fs.readFile(p, "utf-8");
        const obj = JSON.parse(raw);
        const canon = JSON.stringify(obj, Object.keys(obj).sort());
        tsconfigMap.set(dir, canon);
      } catch {
        tsconfigMap.set(dir, null);
      }
    } else {
      tsconfigMap.set(dir, null);
    }
  }
  const canonicalTs =
    Array.from(
      new Set(
        Array.from(tsconfigMap.values()).filter((v): v is string => v !== null)
      )
    ).sort()[0] || null;

  for (const dirAbs of targetDirs) {
    const id = exampleIdFromDir(dirAbs);
    const relDir = path.relative(repoRoot, dirAbs);
    const files = await gitTrackedFilesUnder(repoRoot, relDir);
    const { hash, totalBytes, largestFileBytes } = await computeContentHash(
      repoRoot,
      files
    );
    const kind = await detectKind(dirAbs);
    let issues: Issue[] = [];
    issues = issues.concat(await checkCommon(dirAbs, repoRoot, relDir, files));
    if (kind === "node") issues = issues.concat(await checkNodeExample(dirAbs));
    if (kind === "python")
      issues = issues.concat(await checkPythonExample(dirAbs));
    // tsconfig consistency warnings
    const thisTs = tsconfigMap.get(dirAbs) ?? null;
    const isTsPackage =
      thisTs !== null || files.some((f) => /\.(tsx?|mts|cts)$/.test(f));
    if (canonicalTs && isTsPackage) {
      if (thisTs === null) {
        issues.push({
          code: "common.tsconfig_missing",
          message: `tsconfig.json missing while present in others`,
          severity: "warning",
        });
      } else if (thisTs !== canonicalTs) {
        issues.push({
          code: "common.tsconfig_inconsistent",
          message: `tsconfig.json differs from canonical`,
          severity: "warning",
        });
      }
    }
    if (totalBytes > 5 * 1024 * 1024) {
      issues.push({
        code: "common.total_size_exceeded",
        message: `total size ${totalBytes} bytes exceeds 5MB`,
        severity: "warning",
      });
    }
    if (largestFileBytes > 3 * 1024 * 1024) {
      issues.push({
        code: "common.file_size_exceeded",
        message: `largest file ${largestFileBytes} bytes exceeds 3MB`,
        severity: "warning",
      });
    }
    reports.push({
      id,
      dir: relDir,
      contentHash: hash,
      totalBytes,
      largestFileBytes,
      issues,
      kind,
    });
  }

  let errors = 0;
  let warnings = 0;
  for (const r of reports) {
    for (const i of r.issues) {
      if (i.severity === "error") errors++;
      else warnings++;
    }
  }

  const full: FullReport = {
    summary: {
      total: allDirs.length,
      checked: reports.length,
      errors,
      warnings,
    },
    examples: reports.sort((a, b) => a.id.localeCompare(b.id)),
  };

  const outPath = path.join(DIST_DIR, "validate.json");
  await fs.writeFile(outPath, JSON.stringify(full, null, 2), "utf-8");

  for (const r of reports) {
    const name = r.id;
    const errs = r.issues.filter((i) => i.severity === "error");
    const warns = r.issues.filter((i) => i.severity === "warning");
    if (errs.length === 0 && warns.length === 0) {
      console.log(`✔ ${name}`);
    } else {
      console.log(
        `✖ ${name} (${errs.length} errors, ${warns.length} warnings)`
      );
      for (const i of r.issues) {
        const tag = i.severity === "error" ? "E" : "W";
        console.log(`  ${tag} ${i.code} ${i.message}`);
      }
    }
  }

  if (errors > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
