import { expect, it } from 'vitest';

import { splitOutgoingMessage } from '../src/messageSplitter.js';

it('splits on word boundaries when possible', () => {
  expect(splitOutgoingMessage('one two three', 8)).toEqual(['one two', 'three']);
});

it('splits long words when no word boundary fits', () => {
  expect(splitOutgoingMessage('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
});

it('splits by utf-8 byte length without cutting code points', () => {
  expect(splitOutgoingMessage('😀😀😀', 8)).toEqual(['😀😀', '😀']);
});

it('splits multiple text lines and skips empty lines', () => {
  expect(splitOutgoingMessage('one\n\ntwo three', 5)).toEqual(['one', 'two', 'three']);
});

it('rejects impossible split budgets', () => {
  expect(() => splitOutgoingMessage('hello', 0)).toThrow(
    'IRC message split length must be greater than 0 bytes',
  );
});

it.each([1, 2, 3])('rejects a %i-byte budget that cannot fit an emoji', budget => {
  expect(() => splitOutgoingMessage('😀', budget)).toThrow('cannot fit the next UTF-8 character');
  expect(() => splitOutgoingMessage('abcd😀', budget)).toThrow(
    'cannot fit the next UTF-8 character',
  );
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  'rejects non-finite split budgets',
  budget => {
    expect(() => splitOutgoingMessage('hello', budget)).toThrow('split length');
  },
);
