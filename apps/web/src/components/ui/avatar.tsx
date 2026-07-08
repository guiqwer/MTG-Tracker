function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function Avatar({
  name,
  color,
  size = 32,
}: {
  name: string
  color?: string | null
  size?: number
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-white/15"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: color
          ? `linear-gradient(140deg, ${color}, color-mix(in oklab, ${color} 65%, black))`
          : 'linear-gradient(140deg, #52525b, #27272a)',
      }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  )
}
