'use client'

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mt-4 rounded-full bg-black px-4 py-2 text-sm text-white"
    >
      Afdrukken of bewaren als PDF
    </button>
  )
}
