export default function createProgressReporter(cb: (a: number, done: boolean) => void): TransformStream<Uint8Array, Uint8Array> {
  let processed = 0;
  const queuingStrategy = new CountQueuingStrategy({ highWaterMark: 1 });
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      processed += chunk.length;
      cb(processed, false);
      controller.enqueue(chunk);
    },
    flush() {
      cb(processed, true);
    }
  },
  queuingStrategy
  )
}
