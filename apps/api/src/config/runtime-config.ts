import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env } from './env.js';

const publicConfig = {
  apiBaseUrl: env.PUBLIC_API_URL,
  supabaseUrl: env.SUPABASE_URL,
  supabaseAnonKey: env.SUPABASE_ANON_KEY
};

const script = `window.TV_ONE_CONFIG = Object.freeze(${JSON.stringify(publicConfig)});\n`;

export async function writeBrowserRuntimeConfig(): Promise<void> {
  const applications = [
    resolve(process.cwd(), '../admin/dist/admin/browser'),
    resolve(process.cwd(), '../player/dist/player/browser')
  ];

  for (const applicationRoot of applications) {
    const assetsDirectory = resolve(applicationRoot, 'assets');
    await mkdir(assetsDirectory, { recursive: true });
    await writeFile(resolve(assetsDirectory, 'runtime-config.js'), script, {
      encoding: 'utf8',
      mode: 0o644
    });
  }
}
