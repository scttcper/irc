import { expect, it } from 'vitest';

import { formatCtcpMessage, isCtcpMessage, parseCtcpMessage } from '../src/ctcp.js';

it('detects CTCP-delimited messages', () => {
  expect(isCtcpMessage('\u0001VERSION\u0001')).toBe(true);
  expect(isCtcpMessage('VERSION')).toBe(false);
  expect(isCtcpMessage('\u0001VERSION')).toBe(false);
});

it('parses action messages', () => {
  expect(parseCtcpMessage('\u0001ACTION waves hello\u0001', 'privmsg')).toEqual({
    command: 'ACTION',
    isAction: true,
    isVersionRequest: false,
    params: 'waves hello',
    pingReply: undefined,
    text: 'ACTION waves hello',
  });
});

it('marks version and ping requests only for privmsg CTCP', () => {
  expect(parseCtcpMessage('\u0001VERSION\u0001', 'privmsg')).toEqual(
    expect.objectContaining({ isVersionRequest: true }),
  );
  expect(parseCtcpMessage('\u0001PING 123\u0001', 'privmsg')).toEqual(
    expect.objectContaining({ pingReply: 'PING 123' }),
  );
  expect(parseCtcpMessage('\u0001PING 123\u0001', 'notice')).toEqual(
    expect.objectContaining({ pingReply: undefined }),
  );
});

it('formats CTCP messages', () => {
  expect(formatCtcpMessage('PING 123')).toBe('\u0001PING 123\u0001');
});
