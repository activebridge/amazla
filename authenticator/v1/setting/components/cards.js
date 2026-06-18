import { Card } from './card/index.js'
import { Placeholder } from './placeholder.js'

const STYLE = {
  display: 'flex',
  flexDirection: 'column',
  padding: '0 12px',
}

export const Cards = (accounts) => {
  return View({ style: STYLE }, [
    ...accounts.all.map((account) => Card(account)),
    accounts.all.length === 0 && Placeholder('No Accounts Found'),
  ])
}
