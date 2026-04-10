import charsetDetector from 'chardet';
import * as iconv from 'iconv-lite';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();
const lineDelimiter = /\r\n|\r|\n/;

function convertEncodingHelper(
  str: string | Uint8Array,
  encoding: string,
  errorHandler: (e: Error, charset?: string) => void,
) {
  let charset: string | null;
  try {
    const bytes = typeof str === 'string' ? utf8Encoder.encode(str) : str;
    charset = charsetDetector.detect(bytes);
    const decoded = iconv.decode(bytes, charset ?? '');
    return iconv.decode(iconv.encode(decoded, encoding), encoding);
  } catch (err) {
    if (!errorHandler) {
      throw err;
    }

    errorHandler(err as Error, charset);
  }

  return typeof str === 'string' ? str : utf8Decoder.decode(str);
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
