import { expect, it } from 'vitest';

import { ChannelListTracker } from '../src/channelListTracker.js';
import { parseMessage } from '../src/parseMessage.js';

it('starts a fresh channel list', () => {
  const tracker = new ChannelListTracker();
  tracker.items = [{ name: '#old', users: {}, userCount: 99 }];

  tracker.start();

  expect(tracker.items).toEqual([]);
});

it('starts implicitly when RPL_LISTSTART is skipped', () => {
  const tracker = new ChannelListTracker();
  tracker.items = [{ name: '#old', users: {}, userCount: 99 }];

  expect(tracker.add(parseMessage(':server 322 testbot #chan 7 :topic text'))).toEqual({
    name: '#chan',
    topic: 'topic text',
    userCount: 7,
    users: {},
  });
  expect(tracker.end()).toEqual([
    {
      name: '#chan',
      topic: 'topic text',
      userCount: 7,
      users: {},
    },
  ]);
});

it('replaces list data and closes an open list', () => {
  const tracker = new ChannelListTracker();
  tracker.start();

  tracker.replace([{ name: '#manual', users: {} }]);
  tracker.add(parseMessage(':server 322 testbot #chan 7 :topic text'));

  expect(tracker.items).toEqual([
    {
      name: '#chan',
      topic: 'topic text',
      userCount: 7,
      users: {},
    },
  ]);
});
