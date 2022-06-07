import { afterEach, expect, it, vi } from 'vitest';

import { CyclingPingTimer } from '../src/cyclingPingTimer.js';

let cyclingPingTimer: CyclingPingTimer;
vi.useFakeTimers();

const setup = () => {
  const clientStub = {
    millisecondsBeforePingTimeout: 500,
    millisecondsOfSilenceBeforePingSent: 200,
  };
  cyclingPingTimer = new CyclingPingTimer(clientStub);
  return vi.spyOn(cyclingPingTimer, 'emit');
};

afterEach(() => {
  cyclingPingTimer.stop();
});

it('starts', () => {
  setup();
  cyclingPingTimer.start();

  expect(cyclingPingTimer.loopingTimeout).toBeTruthy();
});

it('stops', () => {
  setup();
  cyclingPingTimer.start();
  cyclingPingTimer.stop();
});

it('does not want ping early', async () => {
  const emitSpy = setup();
  cyclingPingTimer.start();
  setTimeout(() => {
    expect(emitSpy.mock.calls.length).toBe(0);
  }, 150);
  vi.runAllTimers();
});

it('wants ping after configured time', async () => {
  const emitSpy = setup();
  cyclingPingTimer.start();
  setTimeout(() => {
    expect(emitSpy.mock.calls.length === 1).toBeTruthy();
  }, 250);
  vi.runAllTimers();
});

it('does not want ping if notified of activity', () => {
  const emitSpy = setup();
  cyclingPingTimer.start();
  vi.advanceTimersByTime(120);
  cyclingPingTimer.notifyOfActivity();

  vi.advanceTimersByTime(100);

  expect(emitSpy.mock.calls.length === 0).toBeTruthy();
});

it('does want ping if notified of activity', () => {
  const emitSpy = setup();
  cyclingPingTimer.start();
  vi.advanceTimersByTime(120);
  cyclingPingTimer.notifyOfActivity();

  vi.advanceTimersByTime(300);

  expect(emitSpy.mock.calls[0]).toEqual(['wantPing']);
});
