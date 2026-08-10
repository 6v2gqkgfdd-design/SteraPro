'use client'

import { useState, useTransition } from 'react'
import { importOrdersForCompany } from './actions'

export default function ImportOrdersButton({ companyId }: { companyId: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null)
          start(async () => {
            try {
              const r = await importOrdersForCompany(companyId)
              setOk(r.ok)
              setMsg(r.message)
            } catch (e) {
              setOk(false)
              setMsg(e instanceof Error ? e.message : 'Import mislukt')
            }
          })
        }}
        className="stera-cta stera-cta-primary disabled:opacity-50"
      >
        {pending ? 'Bezig…' : 'Importeer uit Shopify'}
      </button>
      {msg ? (
        <span className={`text-xs ${ok ? 'text-stera-green' : 'text-amber-800'}`}>
          {msg}
        </span>
      ) : null}
    </div>
  )
}
