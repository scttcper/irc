import * as iconv from 'iconv-lite';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();
const lineDelimiter = /\r\n|\r|\n/;

function convertEncodingHelper(str: Uint8Array, encoding: string) {
  return iconv.decode(str, encoding);
}

// Reusable buffer for encodeInto — 4 bytes is the max a single code point needs in UTF-8
const encodeIntoBuf = new Uint8Array(4);

function utf8ByteLength(value: string) {
  return utf8Encoder.encode(value).length;
}

function truncateUtf8(value: string, maxBytes: number) {
  let bytes = 0;
  let end = 0;

  for (const char of value) {
    const { written } = utf8Encoder.encodeInto(char, encodeIntoBuf);
    if (bytes + written > maxBytes) {
      break;
    }

    bytes += written;
    end += char.length;
  }

  return value.slice(0, end);
}

export {
  convertEncodingHelper,
  lineDelimiter,
  truncateUtf8,
  utf8ByteLength,
  utf8Decoder,
  utf8Encoder,
};
