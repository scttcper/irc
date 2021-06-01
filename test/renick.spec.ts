import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { IrcClient } from '../src';

import { setupMockClient } from './helpers';

describe('modes', () => {
  let client: IrcClient;
  afterEach(() => {
    jest.resetAllMocks();
    // @ts-expect-error
    client.cancelAutoRenick();
  });

  describe('when it does not get the desired nickname', () => {
    it('attains suitable fallback', async () => {
      client = setupMockClient('testbot', { autoRenick: true, renickDelay: 300, renickCount: 1 });

      const emitSpy = jest.spyOn(client, 'emit');
      client.handleData(':localhost 433 * testbot :Nickname is already in use.\r\n');
      expect(emitSpy).toBeCalledWith(
        'raw',
        expect.objectContaining({
          args: ['*', 'testbot', 'Nickname is already in use.'],
          command: 'err_nicknameinuse',
          commandType: 'error',
          nick: 'localhost',
          prefix: 'localhost',
          rawCommand: '433',
        }),
      );
      expect(client.connection.socket.write).toBeCalledWith('NICK testbot1\r\n');
      // @ts-expect-error
      client.connection.socket.write.mockReset();

      expect(client.nick).toBe('testbot1');
      expect(client.nickMod).toBe(1);

      client.handleData(':localhost 433 * testbot1 :Nickname is already in use.\r\n');

      expect(client.connection.socket.write).toBeCalledWith('NICK testbot2\r\n');

      client.handleData(':localhost 433 * testbot1 :Nickname is already in use.\r\n');
      expect(emitSpy).toBeCalledWith(
        'raw',
        expect.objectContaining({
          args: ['*', 'testbot', 'Nickname is already in use.'],
          command: 'err_nicknameinuse',
          commandType: 'error',
          nick: 'localhost',
          prefix: 'localhost',
          rawCommand: '433',
        }),
      );

      expect(client.connection.socket.write).toBeCalledWith('NICK testbot2\r\n');
      expect(client.nick).toBe('testbot3');
    });
  });
});
