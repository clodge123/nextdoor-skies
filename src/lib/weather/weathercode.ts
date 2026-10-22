/**
 * W3-A2 CONDITION ICONS — Open-Meteo WMO weathercode -> lucide icon mapping.
 *
 * Live-egress proof (2026-10-22): GET
 * https://api.open-meteo.com/v1/forecast?...&current=temperature_2m,weather_code
 * responds with `current_units.weather_code: "wmo code"` and
 * `current.weather_code: <int>` — the param name is `weather_code` (snake_case),
 * NOT `weathercode`. The proxy forwards the integer per town.
 *
 * Theme-neutrality law (wave-3 session 1, decision 2): icons carry NO colors.
 * They inherit `currentColor`, so callers set color via var(--text) /
 * var(--current-accent) and the glyph reads on BOTH dark and light themes.
 *
 * Determinism (R17): pure lookup, no RNG/clock. Unknown codes degrade to a
 * neutral "help" glyph (never a blank chip, never a fake condition).
 */
// Named imports ONLY (no barrel wholesale-import) so the bundler tree-shakes
// every lucide glyph this table does not reference.
import {
  Circle,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  HelpCircle,
  Snowflake,
  type LucideIcon,
} from 'lucide-react'

/** One WMO code -> one icon entry. */
export interface WeathercodeIconEntry {
  /** lucide component (named import => tree-shaken bundle). */
  icon: LucideIcon
  /** Human label for title/aria (honest state, R19). */
  label: string
  /** Stable bucket name used by CSS/tests. */
  bucket: string
}

/**
 * WMO 4677 code table as published by Open-Meteo (the "wmo code" unit).
 * Day/night variants collapse to one icon per code — the badge is small;
 * the sun/moon distinction is not legible at 16px, so codes 0-3 keep the
 * plain glyphs and the night pairs (1/2) map to their day equivalents.
 */
export const WEATHERCODE_ICONS: Readonly<Record<number, WeathercodeIconEntry>> = Object.freeze({
  0: { icon: Circle, label: 'Clear sky', bucket: 'clear' },
  1: { icon: CloudSun, label: 'Mainly clear', bucket: 'clear' },
  2: { icon: CloudSun, label: 'Partly cloudy', bucket: 'partly-cloudy' },
  3: { icon: Cloud, label: 'Overcast', bucket: 'cloudy' },
  45: { icon: CloudFog, label: 'Fog', bucket: 'fog' },
  48: { icon: CloudFog, label: 'Depositing rime fog', bucket: 'fog' },
  51: { icon: CloudDrizzle, label: 'Light drizzle', bucket: 'drizzle' },
  53: { icon: CloudDrizzle, label: 'Moderate drizzle', bucket: 'drizzle' },
  55: { icon: CloudDrizzle, label: 'Dense drizzle', bucket: 'drizzle' },
  56: { icon: CloudSnow, label: 'Light freezing drizzle', bucket: 'freezing' },
  57: { icon: CloudSnow, label: 'Dense freezing drizzle', bucket: 'freezing' },
  61: { icon: CloudRain, label: 'Slight rain', bucket: 'rain' },
  63: { icon: CloudRain, label: 'Moderate rain', bucket: 'rain' },
  65: { icon: CloudRain, label: 'Heavy rain', bucket: 'rain' },
  66: { icon: CloudSnow, label: 'Light freezing rain', bucket: 'freezing' },
  67: { icon: CloudSnow, label: 'Heavy freezing rain', bucket: 'freezing' },
  71: { icon: CloudSnow, label: 'Slight snow', bucket: 'snow' },
  73: { icon: CloudSnow, label: 'Moderate snow', bucket: 'snow' },
  75: { icon: CloudSnow, label: 'Heavy snow', bucket: 'snow' },
  77: { icon: Snowflake, label: 'Snow grains', bucket: 'snow' },
  80: { icon: CloudRain, label: 'Slight rain showers', bucket: 'rain' },
  81: { icon: CloudRain, label: 'Moderate rain showers', bucket: 'rain' },
  82: { icon: CloudRain, label: 'Violent rain showers', bucket: 'rain' },
  85: { icon: CloudSnow, label: 'Slight snow showers', bucket: 'snow' },
  86: { icon: CloudSnow, label: 'Heavy snow showers', bucket: 'snow' },
  95: { icon: CloudLightning, label: 'Thunderstorm', bucket: 'thunder' },
  96: { icon: CloudLightning, label: 'Thunderstorm with slight hail', bucket: 'thunder' },
  99: { icon: CloudLightning, label: 'Thunderstorm with heavy hail', bucket: 'thunder' },
})

/** Fallback for any code outside the table (never blank, never fake). */
export const UNKNOWN_WEATHERCODE_ICON: WeathercodeIconEntry = Object.freeze({
  icon: HelpCircle,
  label: 'Unknown conditions',
  bucket: 'unknown',
})

/**
 * Parse + map one weathercode value. Accepts the raw JSON value (number,
 * numeric string, null/undefined) — anything non-finite degrades to the
 * unknown entry. Pure, total function.
 */
export function weathercodeToIcon(raw: unknown): WeathercodeIconEntry {
  const code =
    typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(code)) return UNKNOWN_WEATHERCODE_ICON
  return WEATHERCODE_ICONS[code] ?? UNKNOWN_WEATHERCODE_ICON
}
