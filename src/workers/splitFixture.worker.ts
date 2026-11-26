// The E2E tests use this worker in place of split.worker.ts, so that no test downloads a singer split model.
// The client starts it only when `__SPLIT_FIXTURE__` is true.
import { createFixtureSplitter } from '../features/singer-split/engine/fixtureSplitter.ts'
import { serveSplitter } from '../features/singer-split/serveSplitter.ts'

const handle = serveSplitter(createFixtureSplitter, (message, transfer = []) =>
  self.postMessage(message, { transfer }),
)

self.addEventListener('message', (event: MessageEvent<unknown>) => void handle(event.data))
