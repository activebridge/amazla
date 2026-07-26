class Card {
  constructor(settingsStorage, i) {
    this.settingsStorage = settingsStorage
    this.i = i
    this.data = JSON.parse(settingsStorage.getItem('cards') || '[]')[i] || {}
  }

  get title() {
    return this.data.title || ''
  }
  get code() {
    return this.data.code || ''
  }
  get type() {
    return this.data.type || 'ean13'
  }
  get index() {
    return this.i
  }
  get color() {
    return this.data.color
  }

  get displayCode() {
    return this.type === 'ean13' && this.code ? String(this.code).padStart(13, '0') : this.code
  }

  get cards() {
    return JSON.parse(this.settingsStorage.getItem('cards') || '[]')
  }

  set cards(value) {
    this.settingsStorage.setItem('cards', JSON.stringify(value))
  }

  save(key, value) {
    const cards = this.cards
    if (!cards[this.i]) return
    cards[this.i][key] = value
    this.cards = cards
  }

  delete() {
    const cards = this.cards
    cards.splice(this.i, 1)
    this.cards = cards
  }

  moveUp() {
    if (this.i < 1) return
    const cards = this.cards
    ;[cards[this.i - 1], cards[this.i]] = [cards[this.i], cards[this.i - 1]]
    this.cards = cards
  }
}

class Cards {
  constructor(settingsStorage) {
    this.settingsStorage = settingsStorage
    const items = JSON.parse(settingsStorage.getItem('cards') || '[]')
    this.data = items
    this.all = items.map((_, i) => new Card(settingsStorage, i))
  }

  add(card = {}) {
    const merged = [...this.data, card]
    this.settingsStorage.setItem('cards', JSON.stringify(merged))
  }

  clear() {
    this.settingsStorage.removeItem('cards')
  }
}

export { Card, Cards }
