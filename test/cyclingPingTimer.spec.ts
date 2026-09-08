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

it('does not start keepalives when activity arrives before registration', () => {
  const emitSpy = setup();
  cyclingPingTimer.notifyOfActivity();
  vi.advanceTimersByTime(1000);
  expect(emitSpy).not.toHaveBeenCalled();
  expect(cyclingPingTimer.loopingTimeout).toBeUndefined();
});

it('does not restart after stopping when more activity arrives', () => {
  const emitSpy = setup();
  cyclingPingTimer.start();
  cyclingPingTimer.stop();
  cyclingPingTimer.notifyOfActivity();
  vi.advanceTimersByTime(1000);
  expect(emitSpy).not.toHaveBeenCalled();
});

it('cancels the response deadline when activity arrives after a ping', () => {
  const emitSpy = setup();
  cyclingPingTimer.start();
  vi.advanceTimersByTime(200);
  vi.advanceTimersByTime(400);
  cyclingPingTimer.notifyOfActivity();
  vi.advanceTimersByTime(150);
  expect(emitSpy.mock.calls).toEqual([['wantPing']]);
  vi.advanceTimersByTime(50);
  expect(emitSpy.mock.calls).toEqual([['wantPing'], ['wantPing']]);
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
