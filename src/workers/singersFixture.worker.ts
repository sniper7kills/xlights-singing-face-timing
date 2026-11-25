// The E2E tests use this worker in place of singers.worker.ts, so that no test downloads a singer model.
// The client starts it only when `__SINGERS_FIXTURE__` is true.
import { createFixtureSingerFinder } from '../features/singer-voices/engine/fixtureSingerFinder.ts'
import { serveSingerFinder } from '../features/singer-voices/serveSingerFinder.ts'

const handle = serveSingerFinder(createFixtureSingerFinder, (message) => self.postMessage(message))

self.addEventListener('message', (event: MessageEvent<unknown>) => void handle(event.data))
