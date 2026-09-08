import { convertEncodingHelper, utf8Decoder, utf8Encoder } from './ircEncoding.js';

// IRCv3 allows 8191 bytes of tags in addition to the 512-byte message (including CRLF).
// https://ircv3.net/specs/extensions/message-tags.html#size-limit
const maxTagBytes = 8191;
const maxBodyBytes = 510;

export class LineReader {
  private readonly encoding: string | null;
  private readonly buffer = new Uint8Array(maxTagBytes + maxBodyBytes);
  private bufferedBytes = 0;
  private textParts: string[] = [];
  private lineBytes = 0;
  private tagBytes = 0;
  private readingTags = false;
  private discarding = false;
  private trailingHighSurrogate = false;

  constructor(encoding: string | null) {
    this.encoding = encoding;
  }

  read(chunk: string | Uint8Array): string[] {
    if (typeof chunk === 'string' && this.bufferedBytes === 0) {
      return this.readTextLines(chunk);
    }

    if (this.textParts.length > 0) {
      const pending = utf8Encoder.encode(this.textParts.join(''));
      this.buffer.set(pending);
      this.bufferedBytes = pending.length;
      this.textParts = [];
    }
    this.trailingHighSurrogate = false;
    return this.readByteLines(typeof chunk === 'string' ? utf8Encoder.encode(chunk) : chunk);
  }

  private reset(): void {
    this.bufferedBytes = 0;
    this.textParts = [];
    this.lineBytes = 0;
    this.tagBytes = 0;
    this.readingTags = false;
    this.discarding = false;
    this.trailingHighSurrogate = false;
  }

  private accept(code: number, bytes: number): boolean {
    if (this.discarding) {
      return false;
    }
    if (this.lineBytes === 0) {
      this.readingTags = code === 64;
    }
    this.lineBytes += bytes;
    if (this.readingTags && code === 32) {
      this.tagBytes = this.lineBytes;
      this.readingTags = false;
    }
    if (
      (this.readingTags && this.lineBytes > maxTagBytes) ||
      this.tagBytes > maxTagBytes ||
      (!this.readingTags && this.lineBytes - this.tagBytes > maxBodyBytes)
    ) {
      // Discard through the next delimiter, without retaining or parsing a truncated command.
      this.discarding = true;
      this.bufferedBytes = 0;
      this.textParts = [];
      return false;
    }
    return true;
  }

  private readTextLines(chunk: string): string[] {
    const lines: string[] = [];
    let start = 0;
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.codePointAt(i)!;
      if (code === 10 || code === 13) {
        if (!this.discarding && this.lineBytes > 0) {
          this.textParts.push(chunk.slice(start, i));
          lines.push(this.textParts.join(''));
        }
        this.reset();
        start = i + 1;
        continue;
      }
      const bytes = code < 128 ? 1 : code < 2048 ? 2 : code < 65_536 ? 3 : 4;
      const continuesSurrogate = this.trailingHighSurrogate && code >= 56_320 && code <= 57_343;
      this.accept(code, continuesSurrogate ? 1 : bytes);
      this.trailingHighSurrogate = code >= 55_296 && code <= 56_319;
      if (code > 65_535) {
        i++;
      }
    }
    if (!this.discarding && start < chunk.length) {
      this.textParts.push(chunk.slice(start));
    }
    return lines;
  }

  private readByteLines(chunk: Uint8Array): string[] {
    const lines: string[] = [];
    for (const byte of chunk) {
      if (byte === 10 || byte === 13) {
        if (!this.discarding && this.bufferedBytes > 0) {
          const line = this.buffer.subarray(0, this.bufferedBytes);
          lines.push(
            this.encoding ? convertEncodingHelper(line, this.encoding) : utf8Decoder.decode(line),
          );
        }
        this.reset();
      } else if (this.accept(byte, 1)) {
        this.buffer[this.bufferedBytes++] = byte;
      }
    }
    return lines;
  }
}
