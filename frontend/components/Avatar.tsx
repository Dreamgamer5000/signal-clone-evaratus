export const AVATAR_COLORS: Record<string, { bg: string; fg: string }> = {
  A100: { bg: '#e3e3fe', fg: '#3838f5' },
  A110: { bg: '#dde7fc', fg: '#1251d3' },
  A120: { bg: '#d8e8f0', fg: '#086da0' },
  A130: { bg: '#cde4cd', fg: '#067906' },
  A140: { bg: '#eae0fd', fg: '#661aff' },
  A150: { bg: '#f5e3fe', fg: '#9f00f0' },
  A160: { bg: '#f6d8ec', fg: '#b8057c' },
  A170: { bg: '#f5d7d7', fg: '#be0404' },
  A180: { bg: '#fef5d0', fg: '#836b01' },
  A190: { bg: '#eae6d5', fg: '#7d6f40' },
  A200: { bg: '#d2d2dc', fg: '#4f4f6d' },
  A210: { bg: '#d7d7d9', fg: '#5c5c5c' },
};

export const AVATAR_COLOR_KEYS = Object.keys(AVATAR_COLORS);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AvatarProps {
  name: string;
  colorKey: string;
  size?: number;
  src?: string | null;
}

export function Avatar({ name, colorKey, size = 48, src }: AvatarProps) {
  const color = AVATAR_COLORS[colorKey] ?? AVATAR_COLORS.A100;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-label={name}
      className="rounded-full flex items-center justify-center shrink-0 select-none font-medium"
      style={{
        width: size,
        height: size,
        background: color.bg,
        color: color.fg,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initials(name)}
    </div>
  );
}
