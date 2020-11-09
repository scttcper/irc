import { IrcClient, IrcOptions } from '../src/irc';

/**
 * mocks out what would happen in the connect fn
 */
export function setupMockClient(nick: string, options?: Partial<IrcOptions>) {
  const client = new IrcClient('', nick, options);
  client.connection = {
    currentBuffer: Buffer.from(''),
    // @ts-expect-error
    socket: { write: jest.fn() },
    // @ts-expect-error
    cyclingPingTimer: { notifyOfActivity: jest.fn() },
  };
  client.nick = nick;

  return client;
}
