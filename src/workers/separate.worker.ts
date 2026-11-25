import { createSeparator } from '../features/vocal-separation/engine/index.ts'
import { serveSeparator } from '../features/vocal-separation/serveSeparator.ts'

const handle = serveSeparator(createSeparator, (message, transfer = []) =>
  self.postMessage(message, { transfer }),
)

self.addEventListener('message', (event: MessageEvent<unknown>) => void handle(event.data))
