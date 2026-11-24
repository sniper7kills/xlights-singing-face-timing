import { useEffect, useId, useRef, useState } from 'react'
import {
  type BaseUrlResult,
  endpointHost,
  isMixedContent,
  parseBaseUrl,
  type RemoteEndpoint,
} from '../../lib/remote/endpoint.ts'
import { RemoteError } from '../../lib/remote/response.ts'
import { testConnection } from './remoteClient.ts'
import { isCancel, MIXED_CONTENT_MESSAGE, remoteErrorMessage } from './transcribeDialogState.ts'

/** The copy of each base URL that `parseBaseUrl` refuses. */
const BASE_URL_ERROR: Record<Extract<BaseUrlResult, { ok: false }>['reason'], string> = {
  empty: 'Type the base URL of the endpoint.',
  invalid:
    'The base URL is not valid. Type an address that starts with https:// or http://, with no ? and no #.',
  credentials:
    'Remove the user name and the password from the base URL. Type the API key in the API key field.',
}

const MODEL_ERROR = 'Type the name of the speech model, for example whisper-1.'

type RemoteEndpointPanelProps = {
  /** The stored endpoint. An empty base URL means that the person has stored none. */
  endpoint: RemoteEndpoint
  /** True while the person changes the endpoint. */
  editing: boolean
  /** Opens the endpoint fields. */
  onEdit: () => void
  /** Receives the endpoint that the person saves, with a base URL that `parseBaseUrl` accepted. */
  onSave: (endpoint: RemoteEndpoint) => void
}

/**
 * Shows the remote endpoint: the host and the speech model name with "Change", or the endpoint fields.
 * The panel replaces the speech model selector when the person selects "Remote endpoint".
 */
export function RemoteEndpointPanel({
  endpoint,
  editing,
  onEdit,
  onSave,
}: RemoteEndpointPanelProps) {
  if (editing) return <EndpointForm endpoint={endpoint} onSave={onSave} />
  return (
    <div className="remote-summary">
      <p className="dialog-note">
        Endpoint <strong>{endpointHost(endpoint.baseUrl)}</strong>, speech model{' '}
        <strong>{endpoint.model}</strong>
      </p>
      <button type="button" className="button" onClick={onEdit}>
        Change
      </button>
    </div>
  )
}

/** The result of "Test connection" that the form shows. */
type TestState =
  | { status: 'idle' }
  | { status: 'testing'; host: string }
  | { status: 'ok'; host: string }
  | { status: 'failed'; message: string }

type Draft = { baseUrl: string; apiKey: string; model: string }

/** Returns the endpoint of the draft, or the message of the first field that is not valid. */
function checkDraft(draft: Draft): { endpoint: RemoteEndpoint } | { message: string } {
  const parsed = parseBaseUrl(draft.baseUrl)
  if (!parsed.ok) return { message: BASE_URL_ERROR[parsed.reason] }
  const model = draft.model.trim()
  if (model === '') return { message: MODEL_ERROR }
  return { endpoint: { baseUrl: parsed.baseUrl, apiKey: draft.apiKey.trim(), model } }
}

function EndpointForm({
  endpoint,
  onSave,
}: {
  endpoint: RemoteEndpoint
  onSave: RemoteEndpointPanelProps['onSave']
}) {
  const helpId = useId()
  const [draft, setDraft] = useState<Draft>(endpoint)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const testRef = useRef<AbortController | null>(null)

  useEffect(() => () => testRef.current?.abort(), [])

  function change(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setTest({ status: 'idle' })
  }

  function checked(): RemoteEndpoint | null {
    const result = checkDraft(draft)
    setFieldError('message' in result ? result.message : null)
    return 'endpoint' in result ? result.endpoint : null
  }

  function save() {
    const next = checked()
    if (next !== null) onSave(next)
  }

  async function runTest() {
    const next = checked()
    if (next === null) return
    if (isMixedContent(globalThis.location.protocol, next.baseUrl)) {
      setTest({ status: 'failed', message: MIXED_CONTENT_MESSAGE })
      return
    }
    testRef.current?.abort()
    const controller = new AbortController()
    testRef.current = controller
    const host = endpointHost(next.baseUrl)
    setTest({ status: 'testing', host })
    try {
      await testConnection(next, controller.signal)
      setTest({ status: 'ok', host })
    } catch (error) {
      if (isCancel(error)) return
      setTest({ status: 'failed', message: testFailure(error) })
    }
  }

  return (
    <div className="remote-form">
      <label className="dialog-field">
        Base URL
        <input
          type="url"
          value={draft.baseUrl}
          aria-describedby={helpId}
          spellCheck={false}
          onChange={(event) => change('baseUrl', event.target.value)}
        />
      </label>
      <p id={helpId} className="dialog-note">
        For example https://api.openai.com/v1 or http://localhost:8000/v1. The app sends the audio
        to the base URL and /audio/transcriptions. The server must allow this page in its CORS
        settings. A page from an https address can call an http address only on this computer
        (localhost).
      </p>
      <label className="dialog-field">
        API key (optional)
        <input
          type="password"
          autoComplete="off"
          value={draft.apiKey}
          spellCheck={false}
          onChange={(event) => change('apiKey', event.target.value)}
        />
      </label>
      <label className="dialog-field">
        Speech model name
        <input
          type="text"
          value={draft.model}
          spellCheck={false}
          onChange={(event) => change('model', event.target.value)}
        />
      </label>
      {fieldError !== null && (
        <p className="field-error" role="alert">
          {fieldError}
        </p>
      )}
      <TestResult test={test} />
      <div className="remote-form-actions">
        <button type="button" className="button" onClick={save}>
          Save endpoint
        </button>
        <button
          type="button"
          className="button"
          disabled={test.status === 'testing'}
          onClick={() => void runTest()}
        >
          Test connection
        </button>
      </div>
    </div>
  )
}

/** Returns the message of a failed "Test connection". The person never sees the raw text of an error. */
function testFailure(error: unknown): string {
  return error instanceof RemoteError
    ? remoteErrorMessage(error, globalThis.location.origin)
    : 'The test failed. Check the base URL and retry.'
}

function TestResult({ test }: { test: TestState }) {
  if (test.status === 'idle') return null
  if (test.status === 'failed')
    return (
      <p className="field-error" role="alert">
        {test.message}
      </p>
    )
  return (
    <p className="dialog-note" role="status">
      {test.status === 'testing'
        ? `Testing the connection to ${test.host}.`
        : `The connection works. ${test.host} returned word times.`}
    </p>
  )
}
