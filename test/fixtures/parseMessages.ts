export const strict: [string, any][] = [
  [
    ':irc.dollyfish.net.nz 372 nodebot :The message of the day was last changed: 2012-6-16 23:57',
    {
      prefix: 'irc.dollyfish.net.nz',
      server: 'irc.dollyfish.net.nz',
      command: 'rpl_motd',
      rawCommand: '372',
      commandType: 'reply',
      args: ['nodebot', 'The message of the day was last changed: 2012-6-16 23:57'],
    },
  ],
  [
    ':Ned!~martyn@irc.dollyfish.net.nz PRIVMSG #test :Hello nodebot!',
    {
      prefix: 'Ned!~martyn@irc.dollyfish.net.nz',
      nick: 'Ned',
      user: '~martyn',
      host: 'irc.dollyfish.net.nz',
      command: 'PRIVMSG',
      rawCommand: 'PRIVMSG',
      commandType: 'normal',
      args: ['#test', 'Hello nodebot!'],
    },
  ],
  [
    ':Ned!~martyn@irc.dollyfish.net.nz PRIVMSG #test ::-)',
    {
      prefix: 'Ned!~martyn@irc.dollyfish.net.nz',
      nick: 'Ned',
      user: '~martyn',
      host: 'irc.dollyfish.net.nz',
      command: 'PRIVMSG',
      rawCommand: 'PRIVMSG',
      commandType: 'normal',
      args: ['#test', ':-)'],
    },
  ],
  [
    ':Ned!~martyn@irc.dollyfish.net.nz PRIVMSG #test ::',
    {
      prefix: 'Ned!~martyn@irc.dollyfish.net.nz',
      nick: 'Ned',
      user: '~martyn',
      host: 'irc.dollyfish.net.nz',
      command: 'PRIVMSG',
      rawCommand: 'PRIVMSG',
      commandType: 'normal',
      args: ['#test', ':'],
    },
  ],
  [
    ':Ned!~martyn@irc.dollyfish.net.nz PRIVMSG #test ::^:^:',
    {
      prefix: 'Ned!~martyn@irc.dollyfish.net.nz',
      nick: 'Ned',
      user: '~martyn',
      host: 'irc.dollyfish.net.nz',
      command: 'PRIVMSG',
      rawCommand: 'PRIVMSG',
      commandType: 'normal',
      args: ['#test', ':^:^:'],
    },
  ],
  [
    ':some.irc.net 324 webuser #channel +Cnj 5:10',
    {
      prefix: 'some.irc.net',
      server: 'some.irc.net',
      command: 'rpl_channelmodeis',
      rawCommand: '324',
      commandType: 'reply',
      args: ['webuser', '#channel', '+Cnj', '5:10'],
    },
  ],
  [
    ':nick!user@host QUIT :Ping timeout: 252 seconds',
    {
      prefix: 'nick!user@host',
      nick: 'nick',
      user: 'user',
      host: 'host',
      command: 'QUIT',
      rawCommand: 'QUIT',
      commandType: 'normal',
      args: ['Ping timeout: 252 seconds'],
    },
  ],
  [
    ':nick!user@host PRIVMSG #channel :so : colons: :are :: not a problem ::::',
    {
      prefix: 'nick!user@host',
      nick: 'nick',
      user: 'user',
      host: 'host',
      command: 'PRIVMSG',
      rawCommand: 'PRIVMSG',
      commandType: 'normal',
      args: ['#channel', 'so : colons: :are :: not a problem ::::'],
    },
  ],
  [
    ':nick!user@host PRIVMSG #channel :\u000314,01\u001fneither are colors or styles\u001f\u0003',
    {
      prefix: 'nick!user@host',
      nick: 'nick',
      user: 'user',
      host: 'host',
      command: 'PRIVMSG',
      rawCommand: 'PRIVMSG',
      commandType: 'normal',
      args: ['#channel', 'neither are colors or styles'],
      stripColors: true,
    },
  ],
  [
    ':nick!user@host PRIVMSG #channel :\u000314,01\u001fwe can leave styles and colors alone if desired\u001f\u0003',
    {
      prefix: 'nick!user@host',
      nick: 'nick',
      user: 'user',
      host: 'host',
      command: 'PRIVMSG',
      rawCommand: 'PRIVMSG',
      commandType: 'normal',
      args: [
        '#channel',
        '\u000314,01\u001fwe can leave styles and colors alone if desired\u001f\u0003',
      ],
      stripColors: false,
    },
  ],
  [
    ':pratchett.freenode.net 324 nodebot #ubuntu +CLcntjf 5:10 #ubuntu-unregged',
    {
      prefix: 'pratchett.freenode.net',
      server: 'pratchett.freenode.net',
      command: 'rpl_channelmodeis',
      rawCommand: '324',
      commandType: 'reply',
      args: ['nodebot', '#ubuntu', '+CLcntjf', '5:10', '#ubuntu-unregged'],
    },
  ],
  [
    ':127.0.0.1 477 nodebot #channel :Cannot join channel (+r) - you need to be identified with services',
    {
      prefix: '127.0.0.1',
      server: '127.0.0.1',
      command: '477',
      rawCommand: '477',
      commandType: 'error',
      args: [
        'nodebot',
        '#channel',
        'Cannot join channel (+r) - you need to be identified with services',
      ],
    },
  ],
];

export const nonStrict: [string, any][] = [
  [
    ':견본!~examplename@example.host PRIVMSG #channel :test message',
    {
      prefix: '견본!~examplename@example.host',
      nick: '견본',
      user: '~examplename',
      host: 'example.host',
      command: 'PRIVMSG',
      rawCommand: 'PRIVMSG',
      commandType: 'normal',
      args: ['#channel', 'test message'],
    },
  ],
  [
    ':x/y!~examplename@example.host PRIVMSG #channel :test message',
    {
      prefix: 'x/y!~examplename@example.host',
      nick: 'x/y',
      user: '~examplename',
      host: 'example.host',
      command: 'PRIVMSG',
      rawCommand: 'PRIVMSG',
      commandType: 'normal',
      args: ['#channel', 'test message'],
    },
  ],
  [
    ':?nick!~examplename@example.host PRIVMSG #channel :test message',
    {
      prefix: '?nick!~examplename@example.host',
      nick: '?nick',
      user: '~examplename',
      host: 'example.host',
      command: 'PRIVMSG',
      rawCommand: 'PRIVMSG',
      commandType: 'normal',
      args: ['#channel', 'test message'],
    },
  ],
];

export const noprefix: [string, any][] = [
  [
    '477 nodebot #channel :Cannot join channel (+r) - you need to be identified with services',
    {
      command: '477',
      rawCommand: '477',
      commandType: 'error',
      args: [
        'nodebot',
        '#channel',
        'Cannot join channel (+r) - you need to be identified with services',
      ],
    },
  ],
];
