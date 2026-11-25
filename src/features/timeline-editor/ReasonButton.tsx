import { type ButtonHTMLAttributes, type Ref, useId } from 'react'

type ReasonButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'title'> & {
  /** The cause that keeps the action from acting, or null when the action acts. */
  reason: string | null
  /** The tooltip when the action acts, for example "Split the selected mark at the play cursor". */
  hint: string
  /** The shortcut that the tooltip names, for example `S`. No value names no shortcut. */
  shortcut?: string
  /** Receives a click only when `reason` is null. */
  onAct: () => void
  /** Receives a click when `reason` is not null. */
  onBlocked?: () => void
  ref?: Ref<HTMLButtonElement>
}

/**
 * Shows a toolbar button that states why it does not act.
 * A disabled button takes no hover and no focus in a browser, so its tooltip stays hidden.
 * This button uses `aria-disabled` instead: it keeps the hover and the focus, its tooltip states the cause,
 * and `aria-describedby` gives the cause to a screen reader.
 */
export function ReasonButton({
  reason,
  hint,
  shortcut,
  onAct,
  onBlocked,
  className = 'button',
  ref,
  ...rest
}: ReasonButtonProps) {
  const reasonId = useId()
  const text = reason ?? hint
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        aria-disabled={reason === null ? undefined : true}
        aria-describedby={reason === null ? undefined : reasonId}
        title={shortcut === undefined ? text : `${text} (${shortcut})`}
        {...rest}
        onClick={() => {
          if (reason === null) onAct()
          else onBlocked?.()
        }}
      />
      {reason !== null && (
        <span id={reasonId} className="visually-hidden">
          {reason}
        </span>
      )}
    </>
  )
}
