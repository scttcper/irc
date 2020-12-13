import { describe, it, expect, jest } from '@jest/globals';

import { setupMockClient } from './helpers';

const messages = `:origin.irc.xx-net.org NOTICE * :*** Looking up your hostname...
:origin.irc.xx-net.org NOTICE * :*** Found your hostname (cached)
PING :EAA41EAE
|chunk|:origin.irc.xx-net.org 001 testbot :Welcome to the xx-Net IRC Network testbot!nodebot@nothing.sanic.net
:origin.irc.xx-net.org 002 testbot :Your host is origin.irc.xx-net.org, running version UnrealIRCd-5.0.4
:origin.irc.xx-net.org 003 testbot :This server was created Fri Apr 24 2020 at 13:04:49 UTC
:origin.irc.xx-net.org 004 testbot origin.irc.xx-net.org UnrealIRCd-5.0.4 iowrsxzdHtIDZRqpWGTSB lvhopsmntikraqbeIHzMQNRTOV|chunk|KDdGLPZSCcf
:origin.irc.xx-net.org 005 testbot AWAYLEN=307 CASEMAPPING=ascii CHANLIMIT=#:30 CHANMODES=beI,kLf,lH,psmntirzMQNRTOVKDdGPZSCc CHANNELLEN=32 CHANTYPES=# DEAF=d ELIST=MNUCT EXCEPTS EXTBAN=~,ptmTSOcarnqjf HCN INVEX :are supported by this server
:origin.irc.xx-net.org 005 testbot KICKLEN=307 KNOCK MAP MAXCHANNELS=30 MAXLIST=b:60,e:60,I:60 MAXNICKLEN=30 MINNICKLEN=0 MODES=12 NAMESX NETWORK=xx-Net NICKLEN=30 PREFIX=(qaohv)~&@%+ :are supported by this server
:origin.irc.co|chunk|rrupt-net.org 005 testbot QUITLEN=307 SAFELIST SILENCE=15 STATUSMSG=~&@%+ TARGMAX=DCCALLOW:,ISON:,JOIN:,KICK:4,KILL:,LIST:,NAMES:1,NOTICE:1,PART:,PRIVMSG:4,SAJOIN:,SAPART:,USERHOST:,USERIP:,WATCH:,WHOIS:1,WHOWAS:1 TOPICLEN=360 UHNAMES USERIP WALLCHOPS WATCH=128 WATCHOPTS=A WHOX :are supported by this server
:origin.irc.xx-net.org 396 testbot xx-xx.nothing.sanic.net :is now your displayed host
:origin.irc.xx-net.org NOTICE testbot :*** You are connected to origi|chunk|n.irc.xx-net.org with TLSv1.3-TLS_CHACHA20_POLY1305_SHA256
:origin.irc.xx-net.org 251 testbot :There are 1 users and 530 invisible on 6 servers
:origin.irc.xx-net.org 252 testbot 40 :operator(s) online
:origin.irc.xx-net.org 253 testbot 1 :unknown connection(s)
:origin.irc.xx-net.org 254 testbot 87 :channels formed
:origin.irc.xx-net.org 255 testbot :I have 170 clients and 1 servers
:origin.irc.xx-net.org 265 testbot 170 411 :Curre|chunk|nt local users 170, max 411
:origin.irc.xx-net.org 266 testbot 531 756 :Current global users 531, max 756
:origin.irc.xx-net.org 422 testbot :MOTD File is missing
:testbot MODE testbot :+iwxz
|chunk|:NickServ!nickserv@nickserv.services.irc.xx-net.org NOTICE testbot :This nickname is registered and protected.  If it is your
:NickServ!nickserv@nickserv.services.irc.xx-net.org NOTICE testbot :nick, type /msg NickServ IDENTIFY password.  Otherwise,
:NickServ!nickserv@nickserv.services.irc.xx-net.org NOTICE testbot :please choose a different nick.
:NickServ!nickserv@nickserv.services.irc.xx-net.org NOTICE testbot :If you do not change within 1 minute, I wil|chunk|l change your nick.
|chunk|`;

describe('handle data', () => {
  it('should handle initial connection', () => {
    const client = setupMockClient('testbot');
    const emitSpy = jest.spyOn(client, 'emit');
    for (const chunk of messages.split('|chunk|')) {
      client.handleData(chunk);
    }

    expect(emitSpy.mock.calls).toMatchSnapshot();
  });
});
