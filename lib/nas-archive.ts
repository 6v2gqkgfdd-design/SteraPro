/**
 * SteraPro NAS-archief (full-res + exports).
 *
 * Live app blijft op Supabase (web-JPEG). Full-res PNG's en backups
 * gaan naar de NAS wanneer die lokaal gemount is.
 *
 * Standaardpad: /Volumes/Documenten-Jellie/SteraPro
 * Override: STERAPRO_NAS_ROOT
 *
 * Op Vercel bestaat de NAS niet → functies returnen skipped: true.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_NAS_ROOT = '/Volumes/Documenten-Jellie/SteraPro'

export function getNasRoot(): string {
  return (process.env.STERAPRO_NAS_ROOT || DEFAULT_NAS_ROOT).replace(/\/$/, '')
}

/** True als de NAS-root bereikbaar is (gemount op deze machine). */
export function isNasAvailable(root = getNasRoot()): boolean {
  try {
    return existsSync(root) && statSync(root).isDirectory()
  } catch {
    return false
  }
}

export function ensureNasLayout(root = getNasRoot()): {
  ok: boolean
  root: string
  reason?: string
} {
  if (!isNasAvailable(root)) {
    return {
      ok: false,
      root,
      reason: `NAS niet gemount of map ontbreekt: ${root}`,
    }
  }
  const dirs = [
    'photos/originals',
    'photos/generated/by-itemcode',
    'photos/thumbs',
    'catalog/exports',
    'backups/supabase',
    'backups/shopify',
    'docs',
  ]
  for (const d of dirs) {
    mkdirSync(join(root, d), { recursive: true })
  }
  return { ok: true, root }
}

export type ArchivePhotosetInput = {
  itemcode: string
  /** Volledige paden of buffers */
  studio?: string | Buffer
  detail?: string | Buffer
  maat?: string | Buffer
  /** Optioneel bron/cutout */
  original?: string | Buffer
  /** Extensie zonder punt; default png voor full-res */
  ext?: string
  meta?: Record<string, unknown>
}

export type ArchiveResult = {
  ok: boolean
  skipped: boolean
  dir?: string
  files: string[]
  message: string
}

/**
 * Schrijf full-res fotoset naar NAS:
 *   photos/generated/by-itemcode/{ITEMCODE}/studio.ext
 */
export function archivePhotosetToNas(input: ArchivePhotosetInput): ArchiveResult {
  const root = getNasRoot()
  const layout = ensureNasLayout(root)
  if (!layout.ok) {
    return {
      ok: true,
      skipped: true,
      files: [],
      message: layout.reason || 'NAS unavailable',
    }
  }

  const code = String(input.itemcode || '')
    .trim()
    .toUpperCase()
  if (!code) {
    return {
      ok: false,
      skipped: false,
      files: [],
      message: 'itemcode ontbreekt',
    }
  }

  const ext = (input.ext || 'png').replace(/^\./, '')
  const dir = join(root, 'photos/generated/by-itemcode', code)
  mkdirSync(dir, { recursive: true })

  const files: string[] = []
  const write = (name: string, data: string | Buffer | undefined) => {
    if (data == null) return
    const dest = join(dir, `${name}.${ext}`)
    if (typeof data === 'string') {
      if (!existsSync(data)) return
      copyFileSync(data, dest)
    } else {
      writeFileSync(dest, data)
    }
    files.push(dest)
  }

  write('studio', input.studio)
  write('detail', input.detail)
  write('maat', input.maat)

  if (input.original) {
    const origDir = join(root, 'photos/originals', code)
    mkdirSync(origDir, { recursive: true })
    const dest = join(origDir, `original.${ext}`)
    if (typeof input.original === 'string') {
      if (existsSync(input.original)) {
        copyFileSync(input.original, dest)
        files.push(dest)
      }
    } else {
      writeFileSync(dest, input.original)
      files.push(dest)
    }
  }

  if (input.meta) {
    const metaPath = join(dir, 'meta.json')
    writeFileSync(
      metaPath,
      JSON.stringify(
        {
          itemcode: code,
          archived_at: new Date().toISOString(),
          ...input.meta,
        },
        null,
        2
      )
    )
    files.push(metaPath)
  }

  return {
    ok: true,
    skipped: false,
    dir,
    files,
    message: `${files.length} bestand(en) → ${dir}`,
  }
}

/** Schrijf een catalogus-export (JSON/CSV) naar catalog/exports/. */
export function archiveCatalogExport(
  filename: string,
  content: string | Buffer
): ArchiveResult {
  const root = getNasRoot()
  const layout = ensureNasLayout(root)
  if (!layout.ok) {
    return {
      ok: true,
      skipped: true,
      files: [],
      message: layout.reason || 'NAS unavailable',
    }
  }
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const dest = join(root, 'catalog/exports', safe)
  writeFileSync(dest, content)
  return {
    ok: true,
    skipped: false,
    files: [dest],
    message: `export → ${dest}`,
  }
}

/** Schrijf een backup-bestand naar backups/{kind}/. */
export function archiveBackup(
  kind: 'supabase' | 'shopify',
  filename: string,
  content: string | Buffer
): ArchiveResult {
  const root = getNasRoot()
  const layout = ensureNasLayout(root)
  if (!layout.ok) {
    return {
      ok: true,
      skipped: true,
      files: [],
      message: layout.reason || 'NAS unavailable',
    }
  }
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const dest = join(root, 'backups', kind, safe)
  writeFileSync(dest, content)
  return {
    ok: true,
    skipped: false,
    files: [dest],
    message: `backup → ${dest}`,
  }
}

/** Lijst itemcodes die al op de NAS gearchiveerd zijn. */
export function listArchivedItemcodes(root = getNasRoot()): string[] {
  const dir = join(root, 'photos/generated/by-itemcode')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory()
    } catch {
      return false
    }
  })
}
