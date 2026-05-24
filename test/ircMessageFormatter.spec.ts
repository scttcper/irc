import { describe, expect, it } from 'vitest';

import { formatIrcMessage } from '../src/ircMessageFormatter.js';

describe('formatIrcMessage', () => {
  it('formats simple IRC commands', () => {
    expect(formatIrcMessage(['NICK', 'testbot'])).toEqual({
      byteLength: 14,
      line: 'NICK testbot\r\n',
      params: ['NICK', 'testbot'],
    });
  });

  it('marks params with spaces, leading colons, or empty strings as trailing params', () => {
    expect(formatIrcMessage(['PRIVMSG', '#test', 'hello there']).line).toBe(
      'PRIVMSG #test :hello there\r\n',
    );
    expect(formatIrcMessage(['PRIVMSG', '#test', ':)']).line).toBe('PRIVMSG #test ::)\r\n');
    expect(formatIrcMessage(['AWAY', '']).line).toBe('AWAY :\r\n');
  });

  it('rejects raw line separators in params', () => {
    expect(() => formatIrcMessage(['PRIVMSG', '#test', 'hello\r\nOPER bad'])).toThrow(
      'IRC message parameters cannot contain NUL, CR, or LF characters',
    );
    expect(() => formatIrcMessage(['PRIVMSG', '#test', 'bad\0value'])).toThrow(
      'IRC message parameters cannot contain NUL, CR, or LF characters',
    );
  });
});
