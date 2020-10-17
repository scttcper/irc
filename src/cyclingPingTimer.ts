import { EventEmitter } from 'events';

/**
 * This class encapsulates the ping timeout functionality.
 * When enough silence (lack of server-sent activity) passes, an object of this type will emit a 'wantPing' event, indicating you should send a PING message to the server in order to get some signs of life from it.
 * If enough time passes after that (i.e. server does not respond to PING), then an object of this type will emit a 'pingTimeout' event.
 *
 * To start the gears turning, call start() on an instance of this class to put it in the 'started' state.
 *
 * When server-side activity occurs, call notifyOfActivity() on the object.
 *
 * When a pingTimeout occurs, the object will go into the 'stopped' state.
 */
var ctr = 0;

export class CyclingPingTimer extends EventEmitter {
  timerNumber = ctr++;
  started = false;
  loopingTimeout = null;
  pingWaitTimeout = null;
  constructor(private readonly client: any) {
    super();

    this.on('wantPing', () => {
      this.debug("server silent for too long, let's send a PING");
      this.pingWaitTimeout = setTimeout(() => {
        this.stop();
        this.debug('ping timeout!');
        this.emit('pingTimeout');
      }, client.opt.millisecondsBeforePingTimeout);
    });
  }

  // Only one of these two should be non-null at any given time.

  // conditionally log debug messages
  debug(msg: string) {
    this.client.out.debug(`CyclingPingTimer ${this.timerNumber}:`, msg);
  }

  notifyOfActivity = function () {
    if (this.started) {
      this._stop();
      this._start();
    }
  };

  stop = function () {
    if (!this.started) {
      return;
    }

    this.debug('ping timer stopped');
    this._stop();
  };

  _stop() {
    this.started = false;

    clearTimeout(this.loopingTimeout);
    clearTimeout(this.pingWaitTimeout);

    this.loopingTimeout = null;
    this.pingWaitTimeout = null;
  }

  start = function () {
    if (this.started) {
      this.debug("can't start, not stopped!");
      return;
    }

    this.debug('ping timer started');
    this._start();
  };

  _start() {
    this.started = true;

    this.loopingTimeout = setTimeout(function () {
      this.loopingTimeout = null;
      this.emit('wantPing');
    }, this.client.opt.millisecondsOfSilenceBeforePingSent);
  }
}
