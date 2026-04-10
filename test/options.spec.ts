import { expect, it } from 'vitest';

import { IrcClient } from '../src/irc.js';

it('verifies certificates by default when secure mode is enabled', () => {
  const client = new IrcClient('irc.example.com', 'testbot', { secure: true });

  expect(client.opt.rejectUnauthorized).toBe(true);
});
