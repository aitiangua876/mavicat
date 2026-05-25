import { describe, it, expect } from 'vitest';
import { APP_DISPLAY_VERSION, APP_VERSION } from '@/version';

describe('version', () => {
  it('should export a version string', () => {
    expect(typeof APP_VERSION).toBe('string');
    expect(APP_VERSION).toBeTruthy();
  });

  it('should follow semantic versioning format', () => {
    // Semantic versioning: MAJOR.MINOR.PATCH with optional prerelease date.
    const semverRegex = /^\d+\.\d+\.\d+(?:-\d{8})?$/;
    expect(APP_VERSION).toMatch(semverRegex);
  });

  it('should have numeric version components', () => {
    const parts = APP_VERSION.split('-')[0].split('.');
    expect(parts).toHaveLength(3);
    
    parts.forEach(part => {
      expect(Number.isInteger(Number(part))).toBe(true);
      expect(Number(part)).toBeGreaterThanOrEqual(0);
    });
  });

  it('should not contain whitespace', () => {
    expect(APP_VERSION.trim()).toBe(APP_VERSION);
    expect(APP_VERSION).not.toContain(' ');
    expect(APP_VERSION).not.toContain('\t');
    expect(APP_VERSION).not.toContain('\n');
  });

  it('should expose the package display version', () => {
    expect(APP_DISPLAY_VERSION).toMatch(/^v1\.0-\d{8}$/);
  });
});
