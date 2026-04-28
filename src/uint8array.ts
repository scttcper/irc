import { utf8Encoder } from './ircEncoding.js';

/**
 * Concatenate two byte arrays.
 *
 * This is intentionally scoped to the IRC client's buffering path, where we only ever need
 * to merge a retained partial line with the next chunk. A two-array helper avoids the
 * generic array-of-arrays API shape used by utility packages and keeps the common complete
 * line path free from this allocation entirely.
 */
export function concatUint8Arrays(left: Uint8Array, right: Uint8Array): Uint8Array {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left);
  merged.set(right, left.length);
  return merged;
}

/**
 * Encode a JavaScript string as base64 without using Node's `Buffer`.
 *
 * The library avoids `Buffer` so this remains portable to modern JavaScript runtimes that
 * provide Web APIs such as `TextEncoder` and `btoa`. `btoa` accepts a binary string rather
 * than Unicode text, so the value is UTF-8 encoded first and then converted to a binary
 * string in chunks to avoid exceeding argument limits for large SASL payloads.
 */
export function stringToBase64(value: string): string {
  const bytes = utf8Encoder.encode(value);
  let binary = '';
  const chunkSize = 32_768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}
