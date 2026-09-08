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

it('skips blank lines', () => {
  const reader = new LineReader(null);

  expect(reader.read('\r\nPING :one\r\n\n')).toEqual(['PING :one']);
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

  expect(lines).toEqual([':견본!~examplename@example.host PRIVMSG #channel :test message']);
});

it('decodes byte chunks with an explicit non-utf8 encoding', () => {
  const reader = new LineReader('latin1');
  const bytes = Uint8Array.from([
    ...[...':server NOTICE testbot :caf'].map(char => char.charCodeAt(0)),
    233,
    13,
    10,
  ]);

  expect(reader.read(bytes)).toEqual([':server NOTICE testbot :café']);
});

it.each(['text', 'bytes'])(
  'bounds fragmented %s lines and recovers after their delimiter',
  kind => {
    const reader = new LineReader(null);
    const input = (text: string) => (kind === 'bytes' ? new TextEncoder().encode(text) : text);
    for (let i = 0; i < 2048; i++) {
      expect(reader.read(input('x'.repeat(1024)))).toEqual([]);
    }
    expect(reader.read(input('\r\nPING :ok\r\n'))).toEqual(['PING :ok']);
  },
);

it.each(['text', 'bytes'])('enforces separate tag and body byte limits for %s', kind => {
  const reader = new LineReader(null);
  const input = (text: string) => (kind === 'bytes' ? new TextEncoder().encode(text) : text);
  const tags = `@a=${'x'.repeat(8187)} `;
  const body = 'x'.repeat(510);
  expect(reader.read(input(`${tags + body}\r\n`))).toEqual([tags + body]);
  expect(reader.read(input(`${tags + body}x\r\n`))).toEqual([]);
  expect(reader.read(input(`@${'x'.repeat(8190)} PING :no\r\n`))).toEqual([]);
  expect(reader.read(input(`${'é'.repeat(255)}\r\n`))).toEqual(['é'.repeat(255)]);
  expect(reader.read(input(`${'é'.repeat(256)}\r\nPING :ok\r\n`))).toEqual(['PING :ok']);
});

it('preserves text split between surrogate halves at the byte limit', () => {
  const reader = new LineReader(null);
  expect(reader.read(`${'x'.repeat(506)}\uD83D`)).toEqual([]);
  expect(reader.read('\uDE00\r\n')).toEqual([`${'x'.repeat(506)}😀`]);
});

it('preserves partial lines when alternating strings and bytes', () => {
  const reader = new LineReader(null);
  expect(reader.read('PING :')).toEqual([]);
  expect(reader.read(new TextEncoder().encode('hello'))).toEqual([]);
  expect(reader.read(' world\r\n')).toEqual(['PING :hello world']);
});
