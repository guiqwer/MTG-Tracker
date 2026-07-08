import { Elysia, t } from 'elysia'
import { searchCards } from '../lib/scryfall'
import { importCard } from '../lib/cards'

export const cards = new Elysia({ prefix: '/cards' })
  // Live search against Scryfall. `commanders=true` restricts to legal commanders
  // (deck picker); omitted/false searches any card (event card picker).
  .get(
    '/search',
    ({ query }) =>
      searchCards(query.q ?? '', { commandersOnly: query.commanders === 'true' }),
    {
      query: t.Object({ q: t.String(), commanders: t.Optional(t.String()) }),
    },
  )
  // Persist a card locally by Scryfall id.
  .post('/import', ({ body }) => importCard(body.scryfallId), {
    body: t.Object({ scryfallId: t.String() }),
  })
