import { connect as NetConnect } from 'node:net';
import { connect as TlsConnect } from 'node:tls';

import debug from 'debug';
import defaultsdeep from 'lodash.defaultsdeep';
import { TypedEmitter } from 'tiny-typed-emitter';

import { CyclingPingTimer } from './cyclingPingTimer.js';
import {
  convertEncodingHelper,
  lineDelimiter,
  truncateUtf8,
  utf8ByteLength,
  utf8Decoder,
  utf8Encoder,
} from './ircEncoding.js';
import {
  applyIsupport,
  defaultChannelModes,
  defaultChannelTypes,
  defaultModeForPrefix,
  defaultPrefixForMode,
} from './ircIsupport.js';
import { defaultOptions, type IrcOptions } from './ircOptions.js';
import {
  type ChannelData,
  type IrcClientEvents,
  type SupportedFeatures,
  type Users,
  type WhoIsData,
} from './ircTypes.js';
import { Message, parseMessage } from './parseMessage.js';
import { concatUint8Arrays, stringToBase64 } from './uint8array.js';

const log = debug('irc');
const whoisTimeoutMs = 30_000;

function isLineTerminated(bytes: Uint8Array): boolean {
  const lastByte = bytes[bytes.length - 1];
  return lastByte === 10 || lastByte === 13;
}

function containsInvalidLineByte(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0 || code === 10 || code === 13) {
      return true;
    }
  }

  return false;
}

function mustBeTrailingParam(value: string): boolean {
  if (value === '' || value.charCodeAt(0) === 58) {
    return true;
  }

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 32 || code === 9 || code === 11 || code === 12) {
      return true;
    }
  }

  return false;
}

export type { ChannelData } from './ircTypes.js';
export type { IrcOptions } from './ircOptions.js';

export class IrcClient extends TypedEmitter<IrcClientEvents> {
  readonly opt: IrcOptions;
  connection!: {
    pendingBytes?: Uint8Array;
    pendingText?: string;
    cyclingPingTimer: CyclingPingTimer;
    socket?: ReturnType<typeof NetConnect> | ReturnType<typeof TlsConnect>;
    renickInterval?: ReturnType<typeof setInterval>;
    requestedDisconnect?: boolean;
    attemptedLastRenick?: boolean;
  };

  nick = '';
  nickMod = 0;
  hostMask = '';
  maxLineLength?: number;
  _whoisData: Record<string, WhoIsData> = {};
  // Features supported by the server
  // (Initial values are RFC 1459 defaults. Zeros signify no default or unlimited value.)
  // ISUPPORT defaults: https://modern.ircdocs.horse/#feature-advertisement
  supported: SupportedFeatures = {
    channel: {
      idlength: {},
      length: 200,
      limit: {},
      modes: { ...defaultChannelModes },
      types: defaultChannelTypes,
    },
    kicklength: 0,
    maxlist: {},
    maxtargets: {},
    modes: 3,
    nicklength: 9,
    topiclength: 0,
    usermodes: '',
  };

  motd?: string;
  modeForPrefix: Record<string, string> = { ...defaultModeForPrefix };
  prefixForMode: Record<string, string> = { ...defaultPrefixForMode };
  chans: Record<string, ChannelData> = {};
  channellist: ChannelData[] = [];
  private channellistOpen = false;
  retryTimeout?: ReturnType<typeof setTimeout>;
  private pendingWhois = new Map<
    string,
    Set<{
      resolve: (info: { nick?: string; user?: string; host?: string }) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }>
  >();
  /** Channels joined at runtime, tracked separately from the initial options. */
  private _autoJoinChannels: string[] = [];

  constructor(host: string, nick: string, opt: Partial<IrcOptions> = {}) {
    super();
    this.opt = defaultsdeep({ host, nick }, opt, defaultOptions);
    this.supported.channel.types = this.opt.channelPrefixes;

    this.addListener('raw', message => this._handleRawMessage(message));
    this.addListener('kick', (channel: string, n: string) => {
      if (this.opt.autoRejoin && n.toLowerCase() === this.nick.toLowerCase()) {
        this.join(channel);
      }
    });
    this.addListener('motd', () => {
      for (const channel of this.opt.channels) {
        this.join(channel);
      }

      for (const channel of this._autoJoinChannels) {
        this.join(channel);
      }
    });
  }

