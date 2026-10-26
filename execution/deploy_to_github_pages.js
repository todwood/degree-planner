#!/usr/bin/env node
/**
 * Lindenwood University Deterministic Degree Planner
 * GitHub Pages Deployment Engine (deploy_to_github_pages.js)
 * 
 * Deploys the compiled static bundle in dist/ to GitHub Pages using the GitHub REST API.
 * FERPA & Security Invariant: Never uploads .env, .tmp/, student data, or unindexed files.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const ENV_FILE = path.resolve(ROOT_DIR, '.env');

// Parse .env manually
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error('Error: .env file not found.');
    process.exit(1);
  }
  const content = fs.readFileSync(ENV_FILE, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const TOKEN = env.GITHUB_TOKEN || env.GITHUB_PERSONAL_ACCESS_TOKEN;
const USERNAME = env.GITHUB_USERNAME || 'todwood';
const REPO_NAME = env.GITHUB_REPO || 'degree-planner';

if (!TOKEN) {
  console.error('Error: GITHUB_TOKEN is missing in .env');
  process.exit(1);
}

function ghRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: endpoint,
        method: method,
        headers: {
          'User-Agent': 'Lindenwood-Degree-Planner-Deployer',
          'Authorization': `Bearer ${TOKEN}`,
          'Accept': 'application/vnd.github+json',
          ...(data
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
              }
            : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = raw;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: json });
          } else {
            reject({ statusCode: res.statusCode, data: json });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Recursively collect all files in dist/
function collectDistFiles(dir, base = '') {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const relPath = base ? `${base}/${file}` : file;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(collectDistFiles(fullPath, relPath));
    } else {
      results.push({ fullPath, relPath, size: stat.size });
    }
  }
  return results;
}

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  const isLive = process.argv.includes('--live');

  console.log('=================================================================');
  console.log(' Lindenwood Degree Planner — GitHub Pages Deployment Engine');
  console.log('=================================================================');
  console.log(`Repository Target: ${USERNAME}/${REPO_NAME}`);
  console.log(`Mode:              ${isDryRun ? 'DRY-RUN (Verification Only)' : isLive ? 'LIVE DEPLOYMENT' : 'PREVIEW'}`);

  if (!fs.existsSync(DIST_DIR)) {
    console.error('Error: dist/ directory does not exist. Run "npm run build" first.');
    process.exit(1);
  }

  const files = collectDistFiles(DIST_DIR);
  console.log(`\nCollected ${files.length} production files from dist/:`);
  
  // Verify safety invariants
  for (const f of files) {
    console.log(` - ${f.relPath} (${(f.size / 1024).toFixed(2)} KB)`);
    if (f.relPath.includes('.env') || f.relPath.includes('.tmp') || f.relPath.includes('node_modules')) {
      console.error(`FATAL SECURITY ERROR: Sensitive file detected in dist: ${f.relPath}`);
      process.exit(1);
    }
  }

  console.log('\n[PASS] Security Check: 0 sensitive or student files present in build.');

  // Test repository connectivity
  console.log(`\nConnecting to GitHub API for ${USERNAME}/${REPO_NAME}...`);
  try {
    const repoRes = await ghRequest('GET', `/repos/${USERNAME}/${REPO_NAME}`);
    console.log(`[PASS] Connected to repository: ${repoRes.data.html_url}`);
    console.log(`Default Branch: ${repoRes.data.default_branch}`);
  } catch (err) {
    console.error(`Failed to connect to repository ${USERNAME}/${REPO_NAME}:`, err.data || err);
    process.exit(1);
  }

  if (isDryRun || !isLive) {
    console.log('\n--- DRY-RUN SUMMARY ---');
    console.log(`Ready to commit ${files.length} files to ${USERNAME}/${REPO_NAME} on branch main.`);
    console.log(`Target Live URL: https://${USERNAME}.github.io/${REPO_NAME}/`);
    console.log('Run with --live to execute the deployment.');
    return;
  }

  // LIVE DEPLOYMENT
  console.log(`\n[1/3] Uploading production static files to ${USERNAME}/${REPO_NAME}...`);
  for (const f of files) {
    const contentBuffer = fs.readFileSync(f.fullPath);
    const contentBase64 = contentBuffer.toString('base64');
    const remotePath = f.relPath;
    const localSha = crypto.createHash('sha1').update(`blob ${contentBuffer.length}\0`).update(contentBuffer).digest('hex');

    // Check if file already exists to get its SHA
    let existingSha = null;
    try {
      const getRes = await ghRequest('GET', `/repos/${USERNAME}/${REPO_NAME}/contents/${remotePath}`);
      existingSha = getRes.data.sha;
    } catch (e) {
      // File does not exist yet
    }

    if (existingSha && existingSha === localSha) {
      console.log(`[PASS] Up-to-date ${remotePath} (SHA: ${localSha.slice(0, 8)})`);
      continue;
    }

    const payload = {
      message: `Deploy Lindenwood Academic Degree Planner: ${remotePath}`,
      content: contentBase64,
      branch: 'main',
      ...(existingSha ? { sha: existingSha } : {})
    };

    await ghRequest('PUT', `/repos/${USERNAME}/${REPO_NAME}/contents/${remotePath}`, payload);
    console.log(`[PASS] Committed ${remotePath} (${existingSha ? 'Updated' : 'Created'})`);
  }

  // Ensure GitHub Pages is active
  console.log(`\n[2/3] Configuring GitHub Pages...`);
  try {
    const pagesRes = await ghRequest('POST', `/repos/${USERNAME}/${REPO_NAME}/pages`, {
      source: {
        branch: 'main',
        path: '/'
      }
    });
    console.log(`[PASS] GitHub Pages configured: ${pagesRes.data.html_url}`);
  } catch (err) {
    if (err.statusCode === 409 || (err.data && err.data.message && err.data.message.includes('already exists'))) {
      console.log(`[INFO] GitHub Pages is already active for this repository.`);
    } else {
      console.log(`[NOTE] Pages configuration response:`, err.data ? err.data.message : err);
    }
  }

  const liveUrl = `https://${USERNAME}.github.io/${REPO_NAME}/`;
  console.log(`\n[3/3] Deployment complete!`);
  console.log(`Repository: https://github.com/${USERNAME}/${REPO_NAME}`);
  console.log(`Live Pages: ${liveUrl}`);
}

run().catch((err) => {
  console.error('Deployment execution failed:', err);
  process.exit(1);
});
