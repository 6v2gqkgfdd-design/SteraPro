'use client'

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="stera-cta inline-flex items-center justify-center bg-[#1A2F6E] px-5 py-3 text-xs text-white"
    >
      Print / opslaan als PDF
    </button>
  )
}