  connect(retryCount = 0) {
    this.clearRetryTimeout();
    const connection: IrcClient['connection'] = {
      cyclingPingTimer: new CyclingPingTimer(this.opt),
    };
    const onConnect = () => {
      // Callback called only after successful socket connection
      if (!this.opt.encoding) {
        this.connection.socket.setEncoding('utf-8');
      }

      this._connectionHandler();
    };
    if (this.opt.secure) {
      connection.socket = TlsConnect(
        {
          port: this.opt.port,
          host: this.opt.host,
          rejectUnauthorized: this.opt.selfSigned ? false : this.opt.rejectUnauthorized,
        },
        onConnect,
      );
    } else {
      connection.socket = NetConnect(
        {
          port: this.opt.port,
          host: this.opt.host,
        },
        onConnect,
      );
    }

    connection.socket.addListener('data', chunk => this.handleDataForConnection(connection, chunk));
    connection.socket.addListener('end', () => {
      this.debug('Connection got "end" event');
    });
    connection.socket.addListener('close', () => {
      this.debug('Connection got "close" event');
      // don't reconnect if this is an old connection closing
      if (connection !== this.connection) {
        this.debug('Non-latest connection is being discarded');
        return;
      }

      // skip if this connection is supposed to close
      if (connection?.requestedDisconnect) {
        return;
      }

      this.debug('Disconnected: reconnecting');
      this.rejectPendingWhois(new Error('Disconnected before WHOIS completed'));
      connection.cyclingPingTimer.stop();
      this.cancelAutoRenick();
      // connection = null;
      // limit to retryCount reconnections
      if (this.opt.retryCount !== null && retryCount >= this.opt.retryCount) {
        this.debug(`Maximum retry count (${this.opt.retryCount}) reached. Aborting`);
        this.emit('abort', this.opt.retryCount);
        return;
      }

      // actually reconnect
      this.debug(`Waiting ${this.opt.retryDelay}ms before retrying`);
      this.retryTimeout = setTimeout(() => {
        this.connect(retryCount + 1);
      }, this.opt.retryDelay);
    });

    connection.cyclingPingTimer.on('pingTimeout', () => {
      if (connection !== this.connection) {
        // Only care about a timeout event if it came from the current connection
        return;
      }

      this.disconnectForReconnect();
    });

    let pingCounter = 1;
    connection.cyclingPingTimer.on('wantPing', () => {
      if (connection !== this.connection) {
        // Only care about a wantPing event if it came from the current connection
        return;
      }

      this.send('PING', (pingCounter++).toString());
    });

    connection.socket.addListener('error', (exception: string) => {
      this.emit('netError', exception);
      this.debug(`Network error: ${exception}`);
    });
    this.connection = connection;
  }

  debug(...args: Parameters<typeof log>) {
    log(...args);
  }

  join(channel: string) {
    const onJoin = (joinedChannel: string) => {
      if (joinedChannel.toLowerCase() !== channel.toLowerCase()) {
        return;
      }

      this.removeListener('join', onJoin);
      // Track for auto-rejoin on reconnect.
      if (!this._isChannelTracked(channel)) {
        this._autoJoinChannels.push(channel);
      }
    };
    this.addListener('join', onJoin);

    this.send('JOIN', channel);
  }

  part(channel: string) {
    this.send('PART', channel);
  }

  say(target: string, text: string) {
    this._speak('PRIVMSG', target, text);
  }

  notice(target: string, text: string) {
    this._speak('NOTICE', target, text);
  }

  handleData = (chunk: string | Uint8Array) => {
    this.handleDataForConnection(this.connection, chunk);
  };

  private handleDataForConnection = (
    connection: IrcClient['connection'],
    chunk: string | Uint8Array,
  ) => {
    if (!connection || connection !== this.connection) {
      return;
    }

    this.connection.cyclingPingTimer.notifyOfActivity();

    const lines = this.readBufferedLines(connection, chunk);
    for (const line of lines) {
      if (!line) {
        continue;
      }

      this.debug('Received:', line);
      const message = parseMessage(line, this.opt.stripColors, this.opt.enableStrictParse);
      this.emit('raw', message);
    }
  };

  send(...args: string[]) {
    // e.g. NICK, nickname
    // IRC messages are single CRLF-delimited lines capped at 512 bytes.
    // https://modern.ircdocs.horse/#message-format
    for (const arg of args) {
      if (containsInvalidLineByte(arg)) {
        throw new Error('IRC message parameters cannot contain NUL, CR, or LF characters');
      }
    }

    // if the last arg contains a space, starts with a colon, or is empty, prepend a colon
    if (mustBeTrailingParam(args[args.length - 1])) {
      args[args.length - 1] = `:${args[args.length - 1]}`;
    }

    if (!this.connection?.socket) {
      throw new Error('Cannot send before connecting');
    }

    if (this.connection.requestedDisconnect) {
      this.debug('(Disconnected) SEND:', args.join(' '));
    } else {
      const line = `${args.join(' ')}\r\n`;
      if (utf8ByteLength(line) > 512) {
        throw new Error('IRC messages cannot exceed 512 bytes including CRLF');
      }

      this.debug('SEND:', args.join(' '));
      this.connection.socket.write(line);
    }
  }

  /** Request a whois for the specified ``nick``. */
  async whois(nick: string): Promise<{ nick?: string; user?: string; host?: string }> {
    const normalizedNick = nick.toLowerCase();
    const promise = new Promise<{ nick?: string; user?: string; host?: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          this.removePendingWhoisRequest(normalizedNick, request);
          reject(new Error(`WHOIS timed out for ${nick}`));
        }, whoisTimeoutMs);

