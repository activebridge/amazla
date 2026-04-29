const svg = (inner, stroke) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`,
  )

const BLUE = 'rgb(180, 215, 255)'
const GREEN = 'rgb(180, 245, 200)'
const WHITE = 'rgb(255, 255, 255)'

export const ICON_BLUETOOTH = svg(
  '<polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/>',
  BLUE,
)

export const ICON_PENCIL = svg(
  '<path d="M12 20h9"/>' +
    '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  WHITE,
)

export const ICON_OFFLINE = svg(
  '<line x1="1" y1="1" x2="23" y2="23"/>' +
    '<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>' +
    '<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>' +
    '<path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>' +
    '<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>' +
    '<path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>' +
    '<line x1="12" y1="20" x2="12.01" y2="20"/>',
  GREEN,
)
