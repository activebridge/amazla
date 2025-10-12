class Action {
  constructor(settingsStorage, i) {
    this.settingsStorage = settingsStorage
    this.i = i
    this.data = JSON.parse(settingsStorage.getItem('actions') || '[]')[i] || {}
  }

  get title() { return this.data.title }
  get icon() { return this.data.icon || '▶' }
  get url() { return this.data.url }
  get method() { return this.data.method || 'GET' }
  get headers() { return this.data.headers }
  get body() { return this.data.body }
  get json() { return this.data.json || false }
  get successKey() { return this.data.successKey }
  get errorKey() { return this.data.errorKey }

  set title(value) { return this.update('title', value) }
  set icon(value) { return this.update('icon', value) }
  set url(value) { return this.update('url', value) }
  set method(value) { return this.update('method', value) }
  set headers(value) { return this.update('headers', value) }
  set body(value) { return this.update('body', value) }
  set json(value) { return this.update('json', value) }
  set successKey(value) { return this.update('successKey', value) }
  set errorKey(value) { return this.update('errorKey', value) }

  get actions() {
    return JSON.parse(this.settingsStorage.getItem('actions') || '[]')
  }

  set actions(value) {
    return this.settingsStorage.setItem('actions', JSON.stringify(value))
  }

  update(name, value) {
    const actions = this.actions
    const data = this.data
    data[name] = value
    actions[this.i] = data
    this.actions = actions
    return value
  }

  delete() {
    const actions = this.actions
    actions.splice(this.i, 1)
    this.actions = actions
  }

  moveUp() {
    if (this.i < 1) return
    const actions = this.actions;
    [actions[this.i - 1], actions[this.i]] = [actions[this.i], actions[this.i - 1]]
    this.actions = actions
  }
}

class Actions {
  constructor(settingsStorage) {
    this.settingsStorage = settingsStorage
    const items = JSON.parse(settingsStorage.getItem('actions') || '[]')
    this.all = items.map((_, i) => new Action(this.settingsStorage, i))
  }

  create(attrs = {}) {
    const items = this.all.map(a => a.data)
    items.push(attrs)
    this.settingsStorage.setItem('actions', JSON.stringify(items))
  }
}

export { Actions }
