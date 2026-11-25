import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasWebGpu } from '../../transcription/device.ts'
import { DEMUCS_MODEL_FILES } from './demucsModel.ts'
import { createDemucsSeparator } from './demucsSeparator.ts'
import { loadModelFiles } from './modelFiles.ts'

type FakeOptions = {
  sessionOptions: { executionProviders: string[] }
  onProgress: (info: { progress: number; currentSegment: number; totalSegments: number }) => void
}

/** The options of each `DemucsProcessor` that the engine makes, and the devices that fail. */
const fake = vi.hoisted(() => ({
  made: [] as FakeOptions[],
  failingDevices: new Set<string>(),
}))

vi.mock('onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url', () => ({
  default: '/ort.asyncify.wasm',
}))
vi.mock('onnxruntime-web/webgpu', () => ({ env: { wasm: {} } }))
vi.mock('../../transcription/device.ts', () => ({ hasWebGpu: vi.fn() }))
vi.mock('./modelFiles.ts', () => ({ loadModelFiles: vi.fn() }))
vi.mock('demucs-web', () => ({
  DemucsProcessor: class {
    readonly options: FakeOptions
    constructor(options: FakeOptions) {
      this.options = options
      fake.made.push(options)
    }
    async loadModel() {
      const [device = ''] = this.options.sessionOptions.executionProviders
      if (fake.failingDevices.has(device)) throw new Error(`${device} failed`)
    }
    async separate(left: Float32Array, right: Float32Array) {
      this.options.onProgress({ progress: 1, currentSegment: 1, totalSegments: 1 })
      const silent = { left: new Float32Array(left.length), right: new Float32Array(right.length) }
      return { vocals: { left, right }, drums: silent, bass: { left, right }, other: silent }
    }
  },
}))

const audio = {
  left: new Float32Array([1, 1]),
  right: new Float32Array([0, 0]),
  sampleRate: 44100 as const,
}

beforeEach(() => {
  fake.made.length = 0
  fake.failingDevices.clear()
  vi.mocked(loadModelFiles).mockResolvedValue([new ArrayBuffer(1)])
})

describe('createDemucsSeparator', () => {
  it('loads the pinned Demucs file and sends its download progress', async () => {
    vi.mocked(hasWebGpu).mockResolvedValue(false)
    const download = vi.fn()

    await createDemucsSeparator().separate(audio, { download, progress: vi.fn() }, false)

    expect(loadModelFiles).toHaveBeenCalledWith(
      DEMUCS_MODEL_FILES,
      download,
      expect.objectContaining({ fetch: expect.any(Function) }),
    )
  })

  it('runs on wasm only when the browser gives no WebGPU adapter', async () => {
    vi.mocked(hasWebGpu).mockResolvedValue(false)

    const { vocals } = await createDemucsSeparator().separate(
      audio,
      { download: vi.fn(), progress: vi.fn() },
      false,
    )

    expect(fake.made.map((options) => options.sessionOptions.executionProviders)).toEqual([
      ['wasm'],
    ])
    expect(Array.from(vocals)).toEqual([0.5, 0.5])
  })

  it('runs on webgpu when the browser gives an adapter', async () => {
    vi.mocked(hasWebGpu).mockResolvedValue(true)

    await createDemucsSeparator().separate(audio, { download: vi.fn(), progress: vi.fn() }, false)

    expect(fake.made.map((options) => options.sessionOptions.executionProviders)).toEqual([
      ['webgpu'],
    ])
  })

  it('goes on with wasm after a webgpu failure', async () => {
    vi.mocked(hasWebGpu).mockResolvedValue(true)
    fake.failingDevices.add('webgpu')

    const { vocals } = await createDemucsSeparator().separate(
      audio,
      { download: vi.fn(), progress: vi.fn() },
      false,
    )

    expect(fake.made.map((options) => options.sessionOptions.executionProviders)).toEqual([
      ['webgpu'],
      ['wasm'],
    ])
    expect(vocals).toHaveLength(2)
  })

  it('returns the instruments when the request asks for them', async () => {
    vi.mocked(hasWebGpu).mockResolvedValue(false)

    const result = await createDemucsSeparator().separate(
      audio,
      { download: vi.fn(), progress: vi.fn() },
      true,
    )

    expect(Array.from(result.instruments ?? [])).toEqual([0.5, 0.5])
  })

  it('rejects with the kind model when the download gives no file', async () => {
    vi.mocked(hasWebGpu).mockResolvedValue(false)
    vi.mocked(loadModelFiles).mockResolvedValue([])

    await expect(
      createDemucsSeparator().separate(audio, { download: vi.fn(), progress: vi.fn() }, false),
    ).rejects.toMatchObject({ kind: 'model' })
  })
})
