import test from 'ava';
import * as sinon from 'sinon';

import { setupMockClient } from './helpers.js';

test('emits events per fixtures', t => {
  const client = setupMockClient('testbot');

  // welcome bot, give relevant prefix symbols
  client.handleData(':localhost 311 testbot testbot ~testbot EXAMPLE.HOST * :testbot\r\n');
  client.handleData(':localhost 005 testbot PREFIX=(qaohv)~&@%+ :are supported by this server\r\n');
  t.assert('testbot' in client._whoisData);
  t.deepEqual(client._whoisData.testbot, {
    nick: 'testbot',
    user: '~testbot',
    host: 'EXAMPLE.HOST',
    realname: 'testbot',
  });

  // #test: testbot joins. users: testbot, user1, user2
  const emitSpy = sinon.spy(client, 'emit');
  client.join('#test');
  client.handleData(':testbot!~testbot@EXAMPLE.HOST JOIN :#test\r\n');
  t.deepEqual<any, string[]>(emitSpy.secondCall.args, ['join', '#test', 'testbot']);
  t.assert('#test' in client.chans);
  t.deepEqual(client.chans['#test'], {
    key: '#test',
    mode: '',
    modeParams: {},
    serverName: '#test',
    users: {},
  });
  emitSpy.resetHistory();
  client.handleData(':localhost 353 testbot = #test :testbot user1 @user2 user3\r\n');
  client.handleData(':localhost 366 testbot #test :End of /NAMES list.\r\n');
  t.deepEqual<any, any>(emitSpy.thirdCall.args, [
    'names',
    '#test',
    {
      testbot: '',
      user1: '',
      user2: '@',
      user3: '',
    },
  ]);

  emitSpy.resetHistory();

  // #test2: testbot joins. users: testbot, user1, user3
  client.join('#test2');
  client.handleData(':testbot!~testbot@EXAMPLE.HOST JOIN :#test2\r\n');
  t.deepEqual<any, string[]>(emitSpy.secondCall.args, ['join', '#test2', 'testbot']);
  emitSpy.resetHistory();

  client.handleData(':localhost 353 testbot = #test2 :testbot user1 user3\r\n');
  client.handleData(':localhost 366 testbot #test2 :End of /NAMES list.\r\n');
  t.deepEqual<any, any>(emitSpy.thirdCall.args, [
    'names',
    '#test2',
    {
      testbot: '',
      user1: '',
      user3: '',
    },
  ]);

  emitSpy.resetHistory();

  // #test: user1 parts, joins
  client.handleData(':user1!~user1@example.host PART #test :Leaving\r\n');
  t.deepEqual<any, any>(emitSpy.secondCall.args, ['part', '#test', 'user1', 'Leaving']);
  emitSpy.resetHistory();

  client.handleData(':user1!~user1@example.host JOIN #test\r\n');
  t.deepEqual<any, any>(emitSpy.secondCall.args, ['join', '#test', 'user1']);

  emitSpy.resetHistory();

  // user1 quits (#test, #test2)
  client.handleData(':user1!~user1@example.host QUIT :Quit: Leaving\r\n');
  t.deepEqual<any, any>(emitSpy.secondCall.args.slice(0, 4), [
    'quit',
    'user1',
    'Quit: Leaving',
    ['#test', '#test2'],
  ]);

  emitSpy.resetHistory();

  // user2 renames to user4 (#test)
  client.handleData(':user2!~user2@example.host NICK :user4\r\n');
  t.deepEqual<any, any>(emitSpy.secondCall.args.slice(0, 4), ['nick', 'user2', 'user4', ['#test']]);
  emitSpy.resetHistory();
  // user3 renames to user5 (#test, #test2)
  client.handleData(':user3!~user3@example.host NICK :user5\r\n');
  t.deepEqual<any, any>(emitSpy.secondCall.args.slice(0, 4), [
    'nick',
    'user3',
    'user5',
    ['#test', '#test2'],
  ]);

  emitSpy.resetHistory();

  // #test: user6 joins
  client.handleData(':user6!~user6@example.host JOIN #test\r\n');
  t.deepEqual<any, any>(emitSpy.secondCall.args, ['join', '#test', 'user6']);

  emitSpy.resetHistory();

  // #test: user6 is kicked by user4
  client.handleData(':user4!~user2@example.host KICK #test user6 :Test kick\r\n');
  t.deepEqual<any, any>(emitSpy.secondCall.args, ['kick', '#test', 'user6', 'user4', 'Test kick']);

  emitSpy.resetHistory();
  // user4 quits (#test)
  client.handleData(':user4!~user2@example.host QUIT :Quit: Leaving\r\n');
  t.deepEqual<any, any>(emitSpy.secondCall.args.slice(0, 4), [
    'quit',
    'user4',
    'Quit: Leaving',
    ['#test'],
  ]);

  emitSpy.resetHistory();

  // #test: user5 parts
  client.handleData(':user5!~user3@example.host PART #test :Bye\r\n');
  t.deepEqual<any, any>(emitSpy.secondCall.args, ['part', '#test', 'user5', 'Bye']);
  emitSpy.resetHistory();
  // user5 quits (#test2)
  client.handleData(':user5!~user3@example.host QUIT :See ya\r\n');
  t.deepEqual<any, any>(emitSpy.secondCall.args.slice(0, 4), [
    'quit',
    'user5',
    'See ya',
    ['#test2'],
  ]);
});
