import { useState } from 'react'
import { CustomDictionaryDialog } from './CustomDictionaryDialog.tsx'

/** Shows the "Custom dictionary" button and, after a press, the custom dictionary dialog. */
export function CustomDictionaryAction() {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* The dialog finds this button by the attribute when the control that opened it is gone. */}
      <button
        type="button"
        className="button"
        data-custom-dictionary-action
        onClick={() => setOpen(true)}
      >
        Custom dictionary
      </button>
      {open && <CustomDictionaryDialog onClose={() => setOpen(false)} />}
    </>
  )
}
