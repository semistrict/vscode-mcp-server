import 'vitest';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface CustomMatchers<R = unknown> {
  toBeErrorMatching: (pattern: RegExp | string) => R
  toBeError: () => R
  toBeSuccess: () => R
  toBeSuccessWithText: (expected: string | RegExp) => R
}

declare module 'vitest' {
  interface Matchers<T = any> extends CustomMatchers<T> {}
}