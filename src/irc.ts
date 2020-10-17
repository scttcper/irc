/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable complexity */
import net from 'net';
import { connect } from 'tls';
import util from 'util';
import { EventEmitter } from 'events';
import iconv from 'iconv-lite';
import charsetDetector from 'chardet';

import { COLORS } from './colors';
import { parseMessage } from './parseMessage';
import { CyclingPingTimer } from './cyclingPingTimer';

const lineDelimiter = new RegExp(/\r\n|\r|\n/);

const defaultOptions = {
  server: '',
  nick: '',
  userName: 'nodebot',
  realName: 'nodeJS IRC client',
  password: null,
  port: 6667,
  localAddress: null,
  debug: false,
  showErrors: false,
  channels: [] as string[],
  autoRejoin: false,
  autoRenick: false,
  autoConnect: true,
  retryCount: null,
  retryDelay: 2000,
  renickCount: null as number | null,
  renickDelay: 60000,
  secure: false,
  selfSigned: false,
  certExpired: false,
  floodProtection: false,
  floodProtectionDelay: 1000,
  sasl: false,
  webirc: {
    pass: '',
    ip: '',
    host: '',
  },
  stripColors: false,
  channelPrefixes: '&#',
  messageSplit: 512,
  encoding: null,
  millisecondsOfSilenceBeforePingSent: 15 * 1000,
  millisecondsBeforePingTimeout: 8 * 1000,
  enableStrictParse: false,
};

export class Client extends EventEmitter {
  opt = defaultOptions;
  nick = '';
  nickMod = 0;
  // Features supported by the server
  // (Initial values are RFC 1459 defaults. Zeros signify no default or unlimited value.)
  supported = {
    channel: {
      idlength: {},
      length: 200,
      limit: [] as number[],
      modes: { a: '', b: '', c: '', d: '' },
      types: this.opt.channelPrefixes,
    },
    kicklength: 0,
    maxlist: [] as number[],
    maxtargets: {},
    modes: 3,
    nicklength: 9,
    topiclength: 0,
    usermodes: '',
  };

  // Instead of wrapping every debug call in a guard, provide debug and error methods for the client.
  out = {
    showErrors: this.opt.showErrors,
    showDebug: this.opt.debug,
    error: (...args) => {
      if (!this.out.showDebug && !this.out.showErrors) return;
      // '\u001b[01;31mERROR: ' + errorObjs + '\u001b[0m'
      args.unshift('\u001b[01;31mERROR:');
      args.push('\u001b[0m');
      // TODO: what is util.log?
      console.log(...args);
    },
    debug: (...args) => {
      if (!this.out.showDebug) return;
      // TODO: what is util.log?
      console.log(...args);
    },
  };

  hostMask = '';
  maxLineLength!: number;
  chans: any;
  cmdQueue: any[] = [];
  _whoisData: any;
  conn: any;
  // {
  //   cyclingPingTimer?: CyclingPingTimer;
  //   renickInterval?: ReturnType<typeof setInterval>;
  //   attemptedLastRenick?: boolean;
  // };
  retryTimeout: any;
  modeForPrefix: any;
  prefixForMode: any;
  motd: any;
  channellist: any;
  floodProtectionEnabled: any;

