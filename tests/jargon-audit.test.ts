import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CREATOR_UI_DIR = path.resolve(process.cwd(), 'src/renderer/components');

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsxFiles(full));
    else if (entry.name.endsWith('.tsx') && entry.name !== 'AdvancedModeView.tsx') {
      out.push(full);
    }
  }
  return out;
}

describe('Creator Mode Visual & Terminology Discipline Audit (Req 1.4 & 6.1)', () => {
  const files = collectTsxFiles(CREATOR_UI_DIR);

  it('contains zero forbidden AI SaaS indigo/purple styles or sparkle emojis in Creator Mode', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content, `${path.basename(file)} must not use ✨ emoji`).not.toContain('✨');
      expect(content, `${path.basename(file)} must not use Tailwind indigo/purple/violet classes`).not.toMatch(
        /\b(bg|text|border|from|to|via)-(indigo|purple|violet)-/
      );
    }
  });

  it('exposes zero prohibited底层技术术语 in Creator Mode user-visible labels', () => {
    const forbiddenVisibleTerms = [
      /\.rpy\b/i,
      /\bLint\b/,
      /\bEndpoint\b/i,
      /\bProvider ID\b/i,
      /\bFunction Calling\b/i,
      /\bSDK\s*路径/,
      /\bDiff\b/,
    ];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        for (const re of forbiddenVisibleTerms) {
          expect(
            re.test(trimmed),
            `${path.basename(file)}:${idx + 1} exposed technical term matching ${re}: ${trimmed}`
          ).toBe(false);
        }
      });
    }
  });
});
