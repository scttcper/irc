import test from 'ava';
import * as sinon from 'sinon';

import { setupMockClient } from './helpers.js';

test('renick attains suitable fallback', async t => {
  const client = setupMockClient('testbot', { autoRenick: true, renickDelay: 300, renickCount: 1 });

  const emitSpy = sinon.spy(client, 'emit');
  client.handleData(':localhost 433 * testbot :Nickname is already in use.\r\n');
  t.is(emitSpy.firstCall.args[0], 'raw');
  t.like(emitSpy.firstCall.args[1], {
    args: ['*', 'testbot', 'Nickname is already in use.'],
    prefix: 'localhost',
    nick: 'localhost',
    command: 'err_nicknameinuse',
    rawCommand: '433',
    commandType: 'error',
  });

  // @ts-expect-error
  t.is(client.connection.socket.write.firstCall.args[0], 'NICK testbot1\r\n');
  // @ts-expect-error
  client.connection.socket.write.resetHistory();

  t.is(client.nick, 'testbot1');
  t.is(client.nickMod, 1);

  client.handleData(':localhost 433 * testbot1 :Nickname is already in use.\r\n');

  // @ts-expect-error
  t.is(client.connection.socket.write.firstCall.args[0], 'NICK testbot2\r\n');

  client.handleData(':localhost 433 * testbot1 :Nickname is already in use.\r\n');
  t.is(emitSpy.firstCall.args[0], 'raw');
  t.like(emitSpy.firstCall.args[1], {
    args: ['*', 'testbot', 'Nickname is already in use.'],
    command: 'err_nicknameinuse',
    commandType: 'error',
    nick: 'localhost',
    prefix: 'localhost',
    rawCommand: '433',
  });

  // @ts-expect-error
  t.is(client.connection.socket.write.firstCall.args[0], 'NICK testbot2\r\n');
  t.is(client.nick, 'testbot3');

  // @ts-expect-error
  client.cancelAutoRenick();
});
