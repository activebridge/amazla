class Account {
  constructor(settingsStorage, i) {
    this.settingsStorage = settingsStorage
    this.i = i
    this.data = JSON.parse(settingsStorage.getItem('accounts') || '[]')[i] || {}
  }

  get name() {
    return this.data.name
  }
  get issuer() {
    return this.data.issuer
  }
  get secret() {
    return this.data.secret
  }
  get digits() {
    return this.data.digits || 6
  }

  get displayName() {
    return this.issuer ? `${this.issuer} (${this.name})` : this.name
  }

  get accounts() {
    return JSON.parse(this.settingsStorage.getItem('accounts') || '[]')
  }

  set accounts(value) {
    this.settingsStorage.setItem('accounts', JSON.stringify(value))
  }

  delete() {
    const accounts = this.accounts
    accounts.splice(this.i, 1)
    this.accounts = accounts
  }

  showToast(message) {
    this.settingsStorage.setItem('import_status', message)
    setTimeout(() => {
      this.settingsStorage.removeItem('import_status')
    }, 3000)
  }

  moveUp() {
    if (this.i < 1) return
    const accounts = this.accounts
    ;[accounts[this.i - 1], accounts[this.i]] = [accounts[this.i], accounts[this.i - 1]]
    this.accounts = accounts
  }
}

class Accounts {
  constructor(settingsStorage) {
    this.settingsStorage = settingsStorage
    const items = JSON.parse(settingsStorage.getItem('accounts') || '[]')
    this.data = items
    this.all = items.map((_, i) => new Account(settingsStorage, i))
  }

  get secrets() {
    return new Set(this.data.map(a => a.secret))
  }

  add(newAccounts) {
    const uniqueNew = newAccounts.filter(a => !this.secrets.has(a.secret))
    if (uniqueNew.length === 0) {
      return { added: 0, message: 'Account already exists.' }
    }

    const merged = [...this.data, ...uniqueNew]
    this.settingsStorage.setItem('accounts', JSON.stringify(merged))
    return { added: uniqueNew.length, message: `Imported ${uniqueNew.length} account(s)!` }
  }

  clear() {
    this.settingsStorage.removeItem('accounts')
  }
}

export { Account, Accounts }
