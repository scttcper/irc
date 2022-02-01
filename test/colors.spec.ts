import test from 'ava';

import { wrap } from '../src/colors.js';

test('does nothing if invalid color given', t => {
  // @ts-expect-error
  t.is(wrap('unknown', 'test'), 'test');
});

test('wraps in color without resetColor given', t => {
  // @ts-expect-error
  t.is(wrap('white', 'test'), '\u000300test\u000f');
});

test('wraps in color with resetColor given', t => {
  t.is(wrap('white', 'test', 'black'), '\u000300test\u000301');
});

test('wraps in color even with invalid resetColor given', t => {
  // @ts-expect-error
  t.is(wrap('white', 'test', 'invalid'), '\u000300test\u000f');
});
