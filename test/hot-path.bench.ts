import { bench, describe } from 'vitest';

import { IrcClient, type IrcOptions } from '../src/irc.js';
import { parseMessage } from '../src/parseMessage.js';

const line = ':nick!user@example.com PRIVMSG #bench :hello world with spaces';
const coloredLine = ':nick!user@example.com PRIVMSG #bench :\u000304hello \u0002bold\u0002 world';
const payload = `${line}\r\n`;
const payloadBytes = new TextEncoder().encode(payload);
const fragmentedPayload = [...payload];

function createClient(options: Partial<IrcOptions> = {}) {
  const client = new IrcClient('', 'bench', { stripColors: false, ...options });
  client.connection = {
    socket: {
      write() {},
      destroy() {},
    },
    cyclingPingTimer: {
      notifyOfActivity() {},
      stop() {},
    },
  } as unknown as IrcClient['connection'];

  return client;
}

describe('parser hot paths', () => {
  bench('parseMessage plain', () => {
    parseMessage(line, false, false);
  });

  bench('parseMessage strip colors', () => {
    parseMessage(coloredLine, true, false);
  });
});

describe('client data hot paths', () => {
  const completeLineClient = createClient();
  bench('handleData complete string line', () => {
    completeLineClient.handleData(payload);
  });

  const completeBytesClient = createClient();
  bench('handleData complete byte line', () => {
    completeBytesClient.handleData(payloadBytes);
  });

  const fragmentedClient = createClient();
  bench('handleData fragmented string line', () => {
    for (const chunk of fragmentedPayload) {
      fragmentedClient.handleData(chunk);
    }
  });

  const latin1Client = createClient({ encoding: 'latin1' });
  bench('handleData latin1 byte line', () => {
    latin1Client.handleData(payloadBytes);
  });
});
