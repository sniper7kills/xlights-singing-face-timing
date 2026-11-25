// The E2E tests use this worker in place of separate.worker.ts, so that no test downloads a vocal separation model.
// The client starts it only when `__SEPARATE_FIXTURE__` is true.
import { createFixtureSeparator } from '../features/vocal-separation/engine/fixtureSeparator.ts'
import { serveSeparator } from '../features/vocal-separation/serveSeparator.ts'

const handle = serveSeparator(createFixtureSeparator, (message, transfer = []) =>
  self.postMessage(message, { transfer }),
)

self.addEventListener('message', (event: MessageEvent<unknown>) => void handle(event.data))
