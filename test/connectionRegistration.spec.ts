import { describe, expect, it } from 'vitest';

import { getConnectionRegistrationCommands } from '../src/connectionRegistration.js';
import { defaultOptions } from '../src/ircOptions.js';

function registrationOptions(options = {}) {
  return {
    ...defaultOptions,
    nick: 'testbot',
    realName: 'Real User',
    userName: 'user',
    ...options,
  };
}

describe('getConnectionRegistrationCommands', () => {
  it('builds the default NICK/USER registration commands', () => {
    expect(getConnectionRegistrationCommands(registrationOptions())).toEqual([
      ['NICK', 'testbot'],
      ['USER', 'user', '0', '*', 'Real User'],
    ]);
  });

  it('keeps WEBIRC, CAP, PASS, NICK, and USER in registration order', () => {
    expect(
      getConnectionRegistrationCommands(
        registrationOptions({
          password: 'secret',
          sasl: true,
          webirc: {
            host: 'gateway.example.com',
            ip: '203.0.113.10',
            pass: 'webirc-secret',
          },
        }),
      ),
    ).toEqual([
      ['WEBIRC', 'webirc-secret', 'user', 'gateway.example.com', '203.0.113.10'],
      ['CAP', 'LS', '302'],
      ['PASS', 'secret'],
      ['NICK', 'testbot'],
      ['USER', 'user', '0', '*', 'Real User'],
    ]);
  });
});
