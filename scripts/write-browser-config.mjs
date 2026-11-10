import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const required = ['PUBLIC_API_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  throw new Error(`Missing build environment values: ${missing.join(', ')}`);
}

const config = {
  apiBaseUrl: process.env.PUBLIC_API_URL.replace(/\/$/, ''),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY
};
const source = `window.TV_ONE_CONFIG = Object.freeze(${JSON.stringify(config)});\n`;

for (const app of ['admin', 'player']) {
  const assets = resolve(process.cwd(), 'apps', app, 'src', 'assets');
  await mkdir(assets, { recursive: true });
  await writeFile(resolve(assets, 'runtime-config.js'), source, {
    encoding: 'utf8',
    mode: 0o644
  });
}

console.info('Generated public runtime configuration for admin and player.');
