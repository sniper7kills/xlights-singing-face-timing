import { formatMegabytes } from './libraryFormat.ts'
import type { StorageState } from './persistentStorage.ts'

type StorageMeterProps = {
  storage: StorageState
  /** Shows the note of a refused persistent storage. The note is only useful when songs exist. */
  showPersistenceNote: boolean
}

/** Shows the storage that the app uses and the storage that the browser allows, in MB. */
export function StorageMeter({ storage, showPersistenceNote }: StorageMeterProps) {
  return (
    <section className="card" aria-labelledby="storage-title">
      <h3 id="storage-title">Browser storage</h3>
      <meter
        className="storage-meter"
        aria-label="Storage used"
        min={0}
        max={storage.quotaBytes}
        value={storage.usedBytes}
      />
      <p className="card-note">
        {formatMegabytes(storage.usedBytes)} MB used of {formatMegabytes(storage.quotaBytes)} MB
        allowed
      </p>
      {showPersistenceNote && !storage.persisted && (
        <p className="card-note" role="note">
          The browser can remove songs when disk space is low. Export your work.
        </p>
      )}
    </section>
  )
}
