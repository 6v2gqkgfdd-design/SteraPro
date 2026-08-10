import Image from 'next/image'

/**
 * Kleine plant-thumbnail. Next/Image laat Vercel de full-res verkleinen
 * zodat de browser geen multi-MB foto downloadt in lijsten.
 * Op de plant-detailpagina gebruik je de volle `photo_url` zonder deze component.
 */
export default function PlantThumb({
  src,
  alt,
  size = 56,
  className = '',
}: {
  src: string
  alt: string
  size?: number
  className?: string
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      sizes={`${size}px`}
      quality={55}
      className={`shrink-0 rounded-lg object-cover ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  )
}
