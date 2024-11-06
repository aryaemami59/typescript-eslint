import semver from 'semver';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Parser from '../../src/parser';

vi.mock('semver');

describe('Warn on unsupported TypeScript version', () => {
  let parser: typeof Parser;

  beforeEach(async () => {
    parser = await import('../../src/parser.js');
  });
  afterEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('should warn the user if they are using an unsupported TypeScript version', () => {
    vi.mocked(semver.satisfies).mockReturnValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('process', { ...process, stdout: { isTTY: true } });

    parser.parse('');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'WARNING: You are currently running a version of TypeScript which is not officially supported by @typescript-eslint/typescript-estree.',
      ),
    );

    vi.unstubAllGlobals();
  });

  it('should warn the user if they are running on a non TTY process and a custom loggerFn was passed', () => {
    vi.mocked(semver.satisfies).mockReturnValue(false);
    const loggerFn = vi.fn();
    vi.stubGlobal('process', { ...process, stdout: { isTTY: false } });

    parser.parse('', {
      loggerFn,
    });
    expect(loggerFn).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('should not warn the user if they are running on a non TTY process and a custom loggerFn was not passed', () => {
    vi.mocked(semver.satisfies).mockReturnValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('process', { ...process, stdout: { isTTY: false } });

    parser.parse('');
    expect(console.log).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
