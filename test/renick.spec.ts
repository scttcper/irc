import { expect, it, vi } from 'vitest';

import { setupMockClient } from './helpers.js';

it('renick attains suitable fallback', async () => {
  const client = setupMockClient('testbot', { autoRenick: true, renickDelay: 300, renickCount: 1 });

  const emitSpy = vi.spyOn(client, 'emit');
  client.handleData(':localhost 433 * testbot :Nickname is already in use.\r\n');
  expect(emitSpy.mock.calls[0][0]).toBe('raw');
  expect(emitSpy.mock.calls[0][1]).toEqual({
    args: ['*', 'testbot', 'Nickname is already in use.'],
    prefix: 'localhost',
    nick: 'localhost',
    command: 'err_nicknameinuse',
    rawCommand: '433',
    commandType: 'error',
  });

  // @ts-expect-error test
  expect(client.connection.socket.write.mock.calls[0][0]).toBe('NICK testbot1\r\n');
  vi.clearAllMocks();

  expect(client.nick).toBe('testbot1');
  expect(client.nickMod).toBe(1);

  client.handleData(':localhost 433 * testbot1 :Nickname is already in use.\r\n');

  // @ts-expect-error test
  expect(client.connection.socket.write.mock.calls[0][0]).toBe('NICK testbot2\r\n');
  vi.clearAllMocks();

  client.handleData(':localhost 433 * testbot1 :Nickname is already in use.\r\n');
  expect(emitSpy.mock.calls[0][0]).toBe('raw');
  expect(emitSpy.mock.calls[0][1]).toEqual(
    expect.objectContaining({
      args: ['*', 'testbot1', 'Nickname is already in use.'],
      command: 'err_nicknameinuse',
      commandType: 'error',
      nick: 'localhost',
      prefix: 'localhost',
      rawCommand: '433',
    }),
  );

  // @ts-expect-error test
  expect(client.connection.socket.write.mock.calls[0][0]).toBe('NICK testbot3\r\n');
  expect(client.nick).toBe('testbot3');

  // @ts-expect-error test
  client.cancelAutoRenick();
});
