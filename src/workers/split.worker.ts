import { createSplitter } from '../features/singer-split/engine/index.ts'
import { serveSplitter } from '../features/singer-split/serveSplitter.ts'

const handle = serveSplitter(createSplitter, (message, transfer = []) =>
  self.postMessage(message, { transfer }),
)

self.addEventListener('message', (event: MessageEvent<unknown>) => void handle(event.data))
