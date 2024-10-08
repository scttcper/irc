import { vi } from 'vitest';

import { IrcClient, IrcOptions } from '../src/irc.js';

/**
 * mocks out what would happen in the connect fn
 */
export function setupMockClient(nick: string, options?: Partial<IrcOptions>): IrcClient {
  const client = new IrcClient('', nick, options);
  client.connection = {
    currentBuffer: Buffer.from(''),
    // @ts-expect-error mock
    socket: { write: vi.fn() },
    // @ts-expect-error mock
    cyclingPingTimer: { notifyOfActivity: vi.fn() },
  };
  client.nick = nick;

  return client;
}
