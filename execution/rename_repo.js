import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_FILE = path.resolve(__dirname, '..', '.env');

function loadEnv() {
  const content = fs.readFileSync(ENV_FILE, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return env;
}

const env = loadEnv();
const TOKEN = env.GITHUB_TOKEN;
const USERNAME = env.GITHUB_USERNAME || 'todwood';
const OLD_REPO = env.GITHUB_REPO || 'synapse-ai';
const NEW_REPO = 'degree-planner';

console.log(`Renaming repository from ${USERNAME}/${OLD_REPO} to ${USERNAME}/${NEW_REPO}...`);

const payload = JSON.stringify({
  name: NEW_REPO,
  description: 'Lindenwood University — Deterministic Academic Degree Planner & 8-Week Session Scheduler'
});

const req = https.request(
  {
    hostname: 'api.github.com',
    path: `/repos/${USERNAME}/${OLD_REPO}`,
    method: 'PATCH',
    headers: {
      'User-Agent': 'Degree-Planner-Deployer',
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  },
  (res) => {
    let raw = '';
    res.on('data', (c) => (raw += c));
    res.on('end', () => {
      console.log('GitHub API Status:', res.statusCode);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const data = JSON.parse(raw);
        console.log(`[PASS] Successfully renamed repository to: ${data.full_name}`);
        console.log(`Repository URL: ${data.html_url}`);
        
        // Update .env
        let envContent = fs.readFileSync(ENV_FILE, 'utf8');
        envContent = envContent.replace(
          new RegExp(`GITHUB_REPO=.*`),
          `GITHUB_REPO=${NEW_REPO}`
        );
        fs.writeFileSync(ENV_FILE, envContent, 'utf8');
        console.log(`[PASS] Updated .env with GITHUB_REPO=${NEW_REPO}`);
      } else {
        console.error('Rename failed:', raw);
        process.exit(1);
      }
    });
  }
);

req.on('error', (err) => {
  console.error('Network error during rename:', err);
  process.exit(1);
});

req.write(payload);
req.end();
