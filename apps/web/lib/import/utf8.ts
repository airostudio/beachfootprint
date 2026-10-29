/**
 * Index at which a byte buffer can be cut without splitting a UTF-8 character: the buffer
 * length, unless it ends partway through a multi-byte sequence, in which case the start of that
 * sequence. The import fetches the CSV in byte ranges, and a range boundary routinely lands inside
 * a character like é, ™ or a curly quote — decoding that half-character produces a 3-byte
 * replacement char, which threw the next range's offset off and could desync CSV quoting for the
 * rest of the file.
 */
export function completeUtf8Length(bytes: Uint8Array): number {
  const n = bytes.length;
  // A UTF-8 sequence is at most 4 bytes, so the lead byte of an incomplete one is in the last 3.
  for (let i = n - 1; i >= Math.max(0, n - 4); i--) {
    const b = bytes[i];
    if ((b & 0xc0) === 0x80) continue; // continuation byte — keep looking for the lead
    const needed = b < 0x80 ? 1 : (b & 0xe0) === 0xc0 ? 2 : (b & 0xf0) === 0xe0 ? 3 : (b & 0xf8) === 0xf0 ? 4 : 1;
    return i + needed > n ? i : n;
  }
  return n;
}
