import { findCardsByHandle, findElementByText, getDocument, setDocument } from './dom.js'
import { ROW_GAP, ROW_MAX_HEIGHT } from '../styles.js'

const PLACEHOLDER = 'Search...'

let initialized = false
let input = null
let isFiltering = false

// libs/sortable.js asks before starting a drag: while the list is filtered the
// visible rows are not the array order, so a drop would move the wrong action.
export const isSearchActive = () => isFiltering

// focus = the tap landed on the search box itself, so swap the placeholder for
// a real input right away instead of waiting for the next click.
export const initSearch = (e, focus = false) => {
  if (!setDocument(e)) return

  if (!initialized) {
    initialized = true
    setup()
  }

  if (focus) open()
}

let open = () => {}

const setup = () => {
  const doc = getDocument()
  let textElement = null
  let searchContainer = null

  const findPlaceholder = () => {
    textElement = findElementByText(PLACEHOLDER)
    if (!textElement) return false
    searchContainer = textElement.parentElement
    return true
  }

  const injectStyles = () => {
    if (doc.querySelector('#http-search')) return
    const style = doc.createElement('style')
    style.id = 'http-search'
    style.textContent = `
      input[type="search"]::placeholder { color: rgba(255, 255, 255, 0.5); }
      input[type="search"]:focus { outline: none; }
      /* The default clear button is a dark grey glyph — invisible on the glass
         field, so it is redrawn in white. Commas would need escaping inside the
         data URI, hence fill-opacity instead of an rgba() fill. */
      input[type="search"]::-webkit-search-cancel-button {
        -webkit-appearance: none;
        height: 16px; width: 16px; cursor: pointer;
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white' fill-opacity='0.75'%3E%3Cpath d='M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'/%3E%3C/svg%3E") center/contain no-repeat;
      }
      *::-webkit-scrollbar { display: none; }
    `
    doc.head.appendChild(style)
  }

  let countEl = null
  let totalCount = 0

  const updateCounter = (matching, total) => {
    if (!countEl) return
    totalCount = total ?? totalCount
    countEl.textContent = input?.value && matching !== totalCount
      ? `${matching}/${totalCount}`
      : totalCount.toString()
  }

  const createInput = () => {
    if (!textElement || input) return

    // Already anchored by SEARCH_COUNT — only its text changes from here.
    countEl = textElement.nextElementSibling
    totalCount = findCardsByHandle().cards.length

    input = doc.createElement('input')
    input.type = 'search'
    input.placeholder = PLACEHOLDER
    input.style.cssText = `
      flex: 1; min-width: 0; border: none; padding: 0; margin: 0;
      font-size: 16px; line-height: 20px; outline: none;
      background: transparent; color: white; font-family: inherit;
    `

    injectStyles()
    input.addEventListener('input', onSearch)
    // Hidden, not replaced: React still holds this node and uses it as the
    // insertion reference when the count appears or goes, and it cannot insert
    // before a node that is no longer in the document.
    textElement.style.display = 'none'
    searchContainer.appendChild(input)
    input.focus()
    onSearch()
  }

  // A re-render can rebuild the search box around the input. Put it back rather
  // than build a second one, so the query survives.
  const reattach = () => {
    if (textElement?.isConnected && input.isConnected) return
    if (!findPlaceholder()) return
    textElement.style.display = 'none'
    if (!input.isConnected) searchContainer.appendChild(input)
  }

  let emptyEl = null

  const createEmptyEl = (container) => {
    if (emptyEl || !container) return
    emptyEl = doc.createElement('div')
    emptyEl.textContent = 'No actions found'
    emptyEl.style.cssText = `
      padding: 40px 20px; text-align: center;
      color: rgba(255, 255, 255, 0.7); font-size: 14px; display: none;
    `
    container.appendChild(emptyEl)
  }

  // animate = a keystroke, so the rows slide; a re-render re-applies the filter
  // to freshly built rows, which has to be instant or they flash in.
  const setVisible = (card, visible, animate) => {
    card.style.transition = animate
      ? 'max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease'
      : 'none'
    card.style.maxHeight = visible ? ROW_MAX_HEIGHT : '0px'
    card.style.opacity = visible ? '1' : '0'
    card.style.marginBottom = visible ? ROW_GAP : '0px'
  }

  const matches = (text, query) => {
    try {
      return new RegExp(query, 'i').test(text)
    } catch {
      return text.toLowerCase().indexOf(query.toLowerCase()) !== -1
    }
  }

  const filter = (animate) => {
    const query = input?.value?.trim() || ''
    const { cards, handles } = findCardsByHandle()

    createEmptyEl(cards[0]?.parentElement)

    let visibleCount = 0
    cards.forEach((card) => {
      card.setAttribute('data-filterable', 'true')
      const visible = !query || matches(card.textContent || '', query)
      if (visible) visibleCount++
      setVisible(card, visible, animate)
    })

    // A drag handle on a filtered list would reorder the wrong row.
    handles.forEach((handle) => { handle.style.opacity = query ? '0' : '1' })

    isFiltering = !!query
    if (emptyEl) emptyEl.style.display = visibleCount === 0 ? 'block' : 'none'
    updateCounter(visibleCount, cards.length)
  }

  const onSearch = () => filter(true)

  open = () => {
    if (input) {
      input.focus()
      return
    }
    if (findPlaceholder()) createInput()
  }

  // A storage write re-renders the list, which brings rows back unfiltered.
  setInterval(() => {
    if (!input) return
    reattach()
    const cards = findCardsByHandle().cards
    const isNew = cards.some((card) => !card.hasAttribute('data-filterable'))
    if (!isNew && cards.length === totalCount) return
    filter(false)
  }, 100)
}
