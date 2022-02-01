import test from 'ava';
import * as sinon from 'sinon';

import { CyclingPingTimer } from '../src/cyclingPingTimer.js';

let cyclingPingTimer: CyclingPingTimer;
const clock = sinon.useFakeTimers();

const setup = () => {
  const clientStub = {
    millisecondsBeforePingTimeout: 500,
    millisecondsOfSilenceBeforePingSent: 200,
  };
  cyclingPingTimer = new CyclingPingTimer(clientStub);
  return sinon.spy(cyclingPingTimer, 'emit');
};

test.afterEach(() => {
  cyclingPingTimer.stop();
});

test('starts', t => {
  setup();
  cyclingPingTimer.start();

  t.truthy(cyclingPingTimer.loopingTimeout);
});

test('stops', t => {
  setup();
  cyclingPingTimer.start();
  cyclingPingTimer.stop();
  t.assert(true);
});

test('does not want ping early', async t => {
  const emitSpy = setup();
  cyclingPingTimer.start();
  setTimeout(() => {
    t.assert(emitSpy.callCount === 0);
  }, 150);
  await clock.runAllAsync();
});

test('wants ping after configured time', async t => {
  const emitSpy = setup();
  cyclingPingTimer.start();
  setTimeout(() => {
    t.assert(emitSpy.callCount === 1);
  }, 250);
  await clock.runAllAsync();
});

test('does not want ping if notified of activity', t => {
  const emitSpy = setup();
  cyclingPingTimer.start();
  clock.tick(120);
  cyclingPingTimer.notifyOfActivity();

  clock.tick(100);

  t.assert(emitSpy.callCount === 0);
});

test('does want ping if notified of activity', t => {
  const emitSpy = setup();
  cyclingPingTimer.start();
  clock.tick(120);
  cyclingPingTimer.notifyOfActivity();

  clock.tick(300);

  t.deepEqual(emitSpy.firstCall.args, ['wantPing']);
});
