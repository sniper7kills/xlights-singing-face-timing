type UploadProgress = { loaded: number; total: number; lengthComputable: boolean }

/**
 * A fake XMLHttpRequest that records the request and answers when a test calls `respond` or `fail`.
 * `FakeXhr.responder` answers each request at its send, when a test sets it.
 */
export class FakeXhr {
  static instances: FakeXhr[] = []
  static responder: ((xhr: FakeXhr) => void) | null = null

  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: FormData | null = null
  aborted = false
  status = 0
  responseText = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  upload: {
    onprogress: ((event: UploadProgress) => void) | null
    onload: (() => void) | null
  } = { onprogress: null, onload: null }

  constructor() {
    FakeXhr.instances.push(this)
  }

  static reset(): void {
    FakeXhr.instances = []
    FakeXhr.responder = null
  }

  static last(): FakeXhr {
    const xhr = FakeXhr.instances.at(-1)
    if (xhr === undefined) throw new Error('No request was sent.')
    return xhr
  }

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value
  }

  send(body: FormData): void {
    this.body = body
    const responder = FakeXhr.responder
    if (responder !== null) queueMicrotask(() => responder(this))
  }

  abort(): void {
    this.aborted = true
  }

  /** Sends the upload progress events and the end of the upload. */
  uploadAll(total = 1000): void {
    this.upload.onprogress?.({ loaded: total / 2, total, lengthComputable: true })
    this.upload.onprogress?.({ loaded: total, total, lengthComputable: true })
    this.upload.onload?.()
  }

  respond(status: number, body: unknown): void {
    this.status = status
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
    this.onload?.()
  }

  fail(): void {
    this.onerror?.()
  }

  /** Returns the object as the type of the browser, for the `createXhr` option. */
  asXhr(): XMLHttpRequest {
    // The client uses only the members that the fake has.
    return this as unknown as XMLHttpRequest
  }
}

/** Returns a `createXhr` function that makes one fake for each request. */
export function fakeCreateXhr(): () => XMLHttpRequest {
  return () => new FakeXhr().asXhr()
}
