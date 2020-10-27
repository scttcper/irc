import { describe, it, expect } from '@jest/globals';

import { parseMessage } from '../src/parseMessage';
import { strict } from './fixtures/parseMessages';

describe('parseMessage', () => {
  describe('in strict mode', () => {
    it.each(strict)('parses nonstandard fixtures according to spec - %s', (message, result) => {
      const stripColors = result.stripColors ?? false;
      delete result.stripColors;
      expect(parseMessage(message, stripColors, true)).toEqual(result);
    });
  });

  // describe('in non-strict mode', () => {
  //   // sharedExamples('non-strict');

  //   it('parses Unicode fixtures correctly', () => {
  //     var checks = testHelpers.getFixtures('parse-line-nonstrict');

  //     Object.keys(checks).forEach(function (line) {
  //       expect(JSON.stringify(parseMessage(line, false, false))).toEqual(
  //         JSON.stringify(checks[line]),
  //       );
  //     });
  //   });

  //   it('does not crash with no prefix', () => {
  //     var checks = testHelpers.getFixtures('parse-line-noprefix');

  //     Object.keys(checks).forEach(function (line) {
  //       expect(JSON.stringify(parseMessage(line, false, false))).toEqual(
  //         JSON.stringify(checks[line]),
  //       );
  //     });
  //   });
  // });
});
