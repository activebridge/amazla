import { setDocument, getDocument, findElementByText, findCardsByHandle } from './dom.js'

let initialized = false
let input = null
let isFiltering = false

export const isSearchActive = () => isFiltering

export const initSearch = (e) => {
  if (!setDocument(e)) return
  if (initialized) return
  initialized = true
  setup()
}

const setup = () => {
  const doc = getDocument()
  let textElement = null
  let searchContainer = null

  const findSearchPlaceholder = () => {
    textElement = findElementByText('Search...')
    if (textElement) {
      searchContainer = textElement.parentElement
      return true
    }
    return false
  }

  const injectStyles = () => {
    const style = doc.createElement('style')
    style.textContent = `
      input[type="search"]::placeholder { color: #6e7377; }
      input[type="search"]:focus { outline: none; }
      input[type="search"]::-webkit-search-cancel-button {
        -webkit-appearance: none;
        height: 16px;
        width: 16px;
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236e7377'%3E%3Cpath d='M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'/%3E%3C/svg%3E") center/contain no-repeat;
        cursor: pointer;
      }
      .search-container { transition: box-shadow 0.3s ease !important; }
      .search-container:focus-within { box-shadow: inset 3px 3px 6px #0d0d0d, inset -3px -3px 6px #272727, 0 0 8px rgba(138, 180, 248, 0.3) !important; }
      *::-webkit-scrollbar { display: none; }
    `
    doc.head.appendChild(style)
  }

  const createInput = () => {
    if (!textElement || input) return

    input = doc.createElement('input')
    input.type = 'search'
    input.placeholder = 'Search...'
    input.style.cssText = `
      flex: 1;
      border: none;
      padding: 0;
      margin: 0;
      font-size: 16px;
      line-height: 20px;
      outline: none;
      background: transparent;
      color: #e8eaed;
      min-width: 0;
      width: 100%;
    `

    injectStyles()
    input.addEventListener('input', onSearch)
    searchContainer.classList.add('search-container')
    textElement.parentElement.replaceChild(input, textElement)
    input.focus()
    onSearch()
  }

  let noAccountsEl = null

  const createNoAccountsEl = (container) => {
    if (noAccountsEl || !container) return

    noAccountsEl = doc.createElement('div')
    noAccountsEl.textContent = 'No Accounts Found'
    noAccountsEl.style.cssText = `
      padding: 40px 20px;
      text-align: center;
      color: #6e7377;
      font-size: 14px;
      display: none;
    `
    container.appendChild(noAccountsEl)
  }

  const showNoAccounts = (show) => {
    if (noAccountsEl) {
      noAccountsEl.style.display = show ? 'block' : 'none'
    }
  }

  const showCard = (card) => {
    if (card.dataset.hidden === 'true') {
      card.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease'
      card.style.maxHeight = '200px'
      card.style.opacity = '1'
      card.style.marginBottom = '12px'
      card.dataset.hidden = 'false'
    }
  }

  const hideCard = (card) => {
    if (card.dataset.hidden !== 'true') {
      card.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease'
      card.style.maxHeight = '0px'
      card.style.opacity = '0'
      card.style.marginBottom = '0px'
      card.dataset.hidden = 'true'
    }
  }

  const matchesQuery = (text, query) => {
    try {
      return new RegExp(query, 'i').test(text)
    } catch {
      return text.toLowerCase().includes(query.toLowerCase())
    }
  }

  const onSearch = () => {
    const query = input?.value?.trim() || ''
    const { cards, handles } = findCardsByHandle()

    createNoAccountsEl(cards[0]?.parentElement)

    // Mark cards as filterable
    cards.forEach(card => card.setAttribute('data-filterable', 'true'))

    // Toggle handle visibility
    handles.forEach(handle => {
      handle.style.opacity = query ? '0' : '1'
    })

    // Filter cards
    let visibleCount = 0
    cards.forEach(card => {
      const visible = !query || matchesQuery(card.textContent || '', query)
      if (visible) {
        showCard(card)
        visibleCount++
      } else {
        hideCard(card)
      }
    })

    isFiltering = !!query
    showNoAccounts(visibleCount === 0)
  }

  const onClick = (e) => {
    if (!textElement && !findSearchPlaceholder()) return

    if (searchContainer?.contains(e.target)) {
      if (!input) {
        createInput()
      } else {
        input.focus()
      }
    }
  }

  doc.body.addEventListener('click', onClick)
}
