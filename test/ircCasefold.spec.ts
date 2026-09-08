import { expect, it, vi } from 'vitest';

import { ircCasefold } from '../src/ircCasefold.js';

import { setupMockClient } from './helpers.js';

it.each([
  ['ascii', 'a[\\]^Ä'],
  ['rfc1459', 'a{|}~Ä'],
  ['strict-rfc1459', 'a{|}^Ä'],
  ['rfc1459-strict', 'a{|}^Ä'],
])('uses %s casemapping without folding Unicode', (mapping, expected) => {
  expect(ircCasefold('A[\\]^Ä', mapping)).toBe(expected);
});

it('recognizes self KICKs with differently cased nicknames', () => {
  const client = setupMockClient('Bot');
  client.handleData(':Bot!u@h JOIN #test\r\n:friend!u@h KICK #test bot :bye\r\n');
  expect(client.chans).toEqual({});
});

it('uses RFC1459 aliases for membership, user modes, and private messages', () => {
  const client = setupMockClient('[Bot]');
  const pm = vi.fn();
  client.on('pm', pm);
  client.handleData(':{bot}!u@h JOIN #[room]\r\n');
  client.handleData(':server 353 [Bot] = #[room] :[Bot] @[Friend]\r\n');
  client.handleData(':oper!u@h MODE #{room} -o {friend}\r\n');
  expect(client.chans['#{room}'].users['[Friend]']).toBe('');
  client.handleData(':[Friend]!u@h PRIVMSG {bot} :hello\r\n');
  expect(pm).toHaveBeenCalledTimes(1);
  client.handleData(':{friend}!u@h NICK NewFriend\r\n');
  expect(client.chans['#{room}'].users.NewFriend).toBe('');
  client.handleData(':newfriend!u@h PART #{room}\r\n');
  expect(client.chans['#{room}'].users).toEqual({ '[Bot]': '' });
  client.handleData(':[bot]!u@h PART #{room}\r\n');
  expect(client.chans).toEqual({});
});

it('reindexes channels and pending WHOIS when CASEMAPPING is advertised', async () => {
  const client = setupMockClient('Bot');
  client.handleData(':Bot!u@h JOIN #[room]\r\n');
  const pending = client.whois('[Friend]');
  client.handleData(':server 311 Bot [Friend] user host * :Friend\r\n');
  client.handleData(':server 005 Bot CASEMAPPING=ascii :supported\r\n');
  expect(client.chans['#[room]']).toBeDefined();
  expect(client.chans['#{room}']).toBeUndefined();
  client.handleData(':server 319 Bot [FRIEND] :#channel\r\n');
  client.handleData(':server 318 Bot [friend] :End\r\n');
  await expect(pending).resolves.toEqual({
    nick: '[friend]',
    user: 'user',
    host: 'host',
    realname: 'Friend',
    channels: ['#channel'],
  });
  client.handleData(':Bot!u@h JOIN #{room}\r\n');
  expect(Object.keys(client.chans)).toHaveLength(2);
});

it('resolves equivalent WHOIS requests together', async () => {
  const client = setupMockClient('Bot');
  const first = client.whois('[Friend]');
  const second = client.whois('{friend}');
  expect(client.connection.socket.write).toHaveBeenCalledTimes(1);
  client.handleData(
    ':server 311 Bot [FRIEND] user host * :Friend\r\n:server 318 Bot {friend} :End\r\n',
  );
  await expect(first).resolves.toEqual(await second);
});
