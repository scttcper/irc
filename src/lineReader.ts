import { convertEncodingHelper, lineDelimiter, utf8Decoder, utf8Encoder } from './ircEncoding.js';
import { concatUint8Arrays } from './uint8array.js';

function isLineTerminated(bytes: Uint8Array): boolean {
  const lastByte = bytes[bytes.length - 1];
  return lastByte === 10 || lastByte === 13;
}

export class LineReader {
  private readonly encoding: string | null;
  private pendingBytes?: Uint8Array;
  private pendingText?: string;

  constructor(encoding: string | null) {
    this.encoding = encoding;
  }

  read(chunk: string | Uint8Array): string[] {
    let lines: string[];
    if (typeof chunk === 'string' && !this.pendingBytes?.length) {
      lines = this.readTextLines(chunk);
    } else {
      const chunkBytes = typeof chunk === 'string' ? utf8Encoder.encode(chunk) : chunk;
      if (this.pendingText) {
        const pendingText = utf8Encoder.encode(this.pendingText);
        this.pendingText = undefined;
        lines = this.readByteLines(concatUint8Arrays(pendingText, chunkBytes));
      } else {
        lines = this.readByteLines(chunkBytes);
      }
    }

    return lines.filter(line => line.length > 0);
  }

  private convertEncoding(bytes: Uint8Array): string {
    if (this.encoding) {
      return convertEncodingHelper(bytes, this.encoding);
    }

    return utf8Decoder.decode(bytes);
  }

  private readTextLines(chunk: string): string[] {
    const text = `${this.pendingText ?? ''}${chunk}`;
    const lines = text.split(lineDelimiter);
    const pendingText = lines.pop() ?? '';
    this.pendingText = pendingText || undefined;
    return lines;
  }

  private readByteLines(chunk: Uint8Array): string[] {
    if (!this.pendingBytes?.length && isLineTerminated(chunk)) {
      this.pendingBytes = undefined;
      return this.convertEncoding(chunk).split(lineDelimiter);
    }

    const bytes = this.pendingBytes?.length ? concatUint8Arrays(this.pendingBytes, chunk) : chunk;
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
      this.pendingBytes = bytes.slice(lineStart);
    } else {
      this.pendingBytes = undefined;
    }

    return lines;
  }
}
