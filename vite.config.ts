import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

function gitOutput(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

const buildVersion = gitOutput('rev-parse --short HEAD') || 'dev';
const buildDate = gitOutput('log -1 --format=%cI').slice(0, 10);

export default defineConfig({
  base: '/super-snake/',
  server: { open: false },
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
});
