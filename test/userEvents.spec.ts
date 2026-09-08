import { describe, expect, it, vi } from 'vitest';

import { IrcClient } from '../src/irc.js';
import { parseMessage } from '../src/parseMessage.js';

import { setupMockClient } from './helpers.js';

describe('user events', () => {
  it.each(['say', 'notice'] as const)(
    'keeps Unicode %s messages within wire and relay limits',
    method => {
      const client = setupMockClient('bot');
      client.hostMask = `${'用户'.repeat(20)}@主机.example`;
      client.handleData(':bot!u@h NICK 昵称\r\n');
      const target = `#${'日'.repeat(60)}`;
      const text = '😀'.repeat(200);
      client[method](target, text);
      const lines = vi
        .mocked(client.connection.socket.write)
        .mock.calls.map(call => String(call[0]));
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(512);
        expect(
          new TextEncoder().encode(`:${client.nick}!${client.hostMask} ${line}`).length,
        ).toBeLessThanOrEqual(512);
      }
      expect(lines.map(line => parseMessage(line.trimEnd()).args[1]).join('')).toBe(text);
    },
  );

  it('joins keyed channels and retains their keys for reconnects and kicks', () => {
    const client = setupMockClient('testbot', { autoRejoin: true });
    client.join('#locked secret');
    expect(client.connection.socket.write).toHaveBeenLastCalledWith('JOIN #locked secret\r\n');
    client.handleData(':other!u@h JOIN #locked\r\n');
    expect(client.listenerCount('join')).toBe(1);
    client.handleData(':testbot!u@h JOIN #locked\r\n');
    expect(client.listenerCount('join')).toBe(0);
    client.handleData(':server 422 testbot :No MOTD\r\n');
    expect(client.connection.socket.write).toHaveBeenLastCalledWith('JOIN #locked secret\r\n');
    client.handleData(':testbot!u@h JOIN #locked\r\n');
    client.handleData(':other!u@h KICK #locked testbot :bye\r\n');
    expect(client.connection.socket.write).toHaveBeenLastCalledWith('JOIN #locked secret\r\n');
  });

  it.each(['#test', '&local'])('emits the channel message event for %s', channel => {
    const client = setupMockClient('testbot');
    const listener = vi.fn();
    client.on(`message${channel}`, listener);
    client.handleData(`:friend!u@h PRIVMSG ${channel.toUpperCase()} :hello\r\n`);
    expect(listener).toHaveBeenCalledExactlyOnceWith(
      'friend',
      channel.toUpperCase(),
      'hello',
      expect.objectContaining({ command: 'PRIVMSG' }),
    );
  });

  it('emits events per fixtures', () => {
    const client = setupMockClient('testbot');

    // give relevant prefix symbols
    client.handleData(
      ':localhost 005 testbot PREFIX=(qaohv)~&@%+ :are supported by this server\r\n',
    );

    // #test: testbot joins. users: testbot, user1, user2
    const emitSpy = vi.spyOn(client, 'emit');
    client.join('#test');
    client.handleData(':testbot!~testbot@EXAMPLE.HOST JOIN :#test\r\n');
    expect(emitSpy).toBeCalledWith('join', '#test', 'testbot');
    expect(client.chans).toHaveProperty('#test');
    expect(client.chans['#test']).toEqual({
      key: '#test',
      mode: '',
      modeParams: {},
      serverName: '#test',
      users: {},
    });
    emitSpy.mockClear();
    client.handleData(':localhost 353 testbot = #test :testbot user1 @user2 user3\r\n');
    client.handleData(':localhost 366 testbot #test :End of /NAMES list.\r\n');
    expect(emitSpy).toBeCalledWith('names', '#test', {
      testbot: '',
      user1: '',
      user2: '@',
      user3: '',
    });

    emitSpy.mockClear();

    // #test2: testbot joins. users: testbot, user1, user3
    client.join('#test2');
    client.handleData(':testbot!~testbot@EXAMPLE.HOST JOIN :#test2\r\n');
    expect(emitSpy).toBeCalledWith('join', '#test2', 'testbot');
    client.handleData(':localhost 353 testbot = #test2 :testbot user1 user3\r\n');
    client.handleData(':localhost 366 testbot #test2 :End of /NAMES list.\r\n');
    expect(emitSpy).toBeCalledWith('names', '#test2', {
      testbot: '',
      user1: '',
      user3: '',
    });

    emitSpy.mockClear();

    // #test: user1 parts, joins
    client.handleData(':user1!~user1@example.host PART #test :Leaving\r\n');
    expect(emitSpy).toBeCalledWith('part', '#test', 'user1', 'Leaving');
    client.handleData(':user1!~user1@example.host JOIN #test\r\n');
    expect(emitSpy).toBeCalledWith('join', '#test', 'user1');

    emitSpy.mockClear();

    // user1 quits (#test, #test2)
    client.handleData(':user1!~user1@example.host QUIT :Quit: Leaving\r\n');
    expect(emitSpy).toBeCalledWith(
      'quit',
      'user1',
      'Quit: Leaving',
      ['#test', '#test2'],
      expect.anything(),
    );

    emitSpy.mockClear();

    // user2 renames to user4 (#test)
    client.handleData(':user2!~user2@example.host NICK :user4\r\n');
    expect(emitSpy).toBeCalledWith('nick', 'user2', 'user4', ['#test'], expect.anything());
    // user3 renames to user5 (#test, #test2)
    client.handleData(':user3!~user3@example.host NICK :user5\r\n');
    expect(emitSpy).toBeCalledWith(
      'nick',
      'user3',
      'user5',
      ['#test', '#test2'],
      expect.anything(),
    );

    emitSpy.mockClear();

    // #test: user6 joins
    client.handleData(':user6!~user6@example.host JOIN #test\r\n');
    expect(emitSpy).toBeCalledWith('join', '#test', 'user6');

    // #test: user6 is kicked by user4
    client.handleData(':user4!~user2@example.host KICK #test user6 :Test kick\r\n');
    expect(emitSpy).toBeCalledWith('kick', '#test', 'user6', 'user4', 'Test kick');
    // user4 quits (#test)
    client.handleData(':user4!~user2@example.host QUIT :Quit: Leaving\r\n');
    expect(emitSpy).toBeCalledWith('quit', 'user4', 'Quit: Leaving', ['#test'], expect.anything());

    // #test: user5 parts
    client.handleData(':user5!~user3@example.host PART #test :Bye\r\n');
    expect(emitSpy).toBeCalledWith('part', '#test', 'user5', 'Bye');
    // user5 quits (#test2)
    client.handleData(':user5!~user3@example.host QUIT :See ya\r\n');
    expect(emitSpy).toBeCalledWith('quit', 'user5', 'See ya', ['#test2'], expect.anything());
  });

  it('applies default channel membership prefixes before ISUPPORT', () => {
    const client = setupMockClient('testbot');
    client.chans['#chan'] = {
      key: '#chan',
      mode: '',
      modeParams: {},
      serverName: '#chan',
      users: {},
    };

    client.handleData(':server 353 testbot = #chan :@oper +voice plain\r\n');

    expect(client.chans['#chan'].users).toEqual({
      oper: '@',
      plain: '',
      voice: '+',
    });
  });

  it('can leave a channel', () => {
    const client = setupMockClient('testbot');
    const emitSpy = vi.spyOn(client.connection.socket, 'write');

    client.part('#test');
    expect(emitSpy).toBeCalledWith('PART #test\r\n');
  });

  it('throws a clear error when sending before connect', () => {
    const client = new IrcClient('', 'testbot');

    expect(() => client.say('#test', 'hello')).toThrow('Cannot send before connecting');
    expect(() => client.join('#test')).toThrow('Cannot send before connecting');
    expect(() => client.notice('#test', 'hello')).toThrow('Cannot send before connecting');
    expect(() => client.end()).not.toThrow();
  });

  it('sends notices as NOTICE commands', () => {
    const client = setupMockClient('testbot');
    const writeSpy = vi.spyOn(client.connection.socket, 'write');

    client.notice('#test', 'heads up');

    expect(writeSpy).toBeCalledWith('NOTICE #test :heads up\r\n');
  });

  it('rejects raw line separators in outgoing parameters', () => {
    const client = setupMockClient('testbot');

    expect(() => client.send('PRIVMSG', '#test', 'hello\r\nOPER bad')).toThrow(
      'IRC message parameters cannot contain NUL, CR, or LF characters',
    );
    expect(() => client.send('PRIVMSG', '#test', 'bad\0value')).toThrow(
      'IRC message parameters cannot contain NUL, CR, or LF characters',
    );
  });

  it('rejects oversized raw IRC messages', () => {
    const client = setupMockClient('testbot');

    expect(() => client.send('PRIVMSG', '#test', 'x'.repeat(512))).toThrow(
      'IRC messages cannot exceed 512 bytes including CRLF',
    );
  });
});

