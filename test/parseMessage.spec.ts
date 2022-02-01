import test from 'ava';

import { parseMessage } from '../src/parseMessage.js';

import { nonStrict, noprefix, strict } from './fixtures/parseMessages.js';

for (const [message, result] of strict) {
  test(`in strict mode it parses nonstandard fixtures according to spec - ${message}`, t => {
    const stripColors = result.stripColors ?? false;
    delete result.stripColors;
    t.deepEqual(parseMessage(message, stripColors, true), result);
  });
}

for (const [message, result] of nonStrict) {
  test(`in non-strict mode parses Unicode fixtures correctly - ${message}`, t => {
    t.deepEqual(parseMessage(message), result);
  });
}

for (const [message, result] of noprefix) {
  test(`in non-strict mode does not crash with no prefix - ${message}`, t => {
    t.deepEqual(parseMessage(message), result);
  });
}
