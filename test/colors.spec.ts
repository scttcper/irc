import { expect, it } from 'vitest';

import { wrap } from '../src/colors.js';

it('does nothing if invalid color given', () => {
  // @ts-expect-error
  expect(wrap('unknown', 'test')).toBe('test');
});

it('wraps in color without resetColor given', () => {
  // @ts-expect-error
  expect(wrap('white', 'test')).toBe('\u000300test\u000f');
});

it('wraps in color with resetColor given', () => {
  expect(wrap('white', 'test', 'black')).toBe('\u000300test\u000301');
});

it('wraps in color even with invalid resetColor given', () => {
  // @ts-expect-error
  expect(wrap('white', 'test', 'invalid')).toBe('\u000300test\u000f');
});
