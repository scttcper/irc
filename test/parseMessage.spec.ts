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

it('parses IRCv3 message tags before the source and command', () => {
  expect(
    parseMessage('@aaa=bbb;ccc;escaped=hello\\sworld :nick!user@host PRIVMSG #chan :hi'),
  ).toEqual({
    args: ['#chan', 'hi'],
    command: 'PRIVMSG',
    commandType: 'normal',
    host: 'host',
    nick: 'nick',
    prefix: 'nick!user@host',
    rawCommand: 'PRIVMSG',
    tags: {
      aaa: 'bbb',
      ccc: true,
      escaped: 'hello world',
    },
    user: 'user',
  });
});

it('keeps an empty trailing parameter', () => {
  expect(parseMessage(':irc.example CAP * LIST :')).toEqual({
    args: ['*', 'LIST', ''],
    command: 'CAP',
    commandType: 'normal',
    prefix: 'irc.example',
    rawCommand: 'CAP',
    server: 'irc.example',
  });
});

it('normalizes commands and does not invent parameters for command-only messages', () => {
  expect(parseMessage('ping :token')).toEqual({
    args: ['token'],
    command: 'PING',
    commandType: 'normal',
    rawCommand: 'PING',
  });

  expect(parseMessage('PING')).toEqual({
    args: [],
    command: 'PING',
    commandType: 'normal',
    rawCommand: 'PING',
  });
});
