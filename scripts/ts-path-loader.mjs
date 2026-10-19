/**
 * Zet @/… om naar een .ts-bestand zodat node --experimental-strip-types
 * de app-imports kan laden buiten Next.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const url = new URL(`../${specifier.slice(2)}.ts`, import.meta.url)
    return { url: url.href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
