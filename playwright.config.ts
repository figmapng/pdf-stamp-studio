import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

function findCachedExecutable(prefix: string, subpath: string): string | undefined {
  const cacheRoot = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!existsSync(cacheRoot)) return undefined;
  const entries = readdirSync(cacheRoot).filter((d) => d.startsWith(prefix)).sort().reverse();
  for (const dir of entries) {
    const candidate = join(cacheRoot, dir, subpath);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const cachedChromium = findCachedExecutable(
  'chromium_headless_shell-',
  join('chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
);
const cachedWebkit = findCachedExecutable('webkit-', 'pw_run.sh');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: cachedChromium ? { executablePath: cachedChromium } : undefined,
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        launchOptions: cachedWebkit ? { executablePath: cachedWebkit } : undefined,
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
