export function toTextReadableStream(stream: AsyncIterable<string>): ReadableStream<string> {
  const iterator = stream[Symbol.asyncIterator]();
  return new ReadableStream<string>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

export async function readTextStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) text += value;
  }

  return text;
}
