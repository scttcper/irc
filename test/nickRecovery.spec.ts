import { afterEach, describe, expect, it, vi } from 'vitest';

import { NickRecovery } from '../src/nickRecovery.js';

function setupRecovery(options = {}) {
  let currentNick = 'testbot';
  const actions = {
    debug: vi.fn(),
    getCurrentNick: vi.fn(() => currentNick),
    requestPreferredNick: vi.fn((nick: string) => {
      currentNick = nick;
    }),
    useFallbackNick: vi.fn((nick: string) => {
      currentNick = nick;
    }),
  };
  const recovery = new NickRecovery(
    {
      autoRenick: false,
      nick: 'testbot',
      renickCount: null,
      renickDelay: 300,
      ...options,
    },
    actions,
  );

  return { actions, recovery };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('NickRecovery', () => {
  it('uses incrementing fallback nicknames', () => {
    const { actions, recovery } = setupRecovery();

    recovery.handleNicknameInUse('testbot');
    recovery.handleNicknameInUse('testbot1');

    expect(actions.useFallbackNick).toHaveBeenNthCalledWith(1, 'testbot1');
    expect(actions.useFallbackNick).toHaveBeenNthCalledWith(2, 'testbot2');
    expect(recovery.nickMod).toBe(2);
  });

  it('suppresses repeated preferred nick collisions while auto-renick has already tried it', () => {
    vi.useFakeTimers();
    const { actions, recovery } = setupRecovery({ autoRenick: true, renickCount: 1 });

    recovery.handleNicknameInUse('testbot');
    vi.advanceTimersByTime(300);
    recovery.handleNicknameInUse('testbot');

    expect(actions.requestPreferredNick).toHaveBeenCalledWith('testbot');
    expect(actions.useFallbackNick).toHaveBeenCalledTimes(1);
  });

  it('resets connection-scoped auto-renick state without resetting the fallback suffix', () => {
    vi.useFakeTimers();
    const { actions, recovery } = setupRecovery({ autoRenick: true, renickCount: 1 });

    recovery.handleNicknameInUse('testbot');
    vi.advanceTimersByTime(300);
    recovery.beginConnection();
    recovery.handleNicknameInUse('testbot');

    expect(actions.useFallbackNick).toHaveBeenNthCalledWith(1, 'testbot1');
    expect(actions.useFallbackNick).toHaveBeenNthCalledWith(2, 'testbot2');
    expect(recovery.nickMod).toBe(2);
  });
});
