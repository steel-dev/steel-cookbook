// https://github.com/steel-dev/steel-cookbook/tree/main/examples/stripe-projects-web-agent

/*
 * Vercel deployment helper adapted from Stripe's MIT-licensed
 * projects-templates repository:
 * https://github.com/stripe/projects-templates
 * Copyright (c) Stripe.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 *
 * It uploads this app and creates a production deployment with the Vercel
 * credentials provided by Stripe Projects. Only the app secrets named in
 * DEPLOY_ENV_ALLOWLIST are copied to Vercel.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.projects',
  '.vercel',
  'node_modules',
]);
const IGNORED_FILE_PATTERNS = [/^\.env(?:\..+)?$/, /\.log$/i, /\.tsbuildinfo$/];

const DEPLOY_ENV_ALLOWLIST = new Set([
  'OPENROUTER_API_API_KEY',
  'STEEL_API_KEY',
]);

const REQUIRED_DEPLOY_ENV_KEYS = [...DEPLOY_ENV_ALLOWLIST];

const VERCEL_CONTROL_ENV_DENYLIST = new Set([
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_TEAM_ID',
  'VERCEL_PROJECT_ID',
  'VERCEL_PROJECT_LINK',
  'VERCEL_PROJECT_URL',
]);

function normalizePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function shouldIgnoreFile(relativePath) {
  const normalized = normalizePath(relativePath);
  const parts = normalized.split('/');
  const fileName = parts.at(-1) ?? '';

  if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) {
    return true;
  }

  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

function parseEnvFile(contents) {
  const values = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

async function loadLocalEnv(rootDirectory) {
  const injectedKeys = new Set();

  for (const fileName of ['.env', '.env.local']) {
    try {
      const contents = await fs.readFile(path.join(rootDirectory, fileName), 'utf8');
      const values = parseEnvFile(contents);

      for (const [key, value] of Object.entries(values)) {
        if (!Object.prototype.hasOwnProperty.call(process.env, key) || injectedKeys.has(key)) {
          process.env[key] = value;
          injectedKeys.add(key);
        }
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        continue;
      }

      throw error;
    }
  }
}

async function collectProjectFiles(directory, rootDirectory, files = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(rootDirectory, absolutePath);

    if (!relativePath || shouldIgnoreFile(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectProjectFiles(absolutePath, rootDirectory, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function getVercelErrorMessage(payload, fallbackMessage) {
  if (payload && typeof payload === 'object') {
    const directError =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error &&
            typeof payload.error === 'object' &&
            typeof payload.error.message === 'string'
          ? payload.error.message
          : null;

    if (directError) {
      return directError;
    }

    if (typeof payload.message === 'string') {
      return payload.message;
    }
  }

  return fallbackMessage;
}

function collectDeploymentEnvironmentValues(sourceValues) {
  const values = {};

  for (const key of DEPLOY_ENV_ALLOWLIST) {
    if (VERCEL_CONTROL_ENV_DENYLIST.has(key)) {
      continue;
    }

    const rawValue = sourceValues[key];
    if (typeof rawValue !== 'string') {
      continue;
    }

    const trimmed = rawValue.trim();
    if (trimmed) {
      values[key] = trimmed;
    }
  }

  return values;
}

function requireDeploymentEnvironmentValues(values) {
  const missingKeys = REQUIRED_DEPLOY_ENV_KEYS.filter((key) => !values[key]);

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing Stripe Projects environment values: ${missingKeys.sort().join(', ')}. ` +
        'Refresh them with `stripe projects env --pull` and try again.',
    );
  }
}

async function syncProjectEnvironmentValues({ projectId, teamId, token, values }) {
  const syncedKeys = [];

  for (const [key, value] of Object.entries(values)) {
    const response = await fetch(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env?teamId=${encodeURIComponent(teamId)}&upsert=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          value,
          type: 'encrypted',
          target: ['production'],
        }),
      },
    );

    if (!response.ok) {
      let payload = null;

      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      throw new Error(
        getVercelErrorMessage(
          payload,
          `Unable to sync ${key} to the Vercel project environment.`,
        ),
      );
    }

    syncedKeys.push(key);
  }

  return syncedKeys;
}

async function uploadFileToVercel(absolutePath, rootDirectory, teamId, token) {
  const buffer = await fs.readFile(absolutePath);
  const sha = createHash('sha1').update(buffer).digest('hex');
  const file = normalizePath(path.relative(rootDirectory, absolutePath));

  const response = await fetch(
    `https://api.vercel.com/v2/files?teamId=${encodeURIComponent(teamId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Length': String(buffer.byteLength),
        'Content-Type': 'application/octet-stream',
        'x-vercel-digest': sha,
      },
      body: buffer,
    },
  );

  if (!response.ok) {
    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const fallbackMessage =
      response.status === 401 || response.status === 403
        ? 'The Vercel credentials from your Stripe project are no longer valid. Refresh them with `stripe projects env --pull` and try again.'
        : `Unable to upload ${file} to Vercel.`;

    throw new Error(
      response.status === 401 || response.status === 403
        ? fallbackMessage
        : getVercelErrorMessage(payload, fallbackMessage),
    );
  }

  return {
    file,
    sha,
    size: buffer.byteLength,
  };
}

async function main() {
  const rootDirectory = process.cwd();
  await loadLocalEnv(rootDirectory);

  const token = process.env.VERCEL_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim();

  if (!token || !projectId || !teamId) {
    throw new Error(
      'Vercel is not configured yet. Pull your Stripe project env again so the Vercel project identifiers and token are available.',
    );
  }

  const deploymentEnvironment = collectDeploymentEnvironmentValues(process.env);
  requireDeploymentEnvironmentValues(deploymentEnvironment);

  const absolutePaths = await collectProjectFiles(rootDirectory, rootDirectory);
  absolutePaths.sort((left, right) => left.localeCompare(right));

  if (absolutePaths.length === 0) {
    throw new Error('No deployable files were found in this app.');
  }

  const files = [];

  for (const absolutePath of absolutePaths) {
    files.push(await uploadFileToVercel(absolutePath, rootDirectory, teamId, token));
  }

  const syncedEnvironmentKeys = await syncProjectEnvironmentValues({
    projectId,
    teamId,
    token,
    values: deploymentEnvironment,
  });

  const response = await fetch(
    `https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(teamId)}&forceNew=1&skipAutoDetectionConfirmation=1`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        build: {
          env: deploymentEnvironment,
        },
        env: deploymentEnvironment,
        files,
        name: path.basename(rootDirectory),
        project: projectId,
        projectSettings: {
          framework: 'nextjs',
        },
        target: 'production',
      }),
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const fallbackMessage =
      response.status === 401 || response.status === 403
        ? 'The Vercel credentials from your Stripe project are no longer valid. Refresh them with `stripe projects env --pull` and try again.'
        : 'Unable to start the Vercel deployment.';

    throw new Error(
      response.status === 401 || response.status === 403
        ? fallbackMessage
        : getVercelErrorMessage(payload, fallbackMessage),
    );
  }

  if (!payload) {
    throw new Error(
      'Vercel returned an unexpected non-JSON response for the deployment. Check the Vercel dashboard or try again.',
    );
  }

  const deploymentUrl = typeof payload.url === 'string' ? `https://${payload.url}` : null;
  const inspectorUrl = typeof payload.inspectorUrl === 'string' ? payload.inspectorUrl : null;

  console.log('Deployment started successfully.');
  console.log(`Synced env vars: ${syncedEnvironmentKeys.sort().join(', ')}`);

  if (inspectorUrl) {
    console.log(`Inspect: ${inspectorUrl}`);
  }

  if (deploymentUrl) {
    console.log(`URL: ${deploymentUrl}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unable to start the Vercel deployment.';
  console.error(message);
  process.exitCode = 1;
});
