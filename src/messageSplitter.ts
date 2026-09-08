export function splitOutgoingMessage(text: string, maxBytes: number): string[] {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error('IRC message split length must be greater than 0 bytes');
  }

  const messages: string[] = [];
  for (const line of text.toString().split(/\r?\n/)) {
    if (line.length > 0) {
      splitLongLine(line, maxBytes, messages);
    }
  }
  return messages;
}

function splitLongLine(line: string, maxBytes: number, messages: string[]): void {
  let start = 0;
  let bytes = 0;
  let lastWhitespace = -1;
  let bytesThroughWhitespace = 0;

  for (let i = 0; i < line.length; ) {
    const code = line.codePointAt(i)!;
    const charBytes = code < 128 ? 1 : code < 2048 ? 2 : code < 65_536 ? 3 : 4;
    if (charBytes > maxBytes) {
      throw new Error('IRC message split length cannot fit the next UTF-8 character');
    }

    if (bytes + charBytes > maxBytes) {
      if (lastWhitespace > start) {
        messages.push(line.slice(start, lastWhitespace));
        start = lastWhitespace + 1;
        // The suffix was already measured; carry its byte count without scanning it again.
        bytes -= bytesThroughWhitespace;
      } else {
        messages.push(line.slice(start, i));
        start = i;
        bytes = 0;
      }
      lastWhitespace = -1;

      // A multibyte character may not fit even after dropping the preceding word.
      if (bytes + charBytes > maxBytes) {
        messages.push(line.slice(start, i));
        start = i;
        bytes = 0;
      }
    }

    bytes += charBytes;
    if (i > start && /\s/.test(line[i])) {
      lastWhitespace = i;
      bytesThroughWhitespace = bytes;
    }
    i += code > 65_535 ? 2 : 1;
  }

  messages.push(line.slice(start));
}
