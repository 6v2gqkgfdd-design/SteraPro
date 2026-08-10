'use client'

import { useState, useTransition } from 'react'

export default function SyncNowButton({
  action,
}: {
  action: () => Promise<{ ok: boolean; message: string }>
}) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null)
          start(async () => {
            try {
              const r = await action()
              setOk(r.ok)
              setMsg(r.message)
            } catch (e) {
              setOk(false)
              setMsg(e instanceof Error ? e.message : 'Sync mislukt')
            }
          })
        }}
        className="rounded-full border border-stera-line bg-white px-4 py-2 text-sm font-medium text-stera-ink hover:border-stera-green disabled:opacity-50"
      >
        {pending ? 'Bezig…' : 'Nu synchroniseren'}
      </button>
      {msg ? (
        <span
          className={`text-xs ${ok ? 'text-stera-green' : 'text-amber-800'}`}
        >
          {msg}
        </span>
      ) : null}
    </div>
  )
}
