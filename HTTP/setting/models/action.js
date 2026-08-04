class Action {
  constructor(settingsStorage, i) {
    this.settingsStorage = settingsStorage
    this.i = i
    this.data = JSON.parse(settingsStorage.getItem('actions') || '[]')[i] || {}
  }

  get index() {
    return this.i
  }
  get id() {
    return this.data.id
  }
  get title() {
    return this.data.title
  }
  get icon() {
    return this.data.icon || '▶'
  }
  get url() {
    return this.data.url
  }
  get method() {
    return this.data.method || 'GET'
  }
  get headers() {
    return this.data.headers
  }
  get body() {
    return this.data.body
  }
  get json() {
    return this.data.json || false
  }
  get successKey() {
    return this.data.successKey
  }
  get errorKey() {
    return this.data.errorKey
  }

  set title(value) {
    this.update('title', value)
  }
  set icon(value) {
    this.update('icon', value)
  }
  set url(value) {
    this.update('url', value)
  }
  set method(value) {
    this.update('method', value)
  }
  set headers(value) {
    this.update('headers', value)
  }
  set body(value) {
    this.update('body', value)
  }
  set json(value) {
    this.update('json', value)
  }
  set successKey(value) {
    this.update('successKey', value)
  }
  set errorKey(value) {
    this.update('errorKey', value)
  }

  get actions() {
    return JSON.parse(this.settingsStorage.getItem('actions') || '[]')
  }

  set actions(value) {
    this.settingsStorage.setItem('actions', JSON.stringify(value))
  }

  update(name, value) {
    const actions = this.actions
    const data = this.data
    data[name] = value
    actions[this.i] = data
    this.actions = actions
    return value
  }

  // The edit dialog hands over every field at once. Going through the setters
  // would be one storage write — and one full re-render — per field.
  save(attrs) {
    const actions = this.actions
    const data = this.data
    Object.keys(attrs).forEach((name) => {
      data[name] = attrs[name]
    })
    actions[this.i] = data
    this.actions = actions
  }

  // The copy lands right below the original — a clone is nearly always the
  // start of an edit, and hunting for it at the end of the list is not that.
  clone() {
    const actions = this.actions
    const copy = { ...this.data, id: String(Date.now()) }
    copy.title = `${this.data.title || 'Untitled'} copy`
    actions.splice(this.i + 1, 0, copy)
    this.actions = actions
  }

  delete() {
    const actions = this.actions
    actions.splice(this.i, 1)
    this.actions = actions
  }
}

class Actions {
  constructor(settingsStorage) {
    this.settingsStorage = settingsStorage
    const items = JSON.parse(settingsStorage.getItem('actions') || '[]')
    this.data = items
    this.all = items.map((_, i) => new Action(this.settingsStorage, i))
  }

  create(attrs = {}) {
    const items = this.all.map((a) => a.data)
    items.push(attrs)
    this.settingsStorage.setItem('actions', JSON.stringify(items))
  }
}

export { Actions }
