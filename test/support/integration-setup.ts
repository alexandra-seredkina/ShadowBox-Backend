import { execFileSync } from 'node:child_process';

export function setup(): void {
  if (process.env['DATABASE_URL'] === undefined) {
    throw new Error(
      'Integration tests need DATABASE_URL of a disposable database',
    );
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });
}
