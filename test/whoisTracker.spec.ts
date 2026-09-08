import { describe, expect, it } from 'vitest';

import { parseMessage } from '../src/parseMessage.js';
import { WhoisTracker } from '../src/whoisTracker.js';

describe('whois tracker', () => {
  it.each(['__proto__', 'constructor', 'toString'])(
    'treats %s as a nickname without modifying inherited objects',
    async nick => {
      const tracker = new WhoisTracker();
      const request = tracker.request(nick);
      const prototype = Object.getOwnPropertyDescriptors(Object.prototype);

      tracker.handleMessage(parseMessage(`:server 311 bot ${nick} user host * :Real Name`));
      const result = tracker.handleMessage(parseMessage(`:server 318 bot ${nick} :End`));

      await expect(request.promise).resolves.toEqual({
        nick,
        user: 'user',
        host: 'host',
        realname: 'Real Name',
      });
      expect(result).not.toBe(Object.prototype);
      expect(result).not.toBe(Object);
      expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(prototype);
    },
  );

  it('handles who replies that do not include a hopcount prefix in the realname field', async () => {
    const tracker = new WhoisTracker();
    const request = tracker.request('friend');

    const result = tracker.handleMessage(
      parseMessage(':localhost 352 testbot #test user host server friend H :Friend User'),
    );

    expect(result).toEqual(
      expect.objectContaining({
        nick: 'friend',
        realname: 'Friend User',
        server: 'server',
        user: 'user',
        host: 'host',
      }),
    );
    await expect(request.promise).resolves.toEqual(result);
  });

  it('accumulates multiple whois channel batches', () => {
    const tracker = new WhoisTracker();

    tracker.handleMessage(parseMessage(':localhost 319 testbot friend :#one #two'));
    tracker.handleMessage(parseMessage(':localhost 319 testbot friend :#three'));

    expect(
      tracker.handleMessage(parseMessage(':localhost 318 testbot friend :End of /WHOIS list.')),
    ).toEqual(
      expect.objectContaining({
        channels: ['#one', '#two', '#three'],
      }),
    );
  });

  it('rejects pending requests when the connection closes', async () => {
    const tracker = new WhoisTracker();
    const request = tracker.request('friend');

    tracker.rejectAll(new Error('Disconnected before WHOIS completed'));

    await expect(request.promise).rejects.toThrow('Disconnected before WHOIS completed');
  });
});
