import { describe, expect, it, vi } from 'vitest';

import { setupMockClient } from './helpers.js';

describe('ctcp client handling', () => {
  it('emits action and typed CTCP events from PRIVMSG', () => {
    const client = setupMockClient('testbot');
    const emitSpy = vi.spyOn(client, 'emit');

    client.handleData(':friend!u@h PRIVMSG #chan :\u0001ACTION waves hello\u0001\r\n');

    expect(emitSpy).toBeCalledWith(
      'ctcp',
      'friend',
      '#chan',
      'ACTION waves hello',
      'privmsg',
      expect.anything(),
    );
    expect(emitSpy).toBeCalledWith(
      'ctcp-privmsg',
      'friend',
      '#chan',
      'ACTION waves hello',
      expect.anything(),
    );
    expect(emitSpy).toBeCalledWith('action', 'friend', '#chan', 'waves hello', expect.anything());
  });

  it('answers CTCP PING requests with a CTCP notice', () => {
    const client = setupMockClient('testbot');

    client.handleData(':friend!u@h PRIVMSG testbot :\u0001PING 123\u0001\r\n');

    expect(client.connection.socket?.write).toBeCalledWith(
      'NOTICE friend :\u0001PING 123\u0001\r\n',
    );
  });
});
