// SPEC §9 Signing in by pairing: the QR code the TV shows, which opens /pair?code=… on my phone. Drawn by the page
// as one SVG path from the library's dark squares, so no markup from outside goes into the page.
import qrcode from 'qrcode-generator'

export interface QrDrawing {
  /** Squares along one side, the quiet border included. */
  size: number
  /** One path covering every dark square. */
  path: string
}

/** How to draw the QR code for some text, with the standard 4-square quiet border phone cameras need. */
export function qrDrawing(text: string, border = 4): QrDrawing {
  // Type 0 picks the smallest code that fits; M recovers from some glare on a TV screen.
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const count = qr.getModuleCount()
  const parts: string[] = []
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) parts.push(`M${col + border} ${row + border}h1v1h-1z`)
    }
  }
  return { size: count + border * 2, path: parts.join('') }
}
