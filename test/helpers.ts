import { vi } from 'vitest';

import { IrcClient, IrcOptions } from '../src/irc.js';
import { LineReader } from '../src/lineReader.js';

/**
 * mocks out what would happen in the connect fn
 */
export function setupMockClient(nick: string, options?: Partial<IrcOptions>): IrcClient {
  const client = new IrcClient('', nick, options);
  client.connection = {
    // @ts-expect-error mock
    socket: { write: vi.fn(), destroy: vi.fn() },
    // @ts-expect-error mock
    cyclingPingTimer: { notifyOfActivity: vi.fn(), start: vi.fn(), stop: vi.fn() },
    lineReader: new LineReader(options?.encoding ?? null),
  };
  client.nick = nick;

  return client;
}
