import { describe, expect, it } from 'vitest';

import { setupMockClient } from './helpers.js';

describe('whois', () => {
  it('resolves without adding extra whois listeners', async () => {
    const client = setupMockClient('testbot');
    const listenerCount = client.listenerCount('whois');

    const promise = client.whois('friend');

    // @ts-expect-error test
    expect(client.connection.socket.write).toBeCalledWith('WHOIS friend\r\n');

    client.handleData(':localhost 311 testbot friend user host * :Friend User\r\n');
    client.handleData(':localhost 318 testbot friend :End of /WHOIS list.\r\n');

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        nick: 'friend',
        user: 'user',
        host: 'host',
        realname: 'Friend User',
      }),
    );
    expect(client.listenerCount('whois')).toBe(listenerCount);
  });

  it('rejects pending whois on end', async () => {
    const client = setupMockClient('testbot');

    const promise = client.whois('friend');
    client.end();

    await expect(promise).rejects.toThrow('Disconnected before WHOIS completed');
  });

  it('disconnects for reconnect without marking the shutdown as requested', () => {
    const client = setupMockClient('testbot');

    // @ts-expect-error test private method
    client.disconnectForReconnect();

    expect(client.connection.requestedDisconnect).toBeUndefined();
    // @ts-expect-error test
    expect(client.connection.socket.destroy).toBeCalled();
  });
});
