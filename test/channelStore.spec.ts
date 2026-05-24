import { expect, it } from 'vitest';

import { ChannelStore } from '../src/channelStore.js';

it('ensures channel data with the canonical lower-case key', () => {
  const store = new ChannelStore();

  expect(store.ensure('#Test')).toEqual({
    key: '#test',
    serverName: '#Test',
    users: {},
    modeParams: {},
    mode: '',
  });
  expect(store.get('#test')).toBe(store.get('#TEST'));
});

it('tracks nick changes across every channel the user is in', () => {
  const store = new ChannelStore();
  store.ensure('#one').users = { friend: '@', other: '' };
  store.ensure('#two').users = { friend: '+' };

  expect(store.renameUser('friend', 'newfriend')).toEqual(['#one', '#two']);
  expect(store.channels['#one'].users).toEqual({ newfriend: '@', other: '' });
  expect(store.channels['#two'].users).toEqual({ newfriend: '+' });
});

it('removes a user from every channel and returns affected channels', () => {
  const store = new ChannelStore();
  store.ensure('#one').users = { friend: '@', other: '' };
  store.ensure('#two').users = { friend: '+' };

  expect(store.removeUserFromAll('friend')).toEqual(['#one', '#two']);
  expect(store.channels['#one'].users).toEqual({ other: '' });
  expect(store.channels['#two'].users).toEqual({});
});

it('adds NAMES replies using the advertised prefix map', () => {
  const store = new ChannelStore();
  store.ensure('#chan');

  store.addNames('#chan', ['plain', '@oper', '+voice'], { '@': 'o', '+': 'v' });

  expect(store.channels['#chan'].users).toEqual({
    oper: '@',
    plain: '',
    voice: '+',
  });
});

it('updates user prefixes without duplicating existing prefixes', () => {
  const store = new ChannelStore();
  const channel = store.ensure('#chan');
  channel.users.friend = '@';

  store.updateUserPrefix(channel, 'friend', '@', true);
  store.updateUserPrefix(channel, 'friend', '+', true);
  store.updateUserPrefix(channel, 'friend', '@', false);

  expect(channel.users.friend).toBe('+');
});
