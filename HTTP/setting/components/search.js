import { initSearch } from '../libs/search.js'
import { SEARCH_BOX, SEARCH_COUNT, SEARCH_ICON, SEARCH_PLACEHOLDER } from '../styles.js'

// A DSL placeholder, not a real field: libs/search.js finds this 'Search...'
// text on the first tap and swaps it for an <input type="search">.
export const Search = (count) => {
  return View({ style: SEARCH_BOX, onClick: (e) => initSearch(e, true) }, [
    Text({ style: SEARCH_ICON }, '🔍'),
    Text({ style: SEARCH_PLACEHOLDER }, 'Search...'),
    count > 0 && Text({ style: SEARCH_COUNT }, count.toString()),
  ])
}
