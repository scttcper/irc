import { expect, it } from 'vitest';

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

it('should hanlde adding +nt', () => {
  const client = setup();
  client.handleData(':localhost MODE #channel +nt\r\n');
  expect(client.chans['#channel']).toEqual({
    key: '#channel',
    serverName: '#channel',
    users: expect.objectContaining({ testbot: '@' }),
    modeParams: { n: [], t: [] },
    mode: 'nt',
  });
});

it('should handle adding additional modes', () => {
  const client = setup();
  client.handleData(':localhost MODE #channel +nt\r\n');
  client.handleData(':localhost MODE #channel +b whatever@an.ip\r\n');
  expect(client.chans['#channel']).toEqual({
    key: '#channel',
    serverName: '#channel',
    users: expect.anything(),
    modeParams: { b: ['whatever@an.ip'], n: [], t: [] },
    mode: 'ntb',
  });
});

it('should handle subtracting modes', () => {
  const client = setup();
  client.handleData(':localhost MODE #channel +ntb\r\n');
  client.handleData(':localhost MODE #channel -b\r\n');
  expect(client.chans['#channel']).toEqual({
    key: '#channel',
    serverName: '#channel',
    users: expect.anything(),
    modeParams: { n: [], t: [] },
    mode: 'nt',
  });
});

it('should handle adding modes to a user', () => {
  const client = setup();
  client.handleData(':localhost MODE #channel +b *!*@AN.IP.1\r\n');
  expect(client.chans['#channel']).toEqual({
    key: '#channel',
    serverName: '#channel',
    users: expect.anything(),
    modeParams: { b: ['*!*@AN.IP.1'] },
    mode: 'b',
  });
});

it('should handle adding modes to two users', () => {
  const client = setup();
  client.handleData(':localhost MODE #channel +bb *!*@AN.IP.2 *!*@AN.IP.3\r\n');
  expect(client.chans['#channel']).toEqual({
    key: '#channel',
    serverName: '#channel',
    users: expect.anything(),
    modeParams: { b: ['*!*@AN.IP.2', '*!*@AN.IP.3'] },
    mode: 'b',
  });
});

it('should handle subtracting modes from user', () => {
  const client = setup();
  client.handleData(':localhost MODE #channel +b *!*@AN.IP.2\r\n');
  client.handleData(':localhost MODE #channel -b *!*@AN.IP.2\r\n');
  expect(client.chans['#channel']).toEqual({
    key: '#channel',
    serverName: '#channel',
    users: expect.anything(),
    modeParams: {},
    mode: '',
  });
});

it('should handle adding and subtracting modes from user', () => {
  const client = setup();
  client.handleData(':localhost MODE #channel +f [10j]:15\r\n');
  expect(client.chans['#channel']).toEqual({
    key: '#channel',
    serverName: '#channel',
    users: expect.anything(),
    modeParams: { f: ['[10j]:15'] },
    mode: 'f',
  });
  client.handleData(':localhost MODE #channel -f+j [10j]:15 3:5\r\n');
  expect(client.chans['#channel']).toEqual({
    key: '#channel',
    serverName: '#channel',
    users: expect.anything(),
    modeParams: { j: ['3:5'] },
    mode: 'j',
  });
});

it('should apply MODES and channel mode arguments from ISUPPORT and RPL_CHANNELMODEIS', () => {
  const client = setupMockClient('testbot');
  client.chans['#chan'] = {
    key: '#chan',
    mode: '',
    modeParams: {},
    serverName: '#chan',
    users: {},
  };

  client.handleData(':server 005 testbot MODES=12 :are supported by this server\r\n');
  client.handleData(':server 324 testbot #chan +kl secret 10\r\n');

  expect(client.supported.modes).toBe(12);
  expect(client.chans['#chan']).toEqual(
    expect.objectContaining({
      mode: '+kl',
      modeParams: {
        k: ['secret'],
        l: ['10'],
      },
    }),
  );
});

it('should only consume RPL_CHANNELMODEIS arguments for parameterized modes', () => {
  const client = setupMockClient('testbot');
  client.chans['#chan'] = {
    key: '#chan',
    mode: '',
    modeParams: {},
    serverName: '#chan',
    users: {},
  };

  client.handleData(':server 005 testbot CHANMODES=b,k,l,mn :are supported by this server\r\n');
  client.handleData(':server 324 testbot #chan +mnl 50\r\n');

  expect(client.chans['#chan']).toEqual(
    expect.objectContaining({
      mode: '+mnl',
      modeParams: {
        l: ['50'],
      },
    }),
  );
});
