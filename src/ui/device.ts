// SPEC §10 Phase 3 iPhone: telling an iPhone (or iPad) apart, and whether the app runs from the Home Screen.
export function isIOS(nav: { userAgent: string; platform?: string; maxTouchPoints?: number } = navigator): boolean {
  // iPads report themselves as a Mac, but with a touch screen.
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)
}
/** Opened from the Home Screen (installed), not in a browser tab. */
export function isInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
