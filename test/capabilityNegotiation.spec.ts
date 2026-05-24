import { expect, it } from 'vitest';

import {
  getCapabilityRegistrationCommands,
  getSaslPlainAuthenticateChunks,
  handleCapMessage,
} from '../src/capabilityNegotiation.js';
import { parseMessage } from '../src/parseMessage.js';

it('requests CAP LS during registration only when SASL is enabled', () => {
  expect(getCapabilityRegistrationCommands(true)).toEqual([['CAP', 'LS', '302']]);
  expect(getCapabilityRegistrationCommands(false)).toEqual([]);
});

it('requests SASL when the server advertises it', () => {
  expect(handleCapMessage(parseMessage(':server CAP * LS :multi-prefix sasl'), true)).toEqual({
    commands: [['CAP', 'REQ', 'sasl']],
    error: false,
  });
});

it('ends CAP negotiation when SASL is unavailable or rejected', () => {
  expect(handleCapMessage(parseMessage(':server CAP * LS :multi-prefix'), true)).toEqual({
    commands: [['CAP', 'END']],
    error: false,
  });
  expect(handleCapMessage(parseMessage(':server CAP * NAK :sasl'), true)).toEqual({
    commands: [['CAP', 'END']],
    error: true,
  });
});

it('starts SASL PLAIN after sasl ACK', () => {
  expect(handleCapMessage(parseMessage(':server CAP * ACK :sasl'), true)).toEqual({
    commands: [['AUTHENTICATE', 'PLAIN']],
    error: false,
  });
});

it('encodes SASL PLAIN payloads without Buffer', () => {
  expect(
    getSaslPlainAuthenticateChunks({
      nick: 'testbot',
      password: 'pass',
      userName: 'nodebot',
    }),
  ).toEqual(['dGVzdGJvdABub2RlYm90AHBhc3M=']);
});
