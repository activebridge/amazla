import { Card } from './card/index.js'
import { Placeholder } from './placeholder.js'

const STYLE = {
  display: 'flex',
  flexDirection: 'column',
  padding: '0 12px',
}

export const Cards = (cards) => {
  return View({ style: STYLE }, [
    ...cards.all.map((card) => Card(card)),
    cards.all.length === 0 && Placeholder('No Cards Found'),
  ])
}
