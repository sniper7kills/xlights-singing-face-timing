import { useState } from 'react'
import { CustomDictionaryDialog } from './CustomDictionaryDialog.tsx'

/** Shows the "Custom dictionary" button and, after a press, the custom dictionary dialog. */
export function CustomDictionaryAction() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        Custom dictionary
      </button>
      {open && <CustomDictionaryDialog onClose={() => setOpen(false)} />}
    </>
  )
}
