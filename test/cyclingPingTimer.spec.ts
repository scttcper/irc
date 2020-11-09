import { describe, it, expect, afterEach, beforeEach, jest } from '@jest/globals';

import { CyclingPingTimer } from '../src/cyclingPingTimer';

describe('CyclingPingTimer', () => {
  let cyclingPingTimer: CyclingPingTimer;
  let emitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.useFakeTimers();
    const clientStub = {
      millisecondsBeforePingTimeout: 500,
      millisecondsOfSilenceBeforePingSent: 200,
    };
    cyclingPingTimer = new CyclingPingTimer(clientStub);
    emitSpy = jest.spyOn(cyclingPingTimer, 'emit');
  });

  afterEach(() => {
    cyclingPingTimer.stop();
    jest.resetAllMocks();
  });

  it('starts', () => {
    cyclingPingTimer.start();

    expect(cyclingPingTimer.loopingTimeout).toBeTruthy();
  });

  it('stops', () => {
    cyclingPingTimer.start();
    cyclingPingTimer.stop();
  });

  it('does not want ping early', done => {
    cyclingPingTimer.start();
    setTimeout(() => {
      expect(emitSpy).toBeCalledTimes(0);
      done();
    }, 150);
    jest.runAllTimers();
  });

  it('wants ping after configured time', done => {
    cyclingPingTimer.start();
    setTimeout(() => {
      expect(emitSpy).toBeCalledTimes(1);
      done();
    }, 250);
    jest.runAllTimers();
  });

  it('does not want ping if notified of activity', async () => {
    jest.useRealTimers();
    cyclingPingTimer.start();
    await new Promise(r => {
      setTimeout(r, 120);
    });
    cyclingPingTimer.notifyOfActivity();

    await new Promise(r => {
      setTimeout(r, 100);
    });

    expect(emitSpy).toHaveBeenCalledTimes(0);
  });

  it('does want ping if notified of activity', async () => {
    jest.useRealTimers();
    cyclingPingTimer.start();
    await new Promise(r => {
      setTimeout(r, 120);
    });
    cyclingPingTimer.notifyOfActivity();

    await new Promise(r => {
      setTimeout(r, 300);
    });

    expect(emitSpy).toBeCalledWith('wantPing');
  });
});
