import { expect, it, vi } from 'vitest';

import { ChannelStore } from '../src/channelStore.js';
import { ircCasefold } from '../src/ircCasefold.js';

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

it('does not repeatedly normalize unrelated members during a batch of QUITs', () => {
  const normalize = vi.fn(ircCasefold);
  const store = new ChannelStore(normalize);
  store.ensure('#one');
  store.ensure('#two');
  const count = 1000;
  for (let i = 0; i < count; i++) {
    store.addUser('#one', `alice${i}`);
    store.addUser('#two', `bob${i}`);
  }
  normalize.mockClear();
  for (let i = 0; i < count; i++) {
    expect(store.removeUserFromAll(`ALICE${i}`)).toEqual(['#one']);
  }
  expect(normalize.mock.calls.length).toBeLessThan(count * 10);
  expect(Object.keys(store.get('#two')!.users)).toHaveLength(count);
});

it('keeps the nickname index current across names, renames, replacement, and removals', () => {
  const store = new ChannelStore();
  const channel = store.ensure('#test');
  store.addNames('#test', ['@[Friend]'], { '@': 'o' });
  expect(store.findUser(channel, '{friend}')).toBe('[Friend]');
  store.renameUser('{friend}', 'NewFriend');
  expect(store.findUser(channel, '[friend]')).toBeUndefined();
  expect(store.findUser(channel, 'newfriend')).toBe('NewFriend');
  channel.users = { Replacement: '+' };
  expect(store.findUser(channel, 'replacement')).toBe('Replacement');
  expect(store.findUser(channel, 'newfriend')).toBeUndefined();
  store.removeUser('#test', 'REPLACEMENT');
  expect(store.findUser(channel, 'replacement')).toBeUndefined();
});
