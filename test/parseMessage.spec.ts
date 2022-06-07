import { expect, it } from 'vitest';

import { parseMessage } from '../src/parseMessage.js';

import { nonStrict, noprefix, strict } from './fixtures/parseMessages.js';

for (const [message, result] of strict) {
  it(`in strict mode it parses nonstandard fixtures according to spec - ${message}`, () => {
    const stripColors = result.stripColors ?? false;
    delete result.stripColors;
    expect(parseMessage(message, stripColors, true)).toEqual(result);
  });
}

for (const [message, result] of nonStrict) {
  it(`in non-strict mode parses Unicode fixtures correctly - ${message}`, () => {
    expect(parseMessage(message)).toEqual(result);
  });
}

for (const [message, result] of noprefix) {
  it(`in non-strict mode does not crash with no prefix - ${message}`, () => {
    expect(parseMessage(message)).toEqual(result);
  });
}
