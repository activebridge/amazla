import { NerdFont } from '../nerd.js'

const CSS = `
  @font-face {
    font-family: 'Nerd';
    src: url(data:application/x-font-woff;charset=utf-8;base64,${NerdFont}) format('woff');
    font-weight: normal;
    font-style: normal;
  }

  .MuiInputBase-root, .MuiMenuItem-root {
    font-family: Nerd,Circular,Helvetica,Arial,sans-serif !important;
  }
}
`

let isFontLoaded = false

export const loadFont = e => {
  if (isFontLoaded) return

  e.view.document.head.innerHTML += `<style>${CSS}</style>`
  isFontLoaded = true
  console.log('Custom font loaded!')
}
