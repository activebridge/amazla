import { isSearchActive } from './search.js'
import { setDocument, getDocument, findCardsByHandle } from './dom.js'

let initialized = false
let storage = null
let vibrate = () => {}

export const initSortable = (e, settingsStorage) => {
  const doc = setDocument(e)
  if (!doc) return

  storage = settingsStorage
  vibrate = (ms) => doc.defaultView?.navigator?.vibrate?.(ms)

  if (initialized) return
  initialized = true

  setup()
}

const setup = () => {
  const doc = getDocument()
  const body = doc.body

  let dragging = null
  let dragIndex = -1
  let currentIndex = -1
  let startY = 0
  let cards = []
  let cardHeight = 0
  let container = null
  let scrollContainer = null

  // Cards render in array order, and findCardsByHandle returns them in DOM
  // order — so the DOM position IS the array index. No text matching needed.
  const markCards = () => {
    cards = []

    doc.querySelectorAll('[data-sortable-card]').forEach((el) => {
      el.removeAttribute('data-sortable-card')
      el.removeAttribute('data-index')
    })
    doc.querySelectorAll('[data-sortable-handle]').forEach((el) => {
      el.removeAttribute('data-sortable-handle')
    })

    const { cards: foundCards, handles } = findCardsByHandle()

    foundCards.forEach((card, idx) => {
      card.setAttribute('data-sortable-card', 'true')
      card.setAttribute('data-index', idx)
      handles[idx].setAttribute('data-sortable-handle', 'true')
      cards.push({ el: card, index: idx })
    })

    if (cards.length > 0) {
      container = cards[0].el.parentElement
      scrollContainer = container?.parentElement
    }

    if (cards.length >= 2) {
      const rect1 = cards[0].el.getBoundingClientRect()
      const rect2 = cards[1].el.getBoundingClientRect()
      cardHeight = rect2.top - rect1.top
    } else if (cards.length > 0) {
      cardHeight = cards[0].el.getBoundingClientRect().height
    }
  }

  const updatePositions = () => {
    cards.forEach((card) => {
      if (card.el === dragging) return

      let offset = 0
      const idx = card.index

      if (dragIndex < currentIndex && idx > dragIndex && idx <= currentIndex) {
        offset = -cardHeight
      } else if (dragIndex > currentIndex && idx >= currentIndex && idx < dragIndex) {
        offset = cardHeight
      }

      card.el.style.transition = 'transform 0.3s ease'
      card.el.style.transform = offset ? `translateY(${offset}px)` : ''
    })
  }

  const saveOrder = () => {
    if (dragIndex === currentIndex || dragIndex < 0 || currentIndex < 0) return

    const items = JSON.parse(storage.getItem('cards') || '[]')
    const [moved] = items.splice(dragIndex, 1)
    items.splice(currentIndex, 0, moved)

    storage.removeItem('cards')
    storage.setItem('cards', JSON.stringify(items))
  }

  const disableScroll = () => {
    if (container) {
      container.style.scrollSnapType = 'none'
      container.style.overflow = 'hidden'
      container.style.touchAction = 'none'
    }
    if (scrollContainer) {
      scrollContainer.style.overflow = 'hidden'
      scrollContainer.style.touchAction = 'none'
    }
    body.style.touchAction = 'none'
  }

  const enableScroll = () => {
    if (container) {
      container.style.scrollSnapType = 'y mandatory'
      container.style.overflow = ''
      container.style.touchAction = ''
    }
    if (scrollContainer) {
      scrollContainer.style.overflow = 'auto'
      scrollContainer.style.touchAction = ''
    }
    body.style.touchAction = ''
  }

  const onStart = (e, clientY) => {
    if (isSearchActive()) return false

    markCards()

    const handle = e.target?.closest('[data-sortable-handle]')
    if (!handle) return false

    const card = handle.closest('[data-sortable-card]')
    if (!card) return false

    dragIndex = parseInt(card.getAttribute('data-index'))
    currentIndex = dragIndex
    dragging = card
    startY = clientY

    card.style.zIndex = '9999'
    card.style.transition = 'none'
    card.style.transform = 'scale(1.02)'
    card.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.15), 8px 8px 16px #0a0a0a'

    disableScroll()
    vibrate(50)

    return true
  }

  const onMove = (clientY) => {
    if (!dragging) return

    const deltaY = clientY - startY
    dragging.style.transform = `translateY(${deltaY}px) scale(1.02)`

    const newIndex = Math.max(0, Math.min(cards.length - 1,
      dragIndex + Math.round(deltaY / cardHeight)
    ))

    if (newIndex !== currentIndex) {
      currentIndex = newIndex
      updatePositions()
      vibrate(10)
    }
  }

  const onEnd = () => {
    if (!dragging) return

    cards.forEach((card) => {
      card.el.style.transform = ''
      card.el.style.transition = ''
      card.el.style.zIndex = ''
      card.el.style.boxShadow = ''
    })

    enableScroll()
    saveOrder()

    dragging = null
    dragIndex = -1
    currentIndex = -1
  }

  body.addEventListener('mousedown', (e) => {
    if (onStart(e, e.clientY)) e.preventDefault()
  })
  body.addEventListener('mousemove', (e) => {
    if (dragging) {
      e.preventDefault()
      onMove(e.clientY)
    }
  })
  body.addEventListener('mouseup', onEnd)
  body.addEventListener('mouseleave', onEnd)

  body.addEventListener('touchstart', (e) => {
    if (onStart(e, e.touches[0].clientY)) e.preventDefault()
  }, { passive: false })
  body.addEventListener('touchmove', (e) => {
    if (dragging) {
      e.preventDefault()
      onMove(e.touches[0].clientY)
    }
  }, { passive: false })
  body.addEventListener('touchend', onEnd)
  body.addEventListener('touchcancel', onEnd)
}
