import { createSingerFinder } from '../features/singer-voices/engine/index.ts'
import { serveSingerFinder } from '../features/singer-voices/serveSingerFinder.ts'

const handle = serveSingerFinder(createSingerFinder, (message) => self.postMessage(message))

self.addEventListener('message', (event: MessageEvent<unknown>) => void handle(event.data))
