'use client'

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="stera-cta stera-cta-primary"
    >
      Opslaan als PDF
    </button>
  )
}
