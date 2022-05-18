// Transforms streams with randomly sized chunked
// into a stream of chunks containing atleast chunkSize bytes.
// Only the last chunk can of smaller size.

const DEFAULT_CHUNK_SIZE = 1024 * 1024;

export default class Chunker extends TransformStream<Uint8Array, Uint8Array> {
  constructor(offset: number = 0, chunkSize: number = DEFAULT_CHUNK_SIZE) {
    let buf = new ArrayBuffer(chunkSize);
    let bufOffset = 0;
    let firstChunk = true;

    super({
      transform(
        chunk: Uint8Array,
        controller: TransformStreamDefaultController
      ) {
        let chunkOffset = 0;
        if (firstChunk) {
          chunkOffset = offset;
          firstChunk = false;
        }
        while (chunkOffset !== chunk.byteLength) {
          const remainingChunk = chunk.byteLength - chunkOffset;
          const remainingBuffer = chunkSize - bufOffset;
          if (remainingChunk >= remainingBuffer) {
            // Copy part of the chunk that fits in the buffer
            new Uint8Array(buf).set(
              chunk.slice(chunkOffset, chunkOffset + remainingBuffer),
              bufOffset
            );

            const copy = new Uint8Array(chunkSize);
            copy.set(new Uint8Array(buf));
            controller.enqueue(copy);

            chunkOffset += remainingBuffer;
            bufOffset = 0;
          } else {
            // Copy the chunk till the end, it will fit in the buffer
            new Uint8Array(buf).set(chunk.slice(chunkOffset), bufOffset);
            chunkOffset += remainingChunk;
            bufOffset += remainingChunk;
          }
        }
      },
      flush(controller: TransformStreamDefaultController) {
        // Flush the remaining buffer
        controller.enqueue(new Uint8Array(buf, 0, bufOffset));
      },
    });
  }
}
