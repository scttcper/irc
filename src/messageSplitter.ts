import { truncateUtf8, utf8ByteLength } from './ircEncoding.js';

export function splitOutgoingMessage(text: string, maxBytes: number): string[] {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error('IRC message split length must be greater than 0 bytes');
  }

  const messages: string[] = [];
  for (const line of text.toString().split(/\r?\n/)) {
    if (line.length === 0) {
      continue;
    }

    messages.push(...splitLongLine(line, maxBytes));
  }

  return messages;
}

function splitLongLine(line: string, maxBytes: number): string[] {
  const messages: string[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    if (utf8ByteLength(remaining) <= maxBytes) {
      messages.push(remaining);
      break;
    }

    const truncated = truncateUtf8(remaining, maxBytes);
    if (truncated.length === 0) {
      throw new Error('IRC message split length cannot fit the next UTF-8 character');
    }
    const splitAt = findSplitPosition(truncated);
    messages.push(truncated.slice(0, splitAt.end));
    remaining = remaining.slice(splitAt.nextStart);
  }

  return messages;
}

function findSplitPosition(value: string): { end: number; nextStart: number } {
  for (let i = value.length - 1; i > 0; i--) {
    if (/\s/.test(value[i])) {
      return { end: i, nextStart: i + 1 };
    }
  }

  return { end: value.length, nextStart: value.length };
}
