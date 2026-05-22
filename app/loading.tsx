// Wordt onmiddellijk getoond bij het wisselen van pagina/tab, terwijl
// de serverpagina nog laadt. Zo voelt navigeren meteen aan in plaats
// van een korte 'hang' van ~1 seconde.
export default function Loading() {
  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-6 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-7 w-44 animate-pulse rounded-lg bg-stera-line/60" />
        <div className="h-20 animate-pulse rounded-xl bg-stera-line/40" />
        <div className="h-20 animate-pulse rounded-xl bg-stera-line/40" />
        <div className="h-20 animate-pulse rounded-xl bg-stera-line/40" />
      </div>
    </main>
  )
}
