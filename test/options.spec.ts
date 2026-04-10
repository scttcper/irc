import { expect, it } from 'vitest';

import { IrcClient } from '../src/irc.js';

it('verifies certificates by default when secure mode is enabled', () => {
  const client = new IrcClient('irc.example.com', 'testbot', { secure: true });

  expect(client.opt.rejectUnauthorized).toBe(true);
});

it('lets selfSigned opt out of certificate verification explicitly', () => {
  const client = new IrcClient('irc.example.com', 'testbot', {
    secure: true,
    rejectUnauthorized: true,
    selfSigned: true,
  });

  expect(client.opt.selfSigned).toBe(true);
  expect(client.opt.rejectUnauthorized).toBe(true);
});
