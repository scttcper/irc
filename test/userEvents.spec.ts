import { describe, expect, it, jest } from '@jest/globals';

import { setupMockClient } from './helpers';

describe('user events', () => {
  it('emits events per fixtures', () => {
    const client = setupMockClient('testbot');

    // welcome bot, give relevant prefix symbols
    client.handleData(':localhost 311 testbot testbot ~testbot EXAMPLE.HOST * :testbot\r\n');
    client.handleData(
      ':localhost 005 testbot PREFIX=(qaohv)~&@%+ :are supported by this server\r\n',
    );
    expect(client._whoisData).toHaveProperty('testbot');
    expect(client._whoisData.testbot).toEqual({
      nick: 'testbot',
      user: '~testbot',
      host: 'EXAMPLE.HOST',
      realname: 'testbot',
    });

    // #test: testbot joins. users: testbot, user1, user2
    const emitSpy = jest.spyOn(client, 'emit');
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
});
