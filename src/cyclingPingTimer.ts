import { TypedEmitter } from 'tiny-typed-emitter';

import { IrcOptions } from './irc';

interface Ping {
  wantPing: () => void;
  pingTimeout: () => void;
}

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
export class CyclingPingTimer extends TypedEmitter<Ping> {
  loopingTimeout?: ReturnType<typeof setTimeout>;
  pingWaitTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly options: Pick<
      IrcOptions,
      'millisecondsBeforePingTimeout' | 'millisecondsOfSilenceBeforePingSent'
    > &
      Partial<IrcOptions>,
  ) {
    super();

    this.on('wantPing', () => {
      this.pingWaitTimeout = setTimeout(() => {
        this.stop();
        this.emit('pingTimeout');
      }, options.millisecondsBeforePingTimeout);
    });
  }

  notifyOfActivity() {
    this.stop();
    this.start();
  }

  start() {
    clearTimeout(this.loopingTimeout);
    this.loopingTimeout = setTimeout(() => {
      this.loopingTimeout = null;
      this.emit('wantPing');
    }, this.options.millisecondsOfSilenceBeforePingSent);
  }

  stop() {
    clearTimeout(this.loopingTimeout);
    clearTimeout(this.pingWaitTimeout);
  }
}
