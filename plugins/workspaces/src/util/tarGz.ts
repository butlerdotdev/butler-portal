// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Creates a base64-encoded tar.gz archive from a FileList (from webkitdirectory input).
 * Uses the POSIX tar format with gzip compression via CompressionStream API.
 */
export async function createTarGzFromFiles(
  files: FileList,
): Promise<string> {
  const entries: { path: string; data: Uint8Array }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // webkitRelativePath is "dirname/subdir/file.lua" — strip the top-level directory
    const relPath = file.webkitRelativePath;
    const parts = relPath.split('/');
    // Remove the root directory name (the selected folder name)
    const innerPath = parts.slice(1).join('/');
    if (!innerPath) continue;
    const buf = await file.arrayBuffer();
    entries.push({ path: innerPath, data: new Uint8Array(buf) });
  }

  // Build a tar archive
  const blocks: Uint8Array[] = [];
  for (const entry of entries) {
    const header = new Uint8Array(512);
    const encoder = new TextEncoder();

    // File name (offset 0, 100 bytes)
    const nameBytes = encoder.encode(entry.path);
    header.set(nameBytes.slice(0, 100), 0);

    // File mode (offset 100, 8 bytes) - 0644
    header.set(encoder.encode('0000644\0'), 100);

    // Owner/group ID (offset 108/116, 8 bytes each)
    header.set(encoder.encode('0001000\0'), 108);
    header.set(encoder.encode('0001000\0'), 116);

    // File size in octal (offset 124, 12 bytes)
    const sizeOctal =
      entry.data.length.toString(8).padStart(11, '0') + '\0';
    header.set(encoder.encode(sizeOctal), 124);

    // Modification time (offset 136, 12 bytes)
    const mtime =
      Math.floor(Date.now() / 1000)
        .toString(8)
        .padStart(11, '0') + '\0';
    header.set(encoder.encode(mtime), 136);

    // Type flag (offset 156) - '0' for regular file
    header[156] = 48; // ASCII '0'

    // USTAR magic (offset 257, 6 bytes) + version (offset 263, 2 bytes)
    header.set(encoder.encode('ustar\0'), 257);
    header.set(encoder.encode('00'), 263);

    // Compute checksum (offset 148, 8 bytes) - must be spaces during calculation
    header.set(encoder.encode('        '), 148);
    let checksum = 0;
    for (let j = 0; j < 512; j++) checksum += header[j];
    const csOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
    header.set(encoder.encode(csOctal), 148);

    blocks.push(header);
    blocks.push(entry.data);

    // Pad to 512-byte boundary
    const remainder = entry.data.length % 512;
    if (remainder > 0) {
      blocks.push(new Uint8Array(512 - remainder));
    }
  }

  // Two zero blocks to mark end of archive
  blocks.push(new Uint8Array(1024));

  // Concatenate all blocks
  const totalSize = blocks.reduce((sum, b) => sum + b.length, 0);
  const tarData = new Uint8Array(totalSize);
  let offset = 0;
  for (const block of blocks) {
    tarData.set(block, offset);
    offset += block.length;
  }

  // Gzip compress using CompressionStream
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(tarData);
  writer.close();
  const compressed: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    compressed.push(value);
  }
  const gzSize = compressed.reduce((sum, b) => sum + b.length, 0);
  const gzData = new Uint8Array(gzSize);
  let gzOffset = 0;
  for (const chunk of compressed) {
    gzData.set(chunk, gzOffset);
    gzOffset += chunk.length;
  }

  // Base64 encode
  let binary = '';
  for (let i = 0; i < gzData.length; i++) {
    binary += String.fromCharCode(gzData[i]);
  }
  return btoa(binary);
}
