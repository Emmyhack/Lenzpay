/**
 * LENZ PAY — THE HYPER-LIQUID VAULT
 * Design tokens sourced from the Stitch export. Source of truth — do not
 * override ad hoc in individual screens/components.
 */

export const Colors = {
  // ── Surface Architecture ──────────────────────────────────
  background: '#0e0e0f', // canvas — base layer
  surface: '#0e0e0f', // alias for base
  surfaceContainerLowest: '#0a0a0b', // recessed / ultra-subtle
  surfaceContainerLow: '#131314', // large content blocks
  surfaceContainer: '#181819', // standard cards
  surfaceContainerHigh: '#201f21', // active/interactive cards
  surfaceContainerHighest: '#2c2c2d', // elevated inputs, focus
  surfaceBright: '#2c2c2d', // popovers, high-priority modals

  // ── Brand ─────────────────────────────────────────────────
  //
  // `primary` is the single source of truth for the brand accent, including
  // the wordmark (see components/ui/LenzPayLogo).
  //
  // Note the app icon (`assets/icon.png`) is currently a different green,
  // #b5e61d — a yellow-lime rather than this mint. Two greens is a brand bug,
  // and this token wins: every CTA, badge, chart accent and focus state in the
  // app already uses it, so changing the token would mean recolouring the
  // entire product to match one asset. The icon is the outlier and is the
  // thing to regenerate — tracked in docs/ARCHITECTURE-DECISIONS.md (ADR-008).
  primary: '#34fea0', // mint — brand accent, CTA, glow source
  primaryContainer: '#0cef93', // gradient endpoint (135°)
  onPrimary: '#005c36', // text ON primary buttons

  secondary: '#b984ff', // purple — crypto, rewards, links
  secondaryContainer: '#7d1be2', // crypto card radial edge (20% opacity)
  onSecondary: '#ffffff',

  // ── Semantic ──────────────────────────────────────────────
  success: '#22c98a', // settled, confirmed
  warning: '#f5b731', // pending, waiting
  error: '#ff4560', // fraud, declined, blocked
  errorDim: '#d7383b', // error label text
  errorContainer: 'rgba(215,56,59,0.12)',

  // ── Asset-class identifiers ────────────────────────────────
  ngn: '#22c98a', // Nigerian Naira (same as success)
  usd: '#4f8fff', // US Dollar — blue
  btc: '#f7931a', // Bitcoin — orange
  usdt: '#26a17b', // Tether — teal
  eth: '#627eea', // Ethereum — purple-blue

  // ── Text ──────────────────────────────────────────────────
  onSurface: 'rgba(255,255,255,0.92)', // primary text
  onSurfaceVariant: 'rgba(255,255,255,0.55)', // secondary text
  onSurfaceMuted: 'rgba(255,255,255,0.35)', // placeholder / metadata
  outlineVariant: 'rgba(255,255,255,0.15)', // ghost borders (max)
} as const;

export const Typography = {
  // ── Typefaces ─────────────────────────────────────────────
  // Display + Numbers: Space Grotesk (surgical, fintech precision)
  // Body + Labels:     Inter (trust, readability)
  displayFont: 'SpaceGrotesk_700Bold',
  displayFontMedium: 'SpaceGrotesk_500Medium',
  bodyFont: 'Inter_400Regular',
  bodyFontMedium: 'Inter_500Medium',
  bodyFontSemiBold: 'Inter_600SemiBold',
  labelFont: 'Inter_400Regular',

  // ── Scale ─────────────────────────────────────────────────
  displayLg: { fontSize: 48, lineHeight: 52, letterSpacing: -1.5 },
  displayMd: { fontSize: 38, lineHeight: 44, letterSpacing: -1 },
  displaySm: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  headlineMd: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  headlineSm: { fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  titleMd: { fontSize: 16, lineHeight: 22, letterSpacing: 0 },
  titleSm: { fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  bodyMd: { fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  bodySm: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  labelMd: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  labelSm: { fontSize: 10, lineHeight: 14, letterSpacing: 1.0 }, // ALL CAPS metadata
} as const;

export const Spacing = {
  // Intentional rhythm — NOT uniform 16px everywhere
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24, // card horizontal padding
  xxl: 32, // section headers
  xxxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999, // full roundness for chips and primary buttons
} as const;

export const Elevation = {
  // Ambient glow shadow — white-tinted, not dark
  float: {
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 8,
  },
  // Primary CTA glow
  primaryGlow: {
    shadowColor: '#34fea0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  // Subtle card lift
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

// Gradient definitions (for expo-linear-gradient)
export const Gradients = {
  // Primary CTA: liquid lime
  primaryCTA: {
    colors: ['#34fea0', '#0cef93'] as [string, string],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    // angle: 135deg
  },
  // Crypto card ambient
  cryptoCard: {
    colors: ['#201f21', 'rgba(125,27,226,0.20)'] as [string, string],
    start: { x: 0.5, y: 0 },
    end: { x: 1, y: 1 },
  },
  // Background depth
  screenFade: {
    colors: ['#0e0e0f', '#131314'] as [string, string],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
} as const;

// Glassmorphism overlay (for sticky headers, bottom sheets)
// Pair with expo-blur's <BlurView intensity={80} tint="dark" /> — RN has no
// native backdrop-filter, so the blur itself does the work; this object only
// supplies the fallback tint color to sit behind/inside the BlurView.
export const Glass = {
  backgroundColor: 'rgba(14,14,15,0.60)',
  blurIntensity: 80,
} as const;
