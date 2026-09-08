import { EventEmitter } from 'node:events';

import { afterEach, expect, it, vi } from 'vitest';

import { IrcClient } from '../src/irc.js';

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('node:net', () => ({ connect }));

class MockSocket extends EventEmitter {
  write = vi.fn();
  setEncoding = vi.fn();
  destroy = vi.fn(() => this.emit('close'));
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  connect.mockReset();
});

it('resets connection state while retaining subscriptions and user listeners', async () => {
  vi.useFakeTimers();
  const sockets: MockSocket[] = [];
  connect.mockImplementation(() => {
    const socket = new MockSocket();
    sockets.push(socket);
    return socket;
  });
  const client = new IrcClient('server', 'bot', { retryDelay: 10 });
  const joined = vi.fn();
  client.on('join', joined);
  client.connect();
  connect.mock.calls[0][1]();
  client.join('#test');
  sockets[0].emit('data', ':bot!u@h JOIN #test\r\n:server 353 bot = #test :bot departed\r\n');
  client.join('#denied');
  client.handleData(':server 005 bot PREFIX=(qaohv)~&@%+ CHANTYPES=& :supported\r\n');
  client.handleData(':server 322 bot #old 2 :Old topic\r\n:server 375 bot :Old MOTD\r\n');
  const pending = client.whois('friend');
  client.handleData(
    ':server 311 bot friend old old.host * :Friend\r\n:server 319 bot friend :#old\r\n',
  );
  sockets[0].destroy();
  await expect(pending).rejects.toThrow('Disconnected');
  vi.advanceTimersByTime(10);
  connect.mock.calls[1][1]();
  expect(client.chans).toEqual({});
  expect(client.channellist).toEqual([]);
  expect(client.motd).toBeUndefined();
  expect(client.prefixForMode).toEqual({ o: '@', v: '+' });
  expect(client.supported.channel.types).toBe('#&');
  expect(client.listenerCount('join')).toBe(1);

  sockets[1].emit('data', ':server 422 bot :No MOTD\r\n');
  expect(sockets[1].write).toHaveBeenCalledWith('JOIN #test\r\n');
  sockets[1].emit('data', ':bot!u@h JOIN #test\r\n:server 353 bot = #test :bot newcomer\r\n');
  expect(client.chans['#test'].users).toEqual({ bot: '', newcomer: '' });
  expect(joined).toHaveBeenCalledTimes(2);
  const fresh = client.whois('friend');
  client.handleData(
    ':server 311 bot friend new new.host * :Friend\r\n:server 318 bot friend :End\r\n',
  );
  await expect(fresh).resolves.toEqual({
    nick: 'friend',
    user: 'new',
    host: 'new.host',
    realname: 'Friend',
  });
  client.end();
});
