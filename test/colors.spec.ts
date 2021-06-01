import { describe, expect, it } from '@jest/globals';

import { wrap } from '../src/colors';

describe('Colors', () => {
  describe('wrap', () => {
    it('does nothing if invalid color given', () => {
      // @ts-expect-error
      expect(wrap('unknown', 'test')).toEqual('test');
    });

    it('wraps in color without resetColor given', () => {
      // @ts-expect-error
      expect(wrap('white', 'test')).toEqual('\u000300test\u000f');
    });

    it('wraps in color with resetColor given', () => {
      expect(wrap('white', 'test', 'black')).toEqual('\u000300test\u000301');
    });

    it('wraps in color even with invalid resetColor given', () => {
      // @ts-expect-error
      expect(wrap('white', 'test', 'invalid')).toEqual('\u000300test\u000f');
    });
  });
});
