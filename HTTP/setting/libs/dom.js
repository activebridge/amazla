let doc = null

export const setDocument = (e) => {
  doc = e?.nativeEvent?.view?.window?.document
  return doc
}

export const getDocument = () => doc

export const findElementByText = (text) => {
  if (!doc) return null
  for (const el of doc.querySelectorAll('*')) {
    if (el.childNodes.length === 1 &&
        el.firstChild?.nodeType === 3 &&
        el.textContent?.trim() === text) {
      return el
    }
  }
  return null
}

export const findCardsByHandle = (handleText = '≡', maxHeight = 200) => {
  if (!doc) return { cards: [], handles: [] }

  const cards = []
  const handles = []
  const seen = new Set()

  doc.querySelectorAll('*').forEach(el => {
    if (el.childNodes.length === 1 &&
        el.firstChild?.nodeType === 3 &&
        el.textContent?.trim() === handleText) {
      const handle = el.parentElement
      if (!handle) return

      // Fixed traversal: handle → BODY_CONTENT → BODY_WRAPPER → Card
      const card = handle.parentElement?.parentElement?.parentElement
      if (!card || card === doc.body || seen.has(card)) return

      const rect = card.getBoundingClientRect()
      if (rect.height > maxHeight) return

      seen.add(card)
      cards.push(card)
      handles.push(handle)
    }
  })

  return { cards, handles }
}

export const resetDocument = () => {
  doc = null
}

export const resetCardScrollPositions = () => {
  if (!doc) return
  doc.querySelectorAll('*').forEach(el => {
    if (el.scrollLeft > 0) {
      el.scrollLeft = 0
    }
  })
}

export const resetCardStyles = () => {
  const { cards } = findCardsByHandle()
  cards.forEach(card => {
    card.style.transition = 'none'
    card.style.animation = 'none'
    card.style.maxHeight = '200px'
    card.style.opacity = '1'
    card.style.marginBottom = '12px'
    // Reset scroll with overflow technique
    const scrollable = card.querySelector('[style*="overflow"]')
    if (scrollable) {
      scrollable.style.overflowX = 'hidden'
      scrollable.scrollLeft = 0
    }
  })
  // Force reflow then re-enable
  if (cards[0]) cards[0].offsetHeight
  cards.forEach(card => {
    card.style.animation = ''
    card.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease'
    const scrollable = card.querySelector('[style*="overflow"]')
    if (scrollable) {
      scrollable.style.overflowX = 'auto'
    }
  })
}
