import * as sinon from 'sinon';

import { IrcClient, IrcOptions } from '../src/irc.js';

/**
 * mocks out what would happen in the connect fn
 */
export function setupMockClient(nick: string, options?: Partial<IrcOptions>): IrcClient {
  const client = new IrcClient('', nick, options);
  client.connection = {
    currentBuffer: Buffer.from(''),
    // @ts-expect-error
    socket: { write: sinon.fake() },
    // @ts-expect-error
    cyclingPingTimer: { notifyOfActivity: sinon.fake() },
  };
  client.nick = nick;

  return client;
}
