import { expect, it } from 'vitest';

import { applyChannelModeChange, applyChannelModeSnapshot } from '../src/channelModes.js';
import type { ChannelData, SupportedFeatures } from '../src/ircTypes.js';

const supported: SupportedFeatures['channel']['modes'] = {
  a: 'b',
  b: 'k',
  c: 'l',
  d: 'mnt',
};

function channel(): ChannelData {
  return {
    key: '#chan',
    mode: '',
    modeParams: {},
    serverName: '#chan',
    users: { friend: '' },
  };
}

it('applies channel modes and returns events to emit', () => {
  const chan = channel();

  expect(
    applyChannelModeChange({
      channel: chan,
      modeArgs: ['mask', 'secret', '10'],
      modes: '+bklm',
      prefixForMode: { o: '@', v: '+' },
      supported,
    }),
  ).toEqual([
    { argument: 'mask', eventName: '+mode', mode: 'b' },
    { argument: 'secret', eventName: '+mode', mode: 'k' },
    { argument: '10', eventName: '+mode', mode: 'l' },
    { argument: undefined, eventName: '+mode', mode: 'm' },
  ]);
  expect(chan.mode).toBe('bklm');
  expect(chan.modeParams).toEqual({
    b: ['mask'],
    k: ['secret'],
    l: ['10'],
    m: [],
  });
});

it('updates user prefix modes without duplicating prefixes', () => {
  const chan = channel();

  applyChannelModeChange({
    channel: chan,
    modeArgs: ['friend', 'friend'],
    modes: '+oo',
    prefixForMode: { o: '@' },
    supported,
  });
  applyChannelModeChange({
    channel: chan,
    modeArgs: ['friend'],
    modes: '-o',
    prefixForMode: { o: '@' },
    supported,
  });

  expect(chan.users.friend).toBe('');
});

it('removes list mode arguments one entry at a time', () => {
  const chan = channel();
  chan.mode = 'b';
  chan.modeParams = { b: ['one', 'two'] };

  applyChannelModeChange({
    channel: chan,
    modeArgs: ['one'],
    modes: '-b',
    prefixForMode: {},
    supported,
  });

  expect(chan.mode).toBe('b');
  expect(chan.modeParams).toEqual({ b: ['two'] });
});

it('applies channel mode snapshots using only parameterized modes', () => {
  const chan = channel();

  applyChannelModeSnapshot({
    channel: chan,
    modeArgs: ['secret', '10'],
    modes: '+mklt',
    supported,
  });

  expect(chan.mode).toBe('+mklt');
  expect(chan.modeParams).toEqual({
    k: ['secret'],
    l: ['10'],
  });
});
