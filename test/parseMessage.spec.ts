import { describe, it, expect } from '@jest/globals';

import { parseMessage } from '../src/parseMessage';
import { strict, nonStrict, noprefix } from './fixtures/parseMessages';

describe('parseMessage', () => {
  describe('in strict mode', () => {
    it.each(strict)('parses nonstandard fixtures according to spec - %s', (message, result) => {
      const stripColors = result.stripColors ?? false;
      delete result.stripColors;
      expect(parseMessage(message, stripColors, true)).toEqual(result);
    });
  });

  describe('in non-strict mode', () => {
    it.each(nonStrict)('parses Unicode fixtures correctly - %s', (message, result) => {
      expect(parseMessage(message)).toEqual(result);
    });

    it.each(noprefix)('does not crash with no prefix - %s', (message, result) => {
      expect(parseMessage(message)).toEqual(result);
    });
  });
});
