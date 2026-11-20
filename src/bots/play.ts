// Card-play heuristic shared by the 2- and 4-player bots. Always returns a legal card.

import { type Card, type Strain, cardPoints, rankStrength, trumpOf } from '../engine/cards';
import { type PlayedCard, winningIndex } from '../engine/tricks';

export interface PlayView {
  hand: readonly Card[];
  legal: readonly Card[];
  trick: readonly PlayedCard[];
  strain: Strain;
  seat: number;
  partner: number | null;
  trickSize: number;
  /** This bot's side made the contract / chose trump. */
  attacking: boolean;
}

export function choosePlay(v: PlayView): Card {
  const trump = trumpOf(v.strain);
  const pts = (c: Card) => cardPoints(c, v.strain);
  const str = (c: Card) => rankStrength(c.rank, c.suit === trump);
  const isTrump = (c: Card) => c.suit === trump;
  const cheapest = (cards: readonly Card[]) =>
    [...cards].sort((a, b) => Number(isTrump(a)) - Number(isTrump(b)) || pts(a) - pts(b) || str(a) - str(b))[0];
  const richest = (cards: readonly Card[]) =>
    [...cards].sort((a, b) => Number(isTrump(a)) - Number(isTrump(b)) || pts(b) - pts(a))[0];
  const strongest = (cards: readonly Card[]) => [...cards].sort((a, b) => str(b) - str(a))[0];

  if (v.trick.length === 0) return lead(v, trump, cheapest, strongest);

  const win = v.trick[winningIndex(v.trick, trump)];
  const last = v.trick.length === v.trickSize - 1;
  const winners = v.legal.filter(
    (c) => winningIndex([...v.trick, { seat: v.seat, card: c }], trump) === v.trick.length,
  );

  if (v.partner !== null && win.seat === v.partner) {
    const safe = last || isTrump(win.card) || win.card.rank === 'A';
    return safe ? richest(v.legal) : cheapest(v.legal);
  }
  if (winners.length) {
    if (last) return [...winners].sort((a, b) => str(a) - str(b) || pts(a) - pts(b))[0];
    const trickPoints = v.trick.reduce((s, p) => s + pts(p.card), 0);
    const best = strongest(winners);
    return trickPoints >= 10 || !isTrump(best) ? best : cheapest(winners);
  }
  return cheapest(v.legal);
}

function lead(
  v: PlayView,
  trump: string | null,
  cheapest: (c: readonly Card[]) => Card,
  strongest: (c: readonly Card[]) => Card,
): Card {
  const trumps = v.legal.filter((c) => c.suit === trump);
  if (trump && v.attacking && trumps.length) {
    const top = strongest(trumps);
    if (top.rank === 'J' || trumps.length >= 3) return top;
  }
  const aces = v.legal.filter((c) => c.rank === 'A' && c.suit !== trump);
  if (aces.length) return aces[0];
  return cheapest(v.legal);
}
