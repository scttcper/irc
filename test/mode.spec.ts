import test from 'ava';

import { setupMockClient } from './helpers.js';

const setup = () => {
  const client = setupMockClient('testbot');
  client.chans['#channel'] = {
    key: '#channel',
    mode: '',
    modeParams: {},
    serverName: '#channel',
    users: { testbot: '@', x1: '' },
  };
  client.handleData(
    ':localhost 005 testbot MODES=12 CHANTYPES=# PREFIX=(ohv)@%+ CHANMODES=beIqa,kfL,lj,psmntirRcOAQKVCuzNSMTGHFEB\r\n',
  );
  return client;
};

test('should hanlde adding +nt', t => {
  const client = setup();
  client.handleData(':localhost MODE #channel +nt\r\n');
  t.like(client.chans['#channel'], {
    key: '#channel',
    serverName: '#channel',
    users: { testbot: '@' },
    modeParams: { n: [], t: [] },
    mode: 'nt',
  });
});

test('should handle adding additional modes', t => {
  const client = setup();
  client.handleData(':localhost MODE #channel +nt\r\n');
  client.handleData(':localhost MODE #channel +b whatever@an.ip\r\n');
  t.like(client.chans['#channel'], {
    key: '#channel',
    serverName: '#channel',
    modeParams: { b: ['whatever@an.ip'], n: [], t: [] },
    mode: 'ntb',
  });
});

test('should handle subtracting modes', t => {
  const client = setup();
  client.handleData(':localhost MODE #channel +ntb\r\n');
  client.handleData(':localhost MODE #channel -b\r\n');
  t.like(client.chans['#channel'], {
    key: '#channel',
    serverName: '#channel',
    modeParams: { n: [], t: [] },
    mode: 'nt',
  });
});

test('should handle adding modes to a user', t => {
  const client = setup();
  client.handleData(':localhost MODE #channel +b *!*@AN.IP.1\r\n');
  t.like(client.chans['#channel'], {
    key: '#channel',
    serverName: '#channel',
    modeParams: { b: ['*!*@AN.IP.1'] },
    mode: 'b',
  });
});

test('should handle adding modes to two users', t => {
  const client = setup();
  client.handleData(':localhost MODE #channel +bb *!*@AN.IP.2 *!*@AN.IP.3\r\n');
  t.like(client.chans['#channel'], {
    key: '#channel',
    serverName: '#channel',
    modeParams: { b: ['*!*@AN.IP.2', '*!*@AN.IP.3'] },
    mode: 'b',
  });
});

test('should handle subtracting modes from user', t => {
  const client = setup();
  client.handleData(':localhost MODE #channel +b *!*@AN.IP.2\r\n');
  client.handleData(':localhost MODE #channel -b *!*@AN.IP.2\r\n');
  t.like(client.chans['#channel'], {
    key: '#channel',
    serverName: '#channel',
    modeParams: {},
    mode: '',
  });
});

test('should handle adding and subtracting modes from user', t => {
  const client = setup();
  client.handleData(':localhost MODE #channel +f [10j]:15\r\n');
  t.like(client.chans['#channel'], {
    key: '#channel',
    serverName: '#channel',
    modeParams: { f: ['[10j]:15'] },
    mode: 'f',
  });
  client.handleData(':localhost MODE #channel -f+j [10j]:15 3:5\r\n');
  t.like(client.chans['#channel'], {
    key: '#channel',
    serverName: '#channel',
    modeParams: { j: ['3:5'] },
    mode: 'j',
  });
});
