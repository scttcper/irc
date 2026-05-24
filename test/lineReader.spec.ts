import { expect, it } from 'vitest';

import { LineReader } from '../src/lineReader.js';

it('returns complete lines before a partial trailing line is finished', () => {
  const reader = new LineReader(null);

  expect(reader.read('PING :one\r\nPING :tw')).toEqual(['PING :one']);
  expect(reader.read('o\r\n')).toEqual(['PING :two']);
});

it('processes complete lines before a later partial line completes', () => {
  const reader = new LineReader(null);

  expect(reader.read('PING :a\r\n:server NOTICE')).toEqual(['PING :a']);
  expect(reader.read(' testbot :hello\r\n')).toEqual([':server NOTICE testbot :hello']);
});

it('preserves utf-8 byte sequences split across chunks', () => {
  const reader = new LineReader(null);
  const bytes = new TextEncoder().encode(
    ':견본!~examplename@example.host PRIVMSG #channel :test message\r\n',
  );
  const lines: string[] = [];

  for (let i = 0; i < bytes.length; i++) {
    lines.push(...reader.read(bytes.subarray(i, i + 1)));
  }

  expect(lines).toEqual([
    ':견본!~examplename@example.host PRIVMSG #channel :test message',
  ]);
});

it('decodes byte chunks with an explicit non-utf8 encoding', () => {
  const reader = new LineReader('latin1');
  const bytes = Uint8Array.from([
    ...':server NOTICE testbot :caf'.split('').map(char => char.charCodeAt(0)),
    0xe9,
    0x0d,
    0x0a,
  ]);

  expect(reader.read(bytes)).toEqual([':server NOTICE testbot :café']);
});