        const request = { resolve, reject, timeout };
        const requests = this.pendingWhois.get(normalizedNick) ?? new Set();
        requests.add(request);
        this.pendingWhois.set(normalizedNick, requests);
      },
    );

    if (this.connection?.requestedDisconnect) {
      this.rejectPendingWhois(new Error('Cannot WHOIS while disconnected'));
      return promise;
    }

    if (!this.connection?.socket) {
      this.rejectPendingWhois(new Error('Cannot WHOIS before connecting'));
      return promise;
    }

    const shouldSend = (this.pendingWhois.get(normalizedNick)?.size ?? 0) === 1;
    if (shouldSend) {
      this.send('WHOIS', nick);
    }

    return promise;
  }

  end() {
    if (this.connection?.socket) {
      this.connection.requestedDisconnect = true;
      this.clearRetryTimeout();
      this.rejectPendingWhois(new Error('Disconnected before WHOIS completed'));
      this.connection.cyclingPingTimer.stop();
      this.cancelAutoRenick();
      this.connection.socket.destroy();
    }
  }

  private disconnectForReconnect() {
    if (!this.connection.socket) {
      return;
    }

    this.clearRetryTimeout();
    this.rejectPendingWhois(new Error('Disconnected before WHOIS completed'));
    this.connection.cyclingPingTimer.stop();
    this.cancelAutoRenick();
    this.connection.socket.destroy();
  }

  private clearRetryTimeout() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
  }

  private removePendingWhoisRequest(
    nick: string,
    request: {
      resolve: (info: { nick?: string; user?: string; host?: string }) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    },
  ) {
    clearTimeout(request.timeout);
    const requests = this.pendingWhois.get(nick);
    if (!requests) {
      return;
    }

    requests.delete(request);
    if (requests.size === 0) {
      this.pendingWhois.delete(nick);
    }
  }

  private resolvePendingWhois(nick: string, info: { nick?: string; user?: string; host?: string }) {
    const requests = this.pendingWhois.get(nick.toLowerCase());
    if (!requests) {
      return;
    }

    for (const request of requests) {
      clearTimeout(request.timeout);
      request.resolve(info);
    }

    this.pendingWhois.delete(nick.toLowerCase());
  }

  private rejectPendingWhois(error: Error) {
    for (const [nick, requests] of this.pendingWhois.entries()) {
      for (const request of requests) {
        clearTimeout(request.timeout);
        request.reject(error);
      }

      this.pendingWhois.delete(nick);
    }
  }

  private emitChannelEvent(
    eventName: 'notice' | 'part' | 'kick' | 'join' | 'names',
    channel: string,
    ...args: string[] | [string] | [Users]
  ) {
    // @ts-expect-error ignore rough type spread
    this.emit(eventName, channel, ...args);
    // @ts-expect-error ignore rough type spread
    this.emit(eventName + channel, ...args);
  }

  private cancelAutoRenick(): void {
    if (this.connection?.renickInterval) {
      clearInterval(this.connection.renickInterval);
    }
  }

  private convertEncoding(str: Uint8Array) {
    if (this.opt.encoding) {
      return convertEncodingHelper(str, this.opt.encoding);
    }

    return utf8Decoder.decode(str);
  }

  private readBufferedLines(
    connection: IrcClient['connection'],
    chunk: string | Uint8Array,
  ): string[] {
    if (typeof chunk === 'string' && !connection.pendingBytes?.length) {
      return this.readBufferedTextLines(connection, chunk);
    }

    const chunkBytes = typeof chunk === 'string' ? utf8Encoder.encode(chunk) : chunk;
    if (connection.pendingText) {
      const pendingText = utf8Encoder.encode(connection.pendingText);
      connection.pendingText = undefined;
      return this.readBufferedByteLines(connection, concatUint8Arrays(pendingText, chunkBytes));
    }

    return this.readBufferedByteLines(connection, chunkBytes);
  }

  private readBufferedTextLines(connection: IrcClient['connection'], chunk: string): string[] {
    const text = `${connection.pendingText ?? ''}${chunk}`;
    const lines = text.split(lineDelimiter);
    const pendingText = lines.pop() ?? '';
    connection.pendingText = pendingText || undefined;
    return lines;
  }

  private readBufferedByteLines(connection: IrcClient['connection'], chunk: Uint8Array): string[] {
    if (!connection.pendingBytes?.length && isLineTerminated(chunk)) {
      connection.pendingBytes = undefined;
      return this.convertEncoding(chunk).split(lineDelimiter);
    }

    const bytes = connection.pendingBytes?.length
      ? concatUint8Arrays(connection.pendingBytes, chunk)
      : chunk;
    const lines: string[] = [];
    let lineStart = 0;

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte !== 10 && byte !== 13) {
        continue;
      }

      lines.push(this.convertEncoding(bytes.subarray(lineStart, i)));
      if (byte === 13 && bytes[i + 1] === 10) {
        i++;
      }

      lineStart = i + 1;
    }

    if (lineStart < bytes.length) {
      connection.pendingBytes = bytes.slice(lineStart);
    } else {
      connection.pendingBytes = undefined;
    }

    return lines;
  }

  private _speak(kind: string, target: string, text: string) {
    const maxLineLength = this.maxLineLength ?? 450;
    const maxLength = Math.min(maxLineLength - target.length, this.opt.messageSplit);
    if (typeof text === 'undefined') {
      return;
    }

    text
      .toString()
      .split(/\r?\n/)
      .filter(line => {
        return line.length > 0;
      })
      .forEach(line => {
        const linesToSend = this._splitLongLines(line, maxLength);
        linesToSend.forEach(toSend => {
          this.send(kind, target, toSend);
          if (kind === 'PRIVMSG') {
            this.emit('selfMessage', target, toSend);
          }
        });
      });
  }

  private _splitLongLines(words: string, maxLength = 450, destination: string[] = []): string[] {
    // If maxLength hasn't been initialized yet, prefer an arbitrarily low line length over crashing.
    // If no words left, return the accumulated array of splits
    if (words.length === 0) {
      return destination;
    }

    // If the remaining words fit under the byte limit (by utf-8, for Unicode support), push to the accumulator and return
    if (utf8ByteLength(words) <= maxLength) {
      destination.push(words);
      return destination;
    }

    // else, truncate by utf-8 bytes while preserving full code points
    const truncatedStr = truncateUtf8(words, maxLength);
    // and then check for a word boundary to try to keep words together
    const len = truncatedStr.length - 1;
    let c = truncatedStr[len];
    let cutPos = len;
    let wsLength = 1;
    if (/\s/.test(c)) {
      cutPos = len;
    } else {
      let offset = 1;
      while (len - offset > 0) {
        c = truncatedStr[len - offset];
        if (/\s/.test(c)) {
          cutPos = len - offset;
          break;
        }

        offset++;
      }

      if (len - offset <= 0) {
        cutPos = len;
        wsLength = 0;
      }
    }

    // and push the found region to the accumulator, remove from words, split rest of message
    const part = truncatedStr.slice(0, cutPos);
    destination.push(part);
    return this._splitLongLines(
      words.slice(cutPos + wsLength, words.length),
      maxLength,
      destination,
    );
  }

  /**
   * @param message rpl_welcome
   */
  private async _handleWelcome(message: Message) {
    // Set nick to whatever the server decided it really is
    // (normally this is because you chose something too long and the server has shortened it)
    this.nick = message.args[0];
    // Note our hostmask to use it in splitting long messages
    // We don't send our hostmask when issuing PRIVMSGs or NOTICEs, but servers on the other side will include it in messages and will truncate what we send accordingly
    const welcomeStringWords = message.args[1].split(/\s+/);
    this.hostMask = welcomeStringWords[welcomeStringWords.length - 1];
    this._updateMaxLineLength();
    // Clients must answer server PINGs during registration, but only start
    // client-initiated keepalives after registration completes.
    // https://modern.ircdocs.horse/#connection-registration
    this.connection.cyclingPingTimer.start();
    this.emit('registered', message);
    const res = await this.whois(this.nick);
    this.nick = res.nick ?? '';
    this.hostMask = `${res.user}@${res.host}`;
    this._updateMaxLineLength();
  }

  private _handleRawMessage(message: Message): void {
    switch (message.command) {
      case 'rpl_welcome': {
        this._handleWelcome(message).catch(err => this.debug(err));
        return;
      }
      case 'rpl_myinfo': {
        this.supported.usermodes = message.args[3];
        break;
      }
      case 'rpl_isupport': {
        applyIsupport(message.args, this.supported, this.modeForPrefix, this.prefixForMode);
        break;
      }
      case 'rpl_yourhost':
      case 'rpl_created':
      case 'rpl_luserclient':
      case 'rpl_luserop':
      case 'rpl_luserchannels':
      case 'rpl_luserme':
      case 'rpl_localusers':
      case 'rpl_globalusers':
      case 'rpl_statsconn':
      case 'rpl_luserunknown':
      case 'rpl_whoishost':
      case '396':
      case '042': {
        // Random welcome stuff, ignoring
        break;
      }
      case 'err_nicknameinuse': {
        this._handleNicknameinuse(message);
        break;
      }
      case 'PING': {
        this.send('PONG', message.args[0]);
        this.emit('ping', message.args[0]);
        break;
      }
      case 'PONG': {
        // PONG is "[<server>] <token>"; the server name is not the opaque token.
        // https://modern.ircdocs.horse/#pong-message
        this.emit('pong', message.args.at(-1) ?? '');
        break;
      }
      case 'NOTICE': {
        this._handleNotice(message);
        break;
      }
      case 'MODE': {
        this._handleMode(message);
        break;
      }
      case 'NICK': {
        this._handleNick(message);
        break;
      }
      case 'rpl_motdstart': {
        this.motd = `${message.args[1]}\n`;
        break;
      }
      case 'rpl_motd': {
        this.motd = `${this.motd ?? ''}${message.args[1]}\n`;
        break;
      }
      case 'rpl_endofmotd':
      case 'err_nomotd': {
        this.motd = `${this.motd ?? ''}${message.args[1]}\n`;
        this.emit('motd', this.motd);
        break;
      }
      case 'rpl_namreply': {
        this._handleNam(message);
        break;
      }
      case 'rpl_endofnames': {
        this._handleEndofnames(message);
        break;
      }
      case 'rpl_topic': {
        this._handleRplTopic(message);
        break;
      }
      case 'rpl_away': {
        this._addWhoisData(message.args[1], 'away', message.args[2], true);
        break;
      }
      case 'rpl_whoisuser': {
        this._addWhoisData(message.args[1], 'user', message.args[2]);
        this._addWhoisData(message.args[1], 'host', message.args[3]);
        this._addWhoisData(message.args[1], 'realname', message.args[5]);
        break;
      }
      case 'rpl_whoisidle': {
        this._addWhoisData(message.args[1], 'idle', message.args[2]);
        break;
      }
      case 'rpl_whoischannels': {
        // RPL_WHOISCHANNELS can be repeated when the list does not fit once.
        // https://modern.ircdocs.horse/#rplwhoischannels-319
        const existingChannels = this._whoisData[message.args[1]]?.channels;
        const channels = Array.isArray(existingChannels) ? existingChannels : [];
        this._addWhoisData(message.args[1], 'channels', [
          ...channels,
          ...message.args[2].trim().split(/\s+/),
        ]);
        break;
      }
      case 'rpl_whoisserver': {
        this._addWhoisData(message.args[1], 'server', message.args[2]);
        this._addWhoisData(message.args[1], 'serverinfo', message.args[3]);
        break;
      }
      case 'rpl_whoisoperator': {
        this._addWhoisData(message.args[1], 'operator', message.args[2]);
        break;
      }
      case '330': {
        // rpl_whoisaccount?
        this._addWhoisData(message.args[1], 'account', message.args[2]);
        this._addWhoisData(message.args[1], 'accountinfo', message.args[3]);
        break;
      }
      case 'rpl_endofwhois': {
        const whoisData = this._clearWhoisData(message.args[1]);
        this.resolvePendingWhois(message.args[1], whoisData);
        this.emit('whois', whoisData);
        break;
      }
      case 'rpl_whoreply': {
        this._addWhoisData(message.args[5], 'user', message.args[2]);
        this._addWhoisData(message.args[5], 'host', message.args[3]);
        this._addWhoisData(message.args[5], 'server', message.args[4]);
        const realnameMatch = /[0-9]+\s*(.+)/g.exec(message.args[7]);
        this._addWhoisData(message.args[5], 'realname', realnameMatch?.[1] ?? message.args[7]);
        // emit right away because rpl_endofwho doesn't contain nick
        const whoisData = this._clearWhoisData(message.args[5]);
        this.resolvePendingWhois(message.args[5], whoisData);
        this.emit('whois', whoisData);
        break;
      }
      case 'rpl_liststart': {
        this.channellist = [];
        this.channellistOpen = true;
        this.emit('channellist_start');
        break;
      }
      case 'rpl_list': {
        // RPL_LISTSTART may be skipped, so the first RPL_LIST starts a new list.
        // https://modern.ircdocs.horse/#rplliststart-321
        if (!this.channellistOpen) {
          this.channellist = [];
          this.channellistOpen = true;
        }

        this._handleList(message);
        break;
      }
      case 'rpl_listend': {
        this.emit('channellist', this.channellist);
        this.channellistOpen = false;
        break;
      }
      case 'rpl_topicwhotime': {
        this._handleTopicwhotime(message);
        break;
      }
      case 'TOPIC': {
        this._handleTopic(message);
        break;
      }
      case 'rpl_channelmodeis': {
        this._handleChannelmodeis(message);
        break;
      }
      case 'rpl_creationtime': {
        this._handleCreationtime(message);
        break;
      }
      case 'JOIN': {
        this._handleJoin(message);
        break;
      }
      case 'PART': {
        this._handlePart(message);
        break;
      }
      case 'KICK': {
        this._handleKick(message);
        break;
      }
      case 'KILL': {
        this._handleKill(message);
        break;
      }
      case 'PRIVMSG': {
        this._handlePrivmsg(message);
        break;
      }
      case 'INVITE': {
        this.emit('invite', message.args[1], message.nick, message);
        break;
      }
      case 'QUIT': {
        this._handleQuit(message);
        break;
      }
      // for sasl
      case 'CAP': {
        this._handleCap(message);
        break;
      }
      case 'AUTHENTICATE': {
        this._handleAuthenticate(message);
        break;
      }
      case 'rpl_loggedin': {
        break;
      }
      case 'rpl_saslsuccess': {
        this.send('CAP', 'END');
        break;
      }
      case 'err_saslfail':
      case 'err_sasltoolong':
      case 'err_saslaborted':
      case 'err_saslalready': {
        this.send('CAP', 'END');
        this.debug(message);
        this.emit('error', message);
        break;
      }
      case 'err_umodeunknownflag': {
        this.debug(message);
        this.emit('error', message);
        break;
      }
      case 'err_erroneusnickname': {
        this.debug(message);
        this.emit('error', message);
        break;
      }
      // Commands relating to OPER
      case 'err_nooperhost': {
        this.debug(message);
        this.emit('error', message);
        break;
      }
      case 'rpl_youreoper': {
        this.emit('opered');
        break;
      }
      case 'ERROR': {
        this.emit('error', message);
        break;
      }
      default: {
        if (message.commandType === 'error') {
          this.debug(message);
          this.emit('error', message);
        } else {
          this.debug('Unhandled message:', message);
          this.emit('unhandled', message);
          break;
        }
      }
    }
  }

  private _handleNick(message: Message): void {
    if (message.nick === this.nick) {
      // client just changed own nick
      this.nick = message.args[0];
      this.cancelAutoRenick();
      this._updateMaxLineLength();
    }

    this.debug(`NICK: ${message.nick} changes nick to ${message.args[0]}`);

    const channels: string[] = [];

    // Figure out what channels the user is in, update relevant nicks
    Object.entries(this.chans).forEach(([channame, chan]) => {
      if (message.nick in chan.users) {
        chan.users[message.args[0]] = chan.users[message.nick];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete chan.users[message.nick];
        channels.push(channame);
      }
    });

    // old nick, new nick, channels
    this.emit('nick', message.nick, message.args[0], channels, message);
  }

  private _handleNam(message: Message): void {
    const channel = this.chanData(message.args[2]);
    if (!channel) {
      return;
    }

    const users = message.args[3].trim().split(/ +/);
    users.forEach(user => {
      const match = /^(.)(.*)$/.exec(user);
      if (match) {
        if (match[1] in this.modeForPrefix) {
          channel.users[match[2]] = match[1];
        } else {
          channel.users[match[1] + match[2]] = '';
        }
      }
    });
  }

  private _handleMode(message: Message): void {
    this.debug(`MODE: ${message.args[0]} sets mode: ${message.args[1]}`);

    const channel = this.chanData(message.args[0]);
    if (!channel) {
      return;
    }

    const modeList = [...message.args[1]];
    let adding = true;
    const modeArgs = message.args.slice(2);
    const chanModes = (mode: string, param?: string | string[]) => {
      const isArr = param && Array.isArray(param);
      if (adding) {
        if (!channel.mode.includes(mode)) {
          channel.mode += mode;
        }

        if (typeof param === 'undefined') {
          channel.modeParams[mode] = [];
        } else if (isArr) {
          channel.modeParams[mode] = channel.modeParams[mode]
            ? [...channel.modeParams[mode], ...param]
            : param;
        } else {
          channel.modeParams[mode] = [param];
        }
      } else if (mode in channel.modeParams) {
        if (isArr && Array.isArray(channel.modeParams[mode])) {
          channel.modeParams[mode] = channel.modeParams[mode].filter((v: string) => v !== param[0]);
        }

        if (!isArr || channel.modeParams[mode].length === 0) {
          channel.mode = channel.mode.replace(mode, '');
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete channel.modeParams[mode];
        }
      }
    };

    modeList.forEach(mode => {
      if (mode === '+') {
        adding = true;
        return;
      }

      if (mode === '-') {
        adding = false;
        return;
      }

      const eventName = adding ? '+mode' : '-mode';
      const supported = this.supported.channel.modes;
      let modeArg: string;
      if (mode in this.prefixForMode) {
        modeArg = modeArgs.shift();
        if (Object.hasOwn(channel.users, modeArg)) {
          if (adding) {
            if (!channel.users[modeArg].includes(this.prefixForMode[mode])) {
              channel.users[modeArg] += this.prefixForMode[mode];
            }
          } else {
            channel.users[modeArg] = channel.users[modeArg].replace(this.prefixForMode[mode], '');
          }
        }

        this.emit(eventName, message.args[0], message.nick, mode, modeArg, message);
      } else if (supported.a.includes(mode)) {
        modeArg = modeArgs.shift();
        chanModes(mode, [modeArg]);
        this.emit(eventName, message.args[0], message.nick, mode, modeArg, message);
      } else if (supported.b.includes(mode)) {
        modeArg = modeArgs.shift();
        chanModes(mode, modeArg);
        this.emit(eventName, message.args[0], message.nick, mode, modeArg, message);
      } else if (supported.c.includes(mode)) {
        if (adding) {
          modeArg = modeArgs.shift();
        } else {
          modeArg = undefined;
        }

        chanModes(mode, modeArg);
        this.emit(eventName, message.args[0], message.nick, mode, modeArg, message);
      } else if (supported.d.includes(mode)) {
        chanModes(mode);
        this.emit(eventName, message.args[0], message.nick, mode, undefined, message);
      }
    });
  }

  private chanData(name: string, create = false): ChannelData {
    const key = name.toLowerCase();
    if (create) {
      this.chans[key] = this.chans[key] ?? {
        key,
        serverName: name,
        users: {},
        modeParams: {},
        mode: '',
      };
    }

    return this.chans[key];
  }

  private _handleNotice(message: Message): void {
    const from = message.nick;
    const to: string | undefined = message.args[0] ?? null;
    const text = message.args[1] ?? '';

    if (text.startsWith('\u0001') && text.lastIndexOf('\u0001') > 0) {
      this._handleCTCP(from, to, text, 'notice', message);
      return;
    }

    this.emit('notice', from, to, text, message);

    if (to === this.nick) {
      this.debug(`GOT NOTICE from ${from ? `"${from}"` : 'the server'}: "${text}"`);
    }
  }

  // eslint-disable-next-line max-params
  private _handleCTCP(
    from: string,
    to: string,
    text: string,
    type: 'notice' | 'privmsg',
    message: Message,
  ): void {
    text = text.slice(1);
    text = text.slice(0, text.indexOf('\u0001'));
    const parts = text.split(' ');
    this.emit('ctcp', from, to, text, type, message);
    this.emit(`ctcp-${type}` as 'ctcp-notice', from, to, text, message);
    if (type === 'privmsg' && text === 'VERSION') {
      this.emit('ctcp-version', from, to, message);
    }

    if (parts[0] === 'ACTION' && parts.length > 1) {
      this.emit('action', from, to, parts.slice(1).join(' '), message);
    }

    if (parts[0] === 'PING' && type === 'privmsg' && parts.length > 1) {
      this.ctcp(from, 'notice', text);
    }
  }

  private ctcp(to: string, type: 'privmsg' | string, text: string) {
    return this[type === 'privmsg' ? 'say' : 'notice'](to, `\u0001${text}\u0001`);
  }

  private _isChannelTracked(channelName: string): boolean {
    const lower = channelName.toLowerCase();
    const inOpt = this.opt.channels.some(entry => {
      return entry.split(' ')[0].toLowerCase() === lower;
    });
    if (inOpt) {
      return true;
    }

    return this._autoJoinChannels.some(name => name.toLowerCase() === lower);
  }

  private _handleNicknameinuse(message: Message): void {
    if (typeof this.nickMod === 'undefined') {
      this.nickMod = 0;
    }

    if (
      message.args[1] === this.opt.nick &&
      (this.connection.renickInterval || this.connection.attemptedLastRenick)
    ) {
      this.debug('Attempted to automatically renick to', message.args[1], 'and found it taken');
      return;
    }

    this.nickMod++;
    this.send('NICK', `${this.opt.nick}${this.nickMod}`);
    this.nick = `${this.opt.nick}${this.nickMod}`;
    this._updateMaxLineLength();
    if (this.opt.autoRenick) {
      let renickTimes = 0;
      this.cancelAutoRenick();
      this.connection.renickInterval = setInterval(() => {
        if (this.nick === this.opt.nick) {
          this.debug(
            'Attempted to automatically renick to',
            this.nick,
            'and found that was the current nick',
          );
          this.cancelAutoRenick();
          return;
        }

        this.send('NICK', this.opt.nick);
        renickTimes++;
        if (this.opt.renickCount !== null && renickTimes >= this.opt.renickCount) {
          this.debug(`Maximum autorenick retry count (${this.opt.renickCount}) reached`);
          this.cancelAutoRenick();
          this.connection.attemptedLastRenick = true;
        }
      }, this.opt.renickDelay);
    }
  }

  private _addWhoisData(
    nick: string,
    key: string,
    value: string | string[],
    onlyIfExists?: boolean,
  ) {
    if (onlyIfExists && !this._whoisData[nick]) {
      return;
    }

    this._whoisData[nick] = this._whoisData[nick] ?? { nick };
    this._whoisData[nick][key] = value;
  }

  private _clearWhoisData(nick: string) {
    // Ensure that at least the nick exists before trying to return
    this._addWhoisData(nick, 'nick', nick);
    const data = this._whoisData[nick];
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this._whoisData[nick];
    return data;
  }

  private _connectionHandler() {
    this.debug('Socket connection successful');

    // WEBIRC
    if (this.opt.webirc.ip && this.opt.webirc.pass && this.opt.webirc.host) {
      this.send(
        'WEBIRC',
        this.opt.webirc.pass,
        this.opt.userName,
        this.opt.webirc.host,
        this.opt.webirc.ip,
      );
    }

    // CAP negotiation suspends registration until CAP END.
    // https://modern.ircdocs.horse/#capability-negotiation
    if (this.opt.sasl) {
      // see http://ircv3.net/specs/extensions/sasl-3.1.html
      this.send('CAP', 'LS', '302');
    }

    if (this.opt.password) {
      this.send('PASS', this.opt.password);
    }

    // handshake details
    this.debug('Sending irc NICK/USER');
    this.send('NICK', this.opt.nick);
    this.nick = this.opt.nick;
    this._updateMaxLineLength();
    // USER syntax: https://modern.ircdocs.horse/#user-message
    this.send('USER', this.opt.userName, '0', '*', this.opt.realName);

    this.emit('connect');
  }

  private _updateMaxLineLength() {
    // 497 = 510 - (":" + "!" + " PRIVMSG " + " :").length;
    // target is determined in _speak() and subtracted there
    this.maxLineLength = 497 - this.nick.length - this.hostMask.length;
  }

  private _handleAuthenticate(message: Message): void {
    if (message.args[0] !== '+') {
      return;
    }

    // AUTHENTICATE response (params) must be split into 400-byte chunks
    const authMessage = stringToBase64(
      `${this.opt.nick}\0${this.opt.userName}\0${this.opt.password}`,
    );
    // must output a "+" after a 400-byte string to make clear it's finished
    for (let i = 0; i < (authMessage.length + 1) / 400; i++) {
      let chunk = authMessage.slice(i * 400, (i + 1) * 400);
      if (chunk === '') {
        chunk = '+';
      }

      this.send('AUTHENTICATE', chunk);
    }
  }

  private _handlePart(message: Message): void {
    // channel, who, reason
    if (this.nick === message.nick) {
      const channel = this.chanData(message.args[0]);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.chans[channel.key];
    } else {
      const channel = this.chanData(message.args[0]);
      if (channel?.users) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete channel.users[message.nick];
      }
    }

    this.emitChannelEvent('part', message.args[0], message.nick, message.args[1]);
  }

  private _handleKick(message: Message): void {
    if (this.nick === message.args[1]) {
      const channel = this.chanData(message.args[0]);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.chans[channel.key ?? ''];
    } else {
      const channel = this.chanData(message.args[0]);
      if (channel?.users) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete channel.users[message.args[1]];
      }
    }

    // channel, who, by, reason
    this.emitChannelEvent('kick', message.args[0], message.args[1], message.nick, message.args[2]);
  }

  private _handleList(message: Message): void {
    const channel = {
      name: message.args[1],
      users: {},
      userCount: Number.parseInt(message.args[2], 10),
      topic: message.args[3],
    };
    this.emit('channellist_item', channel);
    this.channellist.push(channel);
  }

  private _handleKill(message: Message): void {
    const nick = message.args[0];
    const channels: string[] = [];
    Object.entries(this.chans).forEach(([channame, chan]) => {
      if (nick in chan.users) {
        channels.push(channame);
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete chan.users[nick];
      }
    });
    this.emit('kill', nick, message.args[1], channels, message);
  }

  private _handlePrivmsg(message: Message): void {
    const from = message.nick;
    const to = message.args[0];
    const text = message.args[1] ?? '';
    if (text.startsWith('\u0001') && text.lastIndexOf('\u0001') > 0) {
      this._handleCTCP(from, to, text, 'privmsg', message);
      return;
    }

    this.emit('message', from, to, text, message);
    if (this.supported.channel.types.includes(to.charAt(0))) {
      this.emit(`message#${to.toLowerCase()}` as `message#${string}`, from, to, text, message);
    }

    if (to.toUpperCase() === this.nick.toUpperCase()) {
      this.emit('pm', from, text, message);
      this.debug(`GOT MESSAGE from "${from}": "${text}"`);
    }
  }

  private _handleQuit(message: Message): void {
    this.debug(`QUIT: ${message.prefix} ${message.args.join(' ')}`);
    if (this.nick === message.nick) {
      // TODO handle?
      return;
    }

    // handle other people quitting
    const channels: string[] = [];

    // Figure out what channels the user was in
    Object.entries(this.chans).forEach(([channame, chan]) => {
      if (message.nick in chan.users) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete chan.users[message.nick];
        channels.push(channame);
      }
    });

    // who, reason, channels
    this.emit('quit', message.nick, message.args[0], channels, message);
  }

  private _handleCap(message: Message): void {
    // client identifier name, cap subcommand, params
    if (message.args[1] === 'NAK') {
      // capabilities not handled, error
      this.send('CAP', 'END');
      this.debug(message);
      this.emit('error', message);
      return;
    }

    if (message.args[1] === 'LS') {
      const caps = message.args.at(-1)?.split(/\s+/) ?? [];
      if (this.opt.sasl && caps.includes('sasl')) {
        this.send('CAP', 'REQ', 'sasl');
      } else if (message.args[2] !== '*') {
        this.send('CAP', 'END');
      }

      return;
    }

    // currently only handle ACK sasl responses
    if (message.args[1] !== 'ACK') {
      return;
    }

    const caps = message.args[2].split(/\s+/);
    if (!caps.includes('sasl')) {
      return;
    }

    this.send('AUTHENTICATE', 'PLAIN');
  }

  private _handleJoin(message: Message): void {
    // channel, who
    if (this.nick === message.nick) {
      this.chanData(message.args[0], true);
    } else {
      const channel = this.chanData(message.args[0]);
      if (channel?.users) {
        channel.users[message.nick] = '';
      }
    }

    this.emitChannelEvent('join', message.args[0], message.nick);
  }

  private _handleTopic(message: Message): void {
    // channel, topic, nick
    this.emit('topic', message.args[0], message.args[1], message.nick, message);

    const channel = this.chanData(message.args[0]);
    if (channel) {
      channel.topic = message.args[1];
      channel.topicBy = message.nick;
    }
  }

  private _handleTopicwhotime(message: Message): void {
    const channel = this.chanData(message.args[1]);
    if (channel) {
      channel.topicBy = message.args[2];
      // channel, topic, nick
      this.emit('topic', message.args[1], channel.topic, channel.topicBy, message);
    }
  }

  private _handleChannelmodeis(message: Message): void {
    const channel = this.chanData(message.args[1]);
    if (channel) {
      channel.mode = message.args[2];
      channel.modeParams = {};
      // RPL_CHANNELMODEIS includes mode arguments after the modestring.
      // https://modern.ircdocs.horse/#rplchannelmodeis-324
      const modeArgs = message.args.slice(3);
      for (const mode of message.args[2].replaceAll(/[+-]/g, '')) {
        const modeArg = modeArgs.shift();
        if (modeArg) {
          channel.modeParams[mode] = [modeArg];
        }
      }
    }
  }

  private _handleCreationtime(message: Message): void {
    const channel = this.chanData(message.args[1]);
    if (channel) {
      channel.created = message.args[2];
    }
  }

  private _handleRplTopic(message: Message): void {
    const channel = this.chanData(message.args[1]);
    if (channel) {
      channel.topic = message.args[2];
    }
  }

  private _handleEndofnames(message: Message): void {
    const channel = this.chanData(message.args[1]);
    if (channel) {
      this.emitChannelEvent('names', message.args[1], channel.users);
      this.send('MODE', message.args[1]);
    }
  }
}