it('does not rejoin parted configured or runtime channels after MOTD', () => {
  const channels = ['#initial secret', '#keep'];
  const client = setupMockClient('bot', { channels });
  client.join('#runtime');
  client.handleData(':bot!u@h JOIN #runtime\r\n');
  client.part('#INITIAL,#runtime');
  client.handleData(':bot!u@h PART #initial\r\n:bot!u@h PART #runtime\r\n');
  vi.mocked(client.connection.socket.write).mockClear();
  client.handleData(':server 422 bot :No MOTD\r\n');
  expect(client.connection.socket.write).toHaveBeenCalledExactlyOnceWith('JOIN #keep\r\n');
  expect(client.opt.channels).toEqual(channels);
});

it('cancels pending join tracking when explicitly parting before the acknowledgement', () => {
  const client = setupMockClient('bot');
  client.join('#test');
  client.part('#test');
  client.handleData(':bot!u@h JOIN #test\r\n');
  vi.mocked(client.connection.socket.write).mockClear();
  client.handleData(':server 422 bot :No MOTD\r\n');
  expect(client.connection.socket.write).not.toHaveBeenCalled();
});

it('can explicitly rejoin a channel while its earlier PART is being acknowledged', () => {
  const client = setupMockClient('bot', { channels: ['#test'] });
  client.part('#test');
  client.join('#test');
  client.handleData(':bot!u@h PART #test\r\n:bot!u@h JOIN #test\r\n');
  vi.mocked(client.connection.socket.write).mockClear();
  client.handleData(':server 422 bot :No MOTD\r\n');
  expect(client.connection.socket.write).toHaveBeenCalledExactlyOnceWith('JOIN #test\r\n');
});