  constructor(server: string, clientNick: string, opt?: typeof defaultOptions) {
    super();
    this.opt.server = server;
    this.opt.nick = clientNick;

    if (typeof opt === 'object') {
      Object.keys(this.opt).forEach(k => {
        if (typeof opt[k] !== 'undefined') {
          this.opt[k] = opt[k];
        }
      });
    }

    if (this.opt.floodProtection) {
      // this.activateFloodProtection();
    }

    // TODO - fail if nick or server missing
    // TODO - fail if username has a space in it
    if (this.opt.autoConnect) {
      this.connect();
    }

    this.addListener('raw', message => {
      var channels: string[] = [];
      var channel;
      var nick;
      var from;
      var text;
      var to;

      switch (message.command) {
        case 'rpl_welcome':
          // Set nick to whatever the server decided it really is
          // (normally this is because you chose something too long and the server has shortened it)
          this.nick = message.args[0];
          // Note our hostmask to use it in splitting long messages
          // We don't send our hostmask when issuing PRIVMSGs or NOTICEs, but servers on the other side will include it in messages and will truncate what we send accordingly
          var welcomeStringWords = message.args[1].split(/\s+/);
          this.hostMask = welcomeStringWords[welcomeStringWords.length - 1];
          this._updateMaxLineLength();
          this.emit('registered', message);
          this.whois(this.nick, args => {
            this.nick = args.nick;
            this.hostMask = args.user + '@' + args.host;
            this._updateMaxLineLength();
          });
          break;
        case 'rpl_myinfo':
          this.supported.usermodes = message.args[3];
          break;
        case 'rpl_isupport':
          message.args.forEach(arg => {
            var match;
            match = arg.match(/([A-Z]+)=(.*)/);
            if (match) {
              var param = match[1];
              var value = match[2];
              // eslint-disable-next-line default-case
              switch (param) {
                case 'CHANLIMIT':
                  value.split(',').forEach(val => {
                    val = val.split(':');
                    this.supported.channel.limit[val[0]] = parseInt(val[1], 10);
                  });
                  break;
                case 'CHANMODES':
                  value = value.split(',');
                  var type = ['a', 'b', 'c', 'd'];
                  for (var i = 0; i < type.length; i++) {
                    this.supported.channel.modes[type[i]] += value[i];
                  }

                  break;
                case 'CHANTYPES':
                  this.supported.channel.types = value;
                  break;
                case 'CHANNELLEN':
                  this.supported.channel.length = parseInt(value, 10);
                  break;
                case 'IDCHAN':
                  value.split(',').forEach(val => {
                    val = val.split(':');
                    this.supported.channel.idlength[val[0]] = parseInt(val[1], 10);
                  });
                  break;
                case 'KICKLEN':
                  this.supported.kicklength = parseInt(value, 10);
                  break;
                case 'MAXLIST':
                  value.split(',').forEach(val => {
                    val = val.split(':');
                    this.supported.maxlist[val[0]] = parseInt(val[1], 10);
                  });
                  break;
                case 'NICKLEN':
                  this.supported.nicklength = parseInt(value, 10);
                  break;
                case 'PREFIX':
                  match = value.match(/\((.*?)\)(.*)/);
                  if (match) {
                    match[1] = match[1].split('');
                    match[2] = match[2].split('');
                    while (match[1].length) {
                      this.modeForPrefix[match[2][0]] = match[1][0];
                      this.supported.channel.modes.b += match[1][0];
                      this.prefixForMode[match[1].shift()] = match[2].shift();
                    }
                  }

                  break;
                case 'TARGMAX':
                  value.split(',').forEach(val => {
                    val = val.split(':');
                    // eslint-disable-next-line no-negated-condition
                    val[1] = !val[1] ? 0 : parseInt(val[1], 10);
                    this.supported.maxtargets[val[0]] = val[1];
                  });
                  break;
                case 'TOPICLEN':
                  this.supported.topiclength = parseInt(value, 10);
                  break;
              }
            }
          });
          break;
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
        case '042':
          // Random welcome stuff, ignoring
          break;
        case 'err_nicknameinuse':
          if (typeof this.nickMod === 'undefined') {
            this.nickMod = 0;
          }

          if (
            message.args[1] === this.opt.nick &&
            (this.conn.renickInterval || this.conn.attemptedLastRenick)
          ) {
            this.out.debug(
              'Attempted to automatically renick to',
              message.args[1],
              'and found it taken',
            );
            break;
          }

          this.nickMod++;
          this.send('NICK', this.opt.nick + this.nickMod);
          this.nick = this.opt.nick + this.nickMod;
          this._updateMaxLineLength();
          if (this.opt.autoRenick) {
            var renickTimes = 0;
            this.cancelAutoRenick();
            this.conn.renickInterval = setInterval(() => {
              if (this.nick === this.opt.nick) {
                this.out.debug(
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
                this.out.debug(
                  'Maximum autorenick retry count (' + this.opt.renickCount + ') reached',
                );
                this.cancelAutoRenick();
                this.conn.attemptedLastRenick = true;
              }
            }, this.opt.renickDelay);
          }

          break;
        case 'PING':
          this.send('PONG', message.args[0]);
          this.emit('ping', message.args[0]);
          break;
        case 'PONG':
          this.emit('pong', message.args[0]);
          break;
        case 'NOTICE':
          from = message.nick;
          to = message.args[0];
          if (!to) {
            to = null;
          }

          text = message.args[1] || '';
          if (text[0] === '\u0001' && text.lastIndexOf('\u0001') > 0) {
            this._handleCTCP(from, to, text, 'notice', message);
            break;
          }

          this.emit('notice', from, to, text, message);

          if (to === this.nick)
            this.out.debug(
              'GOT NOTICE from ' + (from ? '"' + from + '"' : 'the server') + ': "' + text + '"',
            );
          break;
        case 'MODE':
          this.out.debug('MODE: ' + message.args[0] + ' sets mode: ' + message.args[1]);

          channel = this.chanData(message.args[0]);
          if (!channel) {
            break;
          }

          var modeList = message.args[1].split('');
          var adding = true;
          var modeArgs = message.args.slice(2);
          var chanModes = function (mode, param?) {
            var arr = param && Array.isArray(param);
            if (adding) {
              if (channel.mode.indexOf(mode) === -1) {
                channel.mode += mode;
              }

              if (typeof param === 'undefined') {
                channel.modeParams[mode] = [];
              } else if (arr) {
                channel.modeParams[mode] = channel.modeParams[mode]
                  ? channel.modeParams[mode].concat(param)
                  : param;
              } else {
                channel.modeParams[mode] = [param];
              }
            } else if (mode in channel.modeParams) {
              if (arr) {
                channel.modeParams[mode] = channel.modeParams[mode].filter(function (v) {
                  return v !== param[0];
                });
              }

              if (!arr || channel.modeParams[mode].length === 0) {
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

            const eventName = (adding ? '+' : '-') + 'mode';
            var supported = this.supported.channel.modes;
            var modeArg;
            if (mode in this.prefixForMode) {
              modeArg = modeArgs.shift();
              if (Object.prototype.hasOwnProperty.call(channel.users, modeArg)) {
                if (adding) {
                  if (channel.users[modeArg].indexOf(this.prefixForMode[mode]) === -1)
                    channel.users[modeArg] += this.prefixForMode[mode];
                } else
                  channel.users[modeArg] = channel.users[modeArg].replace(
                    this.prefixForMode[mode],
                    '',
                  );
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
              if (adding) modeArg = modeArgs.shift();
              else modeArg = undefined;
              chanModes(mode, modeArg);
              this.emit(eventName, message.args[0], message.nick, mode, modeArg, message);
            } else if (supported.d.includes(mode)) {
              chanModes(mode);
              this.emit(eventName, message.args[0], message.nick, mode, undefined, message);
            }
          });
          break;
        case 'NICK':
          if (message.nick === this.nick) {
            // client just changed own nick
            this.nick = message.args[0];
            this.cancelAutoRenick();
            this._updateMaxLineLength();
          }

          this.out.debug('NICK: ' + message.nick + ' changes nick to ' + message.args[0]);

          channels = [];

          // Figure out what channels the user is in, update relevant nicks
          Object.keys(this.chans).forEach(channame => {
            var chan = this.chans[channame];
            if (message.nick in chan.users) {
              chan.users[message.args[0]] = chan.users[message.nick];
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete chan.users[message.nick];
              channels.push(channame);
            }
          });

          // old nick, new nick, channels
          this.emit('nick', message.nick, message.args[0], channels, message);
          break;
        case 'rpl_motdstart':
          this.motd = message.args[1] + '\n';
          break;
        case 'rpl_motd':
          this.motd += message.args[1] + '\n';
          break;
        case 'rpl_endofmotd':
        case 'err_nomotd':
          this.motd += message.args[1] + '\n';
          this.emit('motd', this.motd);
          break;
        case 'rpl_namreply':
          channel = this.chanData(message.args[2]);
          var users = message.args[3].trim().split(/ +/);
          if (channel) {
            users.forEach(function (user) {
              var match = user.match(/^(.)(.*)$/);
              if (match) {
                if (match[1] in this.modeForPrefix) {
                  channel.users[match[2]] = match[1];
                } else {
                  channel.users[match[1] + match[2]] = '';
                }
              }
            });
          }

          break;
        case 'rpl_endofnames':
          channel = this.chanData(message.args[1]);
          if (channel) {
            this.emitChannelEvent('names', message.args[1], channel.users);
            this.send('MODE', message.args[1]);
          }

          break;
        case 'rpl_topic':
          channel = this.chanData(message.args[1]);
          if (channel) {
            channel.topic = message.args[2];
          }

          break;
        case 'rpl_away':
          this._addWhoisData(message.args[1], 'away', message.args[2], true);
          break;
        case 'rpl_whoisuser':
          this._addWhoisData(message.args[1], 'user', message.args[2]);
          this._addWhoisData(message.args[1], 'host', message.args[3]);
          this._addWhoisData(message.args[1], 'realname', message.args[5]);
          break;
        case 'rpl_whoisidle':
          this._addWhoisData(message.args[1], 'idle', message.args[2]);
          break;
        case 'rpl_whoischannels':
          // TODO - clean this up?
          this._addWhoisData(message.args[1], 'channels', message.args[2].trim().split(/\s+/));
          break;
        case 'rpl_whoisserver':
          this._addWhoisData(message.args[1], 'server', message.args[2]);
          this._addWhoisData(message.args[1], 'serverinfo', message.args[3]);
          break;
        case 'rpl_whoisoperator':
          this._addWhoisData(message.args[1], 'operator', message.args[2]);
          break;
        case '330': // rpl_whoisaccount?
          this._addWhoisData(message.args[1], 'account', message.args[2]);
          this._addWhoisData(message.args[1], 'accountinfo', message.args[3]);
          break;
        case 'rpl_endofwhois':
          this.emit('whois', this._clearWhoisData(message.args[1]));
          break;
        case 'rpl_whoreply':
          this._addWhoisData(message.args[5], 'user', message.args[2]);
          this._addWhoisData(message.args[5], 'host', message.args[3]);
          this._addWhoisData(message.args[5], 'server', message.args[4]);
          this._addWhoisData(
            message.args[5],
            'realname',
            /[0-9]+\s*(.+)/g.exec(message.args[7])[1],
          );
          // emit right away because rpl_endofwho doesn't contain nick
          this.emit('whois', this._clearWhoisData(message.args[5]));
          break;
        case 'rpl_liststart':
          this.channellist = [];
          this.emit('channellist_start');
          break;
        case 'rpl_list':
          channel = {
            name: message.args[1],
            users: message.args[2],
            topic: message.args[3],
          };
          this.emit('channellist_item', channel);
          this.channellist.push(channel);
          break;
        case 'rpl_listend':
          this.emit('channellist', this.channellist);
          break;
        case 'rpl_topicwhotime':
          channel = this.chanData(message.args[1]);
          if (channel) {
            channel.topicBy = message.args[2];
            // channel, topic, nick
            this.emit('topic', message.args[1], channel.topic, channel.topicBy, message);
          }

          break;
        case 'TOPIC':
          // channel, topic, nick
          this.emit('topic', message.args[0], message.args[1], message.nick, message);

          channel = this.chanData(message.args[0]);
          if (channel) {
            channel.topic = message.args[1];
            channel.topicBy = message.nick;
          }

          break;
        case 'rpl_channelmodeis':
          channel = this.chanData(message.args[1]);
          if (channel) {
            channel.mode = message.args[2];
          }

          break;
        case 'rpl_creationtime':
          channel = this.chanData(message.args[1]);
          if (channel) {
            channel.created = message.args[2];
          }

          break;
        case 'JOIN':
          // channel, who
          if (this.nick === message.nick) {
            this.chanData(message.args[0], true);
          } else {
            channel = this.chanData(message.args[0]);
            if (channel?.users) {
              channel.users[message.nick] = '';
            }
          }

          this.emitChannelEvent('join', message.args[0], message.nick, message);
          break;
        case 'PART':
          // channel, who, reason
          this.emitChannelEvent('part', message.args[0], message.nick, message.args[1], message);
          if (this.nick === message.nick) {
            channel = this.chanData(message.args[0]);
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.chans[channel.key];
          } else {
            channel = this.chanData(message.args[0]);
            if (channel?.users) {
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete channel.users[message.nick];
            }
          }

          break;
        case 'KICK':
          // channel, who, by, reason
          this.emitChannelEvent(
            'kick',
            message.args[0],
            message.args[1],
            message.nick,
            message.args[2],
            message,
          );

          if (this.nick === message.args[1]) {
            channel = this.chanData(message.args[0]);
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.chans[channel.key];
          } else {
            channel = this.chanData(message.args[0]);
            if (channel?.users) {
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete channel.users[message.args[1]];
            }
          }

          break;
        case 'KILL':
          nick = message.args[0];
          channels = [];
          Object.keys(this.chans).forEach(channame => {
            var chan = this.chans[channame];
            if (nick in chan.users) {
              channels.push(channame);
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete chan.users[nick];
            }
          });
          this.emit('kill', nick, message.args[1], channels, message);
          break;
        case 'PRIVMSG':
          from = message.nick;
          to = message.args[0];
          text = message.args[1] || '';
          if (text[0] === '\u0001' && text.lastIndexOf('\u0001') > 0) {
            this._handleCTCP(from, to, text, 'privmsg', message);
            break;
          }

          this.emit('message', from, to, text, message);
          if (this.supported.channel.types.includes(to.charAt(0))) {
            this.emit('message#', from, to, text, message);
            this.emit('message' + to, from, text, message);
            if (to !== to.toLowerCase()) {
              this.emit('message' + to.toLowerCase(), from, text, message);
            }
          }

          if (to.toUpperCase() === this.nick.toUpperCase()) {
            this.emit('pm', from, text, message);
            this.out.debug('GOT MESSAGE from "' + from + '": "' + text + '"');
          }

          break;
        case 'INVITE':
          from = message.nick;
          to = message.args[0];
          channel = message.args[1];
          this.emit('invite', channel, from, message);
          break;
        case 'QUIT':
          this.out.debug('QUIT: ' + message.prefix + ' ' + message.args.join(' '));
          if (this.nick === message.nick) {
            // TODO handle?
            break;
          }

          // handle other people quitting
          channels = [];

          // Figure out what channels the user was in
          Object.keys(this.chans).forEach(function (channame) {
            var chan = this.chans[channame];
            if (message.nick in chan.users) {
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete chan.users[message.nick];
              channels.push(channame);
            }
          });

          // who, reason, channels
          this.emit('quit', message.nick, message.args[0], channels, message);
          break;

        // for sasl
        case 'CAP':
          // client identifier name, cap subcommand, params
          if (message.args[1] === 'NAK') {
            // capabilities not handled, error
            this.out.error(message);
            this.emit('error', message);
            break;
          }

          // currently only handle ACK sasl responses
          if (message.args[1] !== 'ACK') break;
          var caps = message.args[2].split(/\s+/);
          if (caps.indexOf('sasl') < 0) break;

          this.send('AUTHENTICATE', 'PLAIN');
          break;
        case 'AUTHENTICATE':
          if (message.args[0] !== '+') break;
          // AUTHENTICATE response (params) must be split into 400-byte chunks
          var authMessage = Buffer.from(
            this.opt.nick + '\0' + this.opt.userName + '\0' + this.opt.password,
          ).toString('base64');
          // must output a "+" after a 400-byte string to make clear it's finished
          for (var i = 0; i < (authMessage.length + 1) / 400; i++) {
            var chunk = authMessage.slice(i * 400, (i + 1) * 400);
            if (chunk === '') chunk = '+';
            this.send('AUTHENTICATE', chunk);
          }

          break;
        case 'rpl_loggedin':
          break;
        case 'rpl_saslsuccess':
          this.send('CAP', 'END');
          break;

        case 'err_umodeunknownflag':
          this.out.error(message);
          this.emit('error', message);
          break;

        case 'err_erroneusnickname':
          this.out.error(message);
          this.emit('error', message);
          break;

        // Commands relating to OPER
        case 'err_nooperhost':
          this.out.error(message);
          this.emit('error', message);
          break;
        case 'rpl_youreoper':
          this.emit('opered');
          break;

        default:
          if (message.commandType === 'error') {
            this.out.error(message);
            this.emit('error', message);
          } else {
            this.out.error('Unhandled message:', message);
            this.emit('unhandled', message);
            break;
          }
      }
    });

    this.addListener('kick', (channel: string, nick: string) => {
      if (this.opt.autoRejoin && nick.toLowerCase() === this.nick.toLowerCase()) {
        this.join(channel);
      }
    });
    this.addListener('motd', function () {
      this.opt.channels.forEach(function (channel) {
        this.join(channel);
      });
    });
  }

  connectionTimedOut(conn) {
    if (conn !== this.conn) {
      // Only care about a timeout event if it came from the current connection
      return;
    }

    this.end();
  }

  chanData(name: string, create?) {
    var key = name.toLowerCase();
    if (create) {
      this.chans[key] = this.chans[key] || {
        key: key,
        serverName: name,
        users: {},
        modeParams: {},
        mode: '',
      };
    }

    return this.chans[key];
  }

  _connectionHandler() {
    this.out.debug('Socket connection successful');

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

    // SASL, server password
    if (this.opt.sasl) {
      // see http://ircv3.net/specs/extensions/sasl-3.1.html
      this.send('CAP', 'REQ', 'sasl');
    } else if (this.opt.password) {
      this.send('PASS', this.opt.password);
    }

    // handshake details
    this.out.debug('Sending irc NICK/USER');
    this.send('NICK', this.opt.nick);
    this.nick = this.opt.nick;
    this._updateMaxLineLength();
    this.send('USER', this.opt.userName, 8, '*', this.opt.realName);

    // watch for ping timeout
    this.conn.cyclingPingTimer.start();

    this.emit('connect');
  }

  connect(retryCount?, callback?) {
    if (typeof retryCount === 'function') {
      callback = retryCount;
      retryCount = undefined;
    }

    retryCount = retryCount || 0;

    if (typeof callback === 'function') {
      this.once('registered', callback);
    }

    // skip connect if already connected
    if (this.conn && !this.conn.requestedDisconnect) {
      this.out.error('Connection already active, not reconnecting – please disconnect first');
      return;
    }

    this.chans = {};

    // socket opts
    var connectionOpts: any = {
      host: this.opt.server,
      port: this.opt.port,
    };

    // local address to bind to
    if (this.opt.localAddress) {
      connectionOpts.localAddress = this.opt.localAddress;
    }

    this.out.debug('Attempting socket connection to IRC server');
    // try to connect to the server
    if (this.opt.secure) {
      connectionOpts.rejectUnauthorized = !this.opt.selfSigned;

      if (typeof this.opt.secure === 'object') {
        // copy "secure" opts to options passed to connect()
        for (const f of Object.keys(this.opt.secure)) {
          connectionOpts[f] = this.opt.secure[f];
        }
      }

      this.conn = connect(connectionOpts, () => {
        // callback called only after successful socket connection
        this.conn.connected = true;
        if (
          this.conn.authorized ||
          (this.opt.selfSigned &&
            (this.conn.authorizationError === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
              this.conn.authorizationError === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
              this.conn.authorizationError === 'SELF_SIGNED_CERT_IN_CHAIN')) ||
          (this.opt.certExpired && this.conn.authorizationError === 'CERT_HAS_EXPIRED')
        ) {
          // authorization successful

          if (!this.opt.encoding) {
            this.conn.setEncoding('utf-8');
          }

          if (this.opt.certExpired && this.conn.authorizationError === 'CERT_HAS_EXPIRED') {
            util.log('Connecting to server with expired certificate');
          }

          this._connectionHandler();
        } else {
          // authorization failed
          util.log(this.conn.authorizationError);
        }
      });
    } else {
      this.conn = net.createConnection(connectionOpts, this._connectionHandler.bind(this));
    }

    this.conn.requestedDisconnect = false;
    this.conn.setTimeout(0);

    // Each connection gets its own CyclingPingTimer.
    // The connection forwards the timer's 'timeout' and 'wantPing' events to the client object via calling the connectionTimedOut() and connectionWantsPing() functions.
    // Since the client's "current connection" value changes over time because of retry functionality,
    // the client should ignore timeout/wantPing events that come from old connections.
    this.conn.cyclingPingTimer = new CyclingPingTimer(this);

    if (!this.opt.encoding) {
      this.conn.setEncoding('utf8');
    }

    let buffer: string | Buffer = Buffer.from('');

    const handleData = (chunk: string | Buffer) => {
      this.conn.cyclingPingTimer.notifyOfActivity();

      if (typeof chunk === 'string') {
        buffer += chunk;
      } else {
        buffer = Buffer.concat([buffer as Buffer, chunk]);
      }

      var lines = this.convertEncoding(buffer).toString().split(lineDelimiter);

      if (lines.pop()) {
        // if buffer doesn't end \r\n, there are more chunks.
        return;
      }

      // else, re-initialize the buffer.
      buffer = Buffer.from('');

      lines.forEach(line => {
        if (line.length) {
          this.out.debug('Received:', line);
          var message = parseMessage(line, this.opt.stripColors);

          try {
            this.emit('raw', message);
          } catch (err) {
            if (!this.conn.requestedDisconnect) {
              this.emit('error', err);
            }
          }
        }
      });
    };

    this.conn.addListener('data', handleData);
    this.conn.addListener('end', () => {
      this.out.debug('Connection got "end" event');
    });
    this.conn.addListener('close', () => {
      this.out.debug('Connection got "close" event');

      // don't reconnect if this is an old connection closing
      if (this.conn !== this) {
        this.out.debug('Non-latest connection is being discarded');
        return;
      }

      // skip if this connection is supposed to close
      if (this.conn?.requestedDisconnect) return;

      this.out.debug('Disconnected: reconnecting');
      this.conn.cyclingPingTimer.stop();
      this.cancelAutoRenick();
      this.conn = null;

      // limit to retryCount reconnections
      if (this.opt.retryCount !== null && retryCount >= this.opt.retryCount) {
        this.out.debug('Maximum retry count (' + this.opt.retryCount + ') reached. Aborting');
        this.emit('abort', this.opt.retryCount);
        return;
      }

      // actually reconnect
      this.out.debug('Waiting ' + this.opt.retryDelay + 'ms before retrying');
      this.retryTimeout = setTimeout(() => {
        this.connect(retryCount + 1);
      }, this.opt.retryDelay);
    });

    this.conn.addListener('error', exception => {
      this.emit('netError', exception);
      this.out.debug('Network error: ' + exception);
    });
  }

  end() {
    if (this.conn) {
      this.conn.cyclingPingTimer.stop();
      this.cancelAutoRenick();
      this.conn.destroy();
    }
  }

  disconnect(message, callback) {
    if (typeof message === 'function') {
      callback = message;
      message = undefined;
    }

    message = message || 'node-irc says goodbye';

    this.out.debug('Disconnecting from IRC server');

    // Skip if already disconnected
    if (!this.conn || this.conn.destroyed) {
      if (this.retryTimeout) {
        clearTimeout(this.retryTimeout);
        this.retryTimeout = null;
        this.out.error(
          'Connection already broken, skipping disconnect (and clearing up automatic retry)',
        );
      } else {
        this.out.error('Connection already broken, skipping disconnect');
      }

      return;
    }

    if (this.conn.requestedDisconnect) {
      this.out.error('Connection already disconnecting, skipping disconnect');
      return;
    }

    // send quit message
    if (this.conn.readyState === 'open') {
      var sendFunction;
      if (this.floodProtectionEnabled) {
        // sendFunction = this._sendImmediate;
        // this._clearCmdQueue();
      } else {
        sendFunction = this.send;
      }

      sendFunction.call(this, 'QUIT', message);
    }

    // flag connection as disconnecting
    this.conn.requestedDisconnect = true;

    // disconnect
    if (typeof callback === 'function') {
      this.conn.once('end', callback);
    }

    this.conn.end();
    this.conn.cyclingPingTimer.stop();
    this.cancelAutoRenick();
  }

  send(...args: any[]) {
    // e.g. NICK, nickname

    // if the last arg contains a space, starts with a colon, or is empty, prepend a colon
    if (
      args[args.length - 1].match(/\s/) ||
      args[args.length - 1].match(/^:/) ||
      args[args.length - 1] === ''
    ) {
      args[args.length - 1] = ':' + args[args.length - 1];
    }

    if (this.conn && !this.conn.requestedDisconnect) {
      this.out.debug('SEND:', args.join(' '));
      this.conn.write(args.join(' ') + '\r\n');
    } else {
      this.out.debug('(Disconnected) SEND:', args.join(' '));
    }
  }

  // activateFloodProtection(interval?: number) {
  //   var safeInterval = interval || this.opt.floodProtectionDelay;
  //     var self = this;

  //   this.floodProtectionEnabled = true;
  //   this.cmdQueue = [];
  //   this._origSend = this.send;

  //   // Wrapper for the original send function. Queue the messages.
  //   this.send = () => {
  //     this.cmdQueue.push(arguments);
  //   };

  //   this._sendImmediate = () => {
  //     this._origSend.apply(self, arguments);
  //   };

  //   this._clearCmdQueue = () => {
  //     this.cmdQueue = [];
  //   };

  //   this.dequeue = () => {
  //     var args = this.cmdQueue.shift();
  //     if (args) {
  //       this._origSend.apply(self, args);
  //     }
  //   };

  //   // Slowly unpack the queue without flooding.
  //   this.floodProtectionInterval = setInterval(this.dequeue, safeInterval);
  //   this.dequeue();
  // }

  // deactivateFloodProtection() {
  //   if (!this.floodProtectionEnabled) return;

  //   clearInterval(this.floodProtectionInterval);
  //   this.floodProtectionInterval = null;

  //   var count = this.cmdQueue.length;
  //   for (var i = 0; i < count; i++) {
  //     this.dequeue();
  //   }

  //   this.send = this._origSend;
  //   this._origSend = null;
  //   this._sendImmediate = null;
  //   this._clearCmdQueue = null;
  //   this.dequeue = null;

  //   this.floodProtectionEnabled = false;
  // }

  cancelAutoRenick() {
    if (!this.conn) return;
    var oldInterval = this.conn.renickInterval;
    clearInterval(this.conn.renickInterval);
    this.conn.renickInterval = null;
    return oldInterval;
  }

  join(channelList: string, callback?) {
    const parts = channelList.split(' ');
    var keys;
    if (parts[1]) {
      keys = parts[1].split(',');
    }

    const channels = parts[0].split(',');
    channels.forEach((channelName, index) => {
      this.once('join' + channelName.toLowerCase(), function () {
        // Append to opts.channel on successful join, so it rejoins on reconnect.
        var chanString = channelName;
        if (keys?.[index]) chanString += ' ' + keys[index];
        var channelIndex = this._findChannelFromStrings(channelName);
        if (channelIndex === -1) {
          this.opt.channels.push(chanString);
        }

        if (typeof callback === 'function') {
          return callback.apply(this, arguments);
        }
      });
    });
    this.send.apply(this, ['JOIN'].concat(channelList.split(' ')));
  }

  part(channelList, message, callback) {
    if (typeof message === 'function') {
      callback = message;
      message = undefined;
    }

    const channels = channelList.split(',');
    channels.forEach((channelName: string) => {
      if (typeof callback === 'function') {
        this.once('part' + channelName.toLowerCase(), callback);
      }

      // remove this channel from this.opt.channels so we won't rejoin upon reconnect
      var channelIndex = this._findChannelFromStrings(channelName);
      if (channelIndex !== -1) {
        this.opt.channels.splice(channelIndex, 1);
      }
    });

    if (message) {
      this.send('PART', channelList, message);
    } else {
      this.send('PART', channelList);
    }
  }

  action(target: string, text?: string) {
    var maxLength =
      Math.min(this.maxLineLength - target.length, this.opt.messageSplit) -
      '\u0001ACTION \u0001'.length;
    if (typeof text !== 'undefined') {
      text
        .toString()
        .split(/\r?\n/)
        .filter(function (line) {
          return line.length > 0;
        })
        .forEach(line => {
          var linesToSend = this._splitLongLines(line, maxLength, []);
          linesToSend.forEach(function (split) {
            var toSend = '\u0001ACTION ' + split + '\u0001';
            this.send('PRIVMSG', target, toSend);
            this.emit('selfMessage', target, toSend);
          });
        });
    }
  }

  // finds the string in opt.channels representing channelName (if present)
  _findChannelFromStrings(channelName) {
    channelName = channelName.toLowerCase();
    var index = this.opt.channels.findIndex(function (listString) {
      var name = listString.split(' ')[0]; // ignore the key in the string
      name = name.toLowerCase(); // check case-insensitively
      return channelName === name;
    });
    return index;
  }

  _splitLongLines(words, maxLength, destination) {
    maxLength = maxLength || 450; // If maxLength hasn't been initialized yet, prefer an arbitrarily low line length over crashing.
    // If no words left, return the accumulated array of splits
    if (words.length === 0) {
      return destination;
    }

    // If the remaining words fit under the byte limit (by utf-8, for Unicode support), push to the accumulator and return
    if (Buffer.byteLength(words, 'utf8') <= maxLength) {
      destination.push(words);
      return destination;
    }

    // else, attempt to write maxLength bytes of message, truncate accordingly
    var truncatingBuffer = Buffer.alloc(maxLength + 1);
    var writtenLength = truncatingBuffer.write(words, 'utf8');
    var truncatedStr = truncatingBuffer.toString('utf8', 0, writtenLength);
    // and then check for a word boundary to try to keep words together
    var len = truncatedStr.length - 1;
    var c = truncatedStr[len];
    var cutPos;
    var wsLength = 1;
    if (c.match(/\s/)) {
      cutPos = len;
    } else {
      var offset = 1;
      while (len - offset > 0) {
        c = truncatedStr[len - offset];
        if (c.match(/\s/)) {
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
    var part = truncatedStr.substring(0, cutPos);
    destination.push(part);
    return this._splitLongLines(
      words.substring(cutPos + wsLength, words.length),
      maxLength,
      destination,
    );
  }

  say(target, text) {
    this._speak('PRIVMSG', target, text);
  }

  notice(target, text) {
    this._speak('NOTICE', target, text);
  }

  emitChannelEvent(eventName: string, channel: string, ...args) {
    // this.emit.apply(this, [eventName, channel, ...args]);
    // this.emit.apply(this, [eventName + channel, ...args]);
    // if (channel !== channel.toLowerCase()) {
    //   this.emit.apply(this, [eventName + channel.toLowerCase(), ...args]);
    // }
  }

  _speak(kind, target, text) {
    var maxLength = Math.min(this.maxLineLength - target.length, this.opt.messageSplit);
    if (typeof text !== 'undefined') {
      text
        .toString()
        .split(/\r?\n/)
        .filter(function (line) {
          return line.length > 0;
        })
        .forEach(function (line) {
          var linesToSend = this._splitLongLines(line, maxLength, []);
          linesToSend.forEach(function (toSend) {
            this.send(kind, target, toSend);
            if (kind === 'PRIVMSG') {
              this.emit('selfMessage', target, toSend);
            }
          });
        });
    }
  }

  whois(nick, callback) {
    if (typeof callback === 'function') {
      var callbackWrapper = info => {
        if (info.nick.toLowerCase() === nick.toLowerCase()) {
          this.removeListener('whois', callbackWrapper);
          return callback.apply(this, arguments);
        }
      };

      this.addListener('whois', callbackWrapper);
    }

    this.send('WHOIS', nick);
  }

  list(...args) {
    args.unshift('LIST');
    this.send.apply(this, args);
  }

  _addWhoisData(nick: string, key: string, value: any, onlyIfExists?: boolean) {
    if (onlyIfExists && !this._whoisData[nick]) {
      return;
    }

    this._whoisData[nick] = this._whoisData[nick] || { nick: nick };
    this._whoisData[nick][key] = value;
  }

  _clearWhoisData(nick: string) {
    // Ensure that at least the nick exists before trying to return
    this._addWhoisData(nick, 'nick', nick);
    var data = this._whoisData[nick];
    delete this._whoisData[nick];
    return data;
  }

  _handleCTCP(from, to, text: string, type, message) {
    text = text.slice(1);
    text = text.slice(0, text.indexOf('\u0001'));
    var parts = text.split(' ');
    this.emit('ctcp', from, to, text, type, message);
    this.emit('ctcp-' + type, from, to, text, message);
    if (type === 'privmsg' && text === 'VERSION') this.emit('ctcp-version', from, to, message);
    if (parts[0] === 'ACTION' && parts.length > 1)
      this.emit('action', from, to, parts.slice(1).join(' '), message);
    if (parts[0] === 'PING' && type === 'privmsg' && parts.length > 1)
      this.ctcp(from, 'notice', text);
  }

  ctcp(to: string, type: 'privmsg' | string, text: string) {
    return this[type === 'privmsg' ? 'say' : 'notice'](to, '\u0001' + text + '\u0001');
  }

  convertEncoding(str) {
    var out = str;

    if (this.opt.encoding) {
      out = convertEncodingHelper(str, this.opt.encoding, (err, charset) => {
        if (this.out) {
          this.out.error(err, { str: str, charset: charset });
        }
      });
    }

    return out;
  }

  // blatantly stolen from irssi's splitlong.pl. Thanks, Bjoern Krombholz!
  _updateMaxLineLength() {
    // 497 = 510 - (":" + "!" + " PRIVMSG " + " :").length;
    // target is determined in _speak() and subtracted there
    this.maxLineLength = 497 - this.nick.length - this.hostMask.length;
  }
}

function canConvertEncoding() {
  // hardcoded "schön" in ISO-8859-1 and UTF-8
  var sampleText = Buffer.from([0x73, 0x63, 0x68, 0xf6, 0x6e]);
  var expectedText = Buffer.from([0x73, 0x63, 0x68, 0xc3, 0xb6, 0x6e]);
  var error;
  var text = convertEncodingHelper(sampleText, 'utf-8', e => {
    error = e;
  });
  if (error || text.toString() !== expectedText.toString()) {
    return false;
  }

  return true;
}

function convertEncodingHelper(
  str: string | Buffer,
  encoding,
  errorHandler: (e: Error, charset?: string) => void,
) {
  let out = str;
  let charset;
  try {
    charset = charsetDetector.detect(str as any);
    var decoded = iconv.decode(str as Buffer, charset);
    out = Buffer.from(iconv.encode(decoded, encoding));
  } catch (err) {
    if (!errorHandler) throw err;
    errorHandler(err, charset);
  }

  return out;
}

// wtf
// (function(conn) {
//   conn.cyclingPingTimer.on('pingTimeout', function() {
//       this.connectionTimedOut(conn);
//   });
//   conn.cyclingPingTimer.on('wantPing', function() {
//       this.connectionWantsPing(conn);
//   });
// }(this.conn));

// (function() {
//   var pingCounter = 1;
//   connectionWantsPing(conn) {
//       var self = this;
//       if (conn !== this.conn) {
//           // Only care about a wantPing event if it came from the current connection
//           return;
//       }
//       this.send('PING', (pingCounter++).toString());
//   };
// }());
