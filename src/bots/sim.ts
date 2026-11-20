// Lightweight mutable deal simulator for bot playouts (no cloning per card, unlike the engine).

import { type Card, type Strain, LAST_TRICK_BONUS, cardPoints, sameCard, trumpOf } from '../engine/cards';
import { type PlayedCard, legalCards, winningIndex } from '../engine/tricks';
import { choosePlay } from './play';

export interface SimDeal {
  n: 2 | 4;
  strain: Strain;
  hands: Card[][];
  trick: PlayedCard[];
  turn: number;
  cardRaw: number[];
  tricksWon: number[];
  tricksDone: number;
  sideOf: (seat: number) => number;
  partnerOf: (seat: number) => number | null;
  attackingSide: number;
}

export function cloneSim(s: SimDeal): SimDeal {
  return {
    ...s,
    hands: s.hands.map((h) => h.slice()),
    trick: s.trick.slice(),
    cardRaw: s.cardRaw.slice(),
    tricksWon: s.tricksWon.slice(),
  };
}

export function simLegal(s: SimDeal): Card[] {
  return legalCards(s.hands[s.turn], s.trick, { trump: trumpOf(s.strain), partner: s.partnerOf(s.turn) });
}

export function simStep(s: SimDeal, card: Card): void {
  const seat = s.turn;
  const hand = s.hands[seat];
  hand.splice(
    hand.findIndex((c) => sameCard(c, card)),
    1,
  );
  s.trick.push({ seat, card });
  if (s.trick.length < s.n) {
    s.turn = (seat + 1) % s.n;
    return;
  }
  const winner = s.trick[winningIndex(s.trick, trumpOf(s.strain))].seat;
  const side = s.sideOf(winner);
  s.tricksWon[side]++;
  s.cardRaw[side] += s.trick.reduce((sum, p) => sum + cardPoints(p.card, s.strain), 0);
  s.tricksDone++;
  if (s.tricksDone === 8) s.cardRaw[side] += LAST_TRICK_BONUS;
  s.trick = [];
  s.turn = winner;
}

/** Plays the deal to the end with the heuristic policy for every seat. */
export function playOut(s: SimDeal): void {
  while (s.tricksDone < 8) {
    const legal = simLegal(s);
    const seat = s.turn;
    const card =
      legal.length === 1
        ? legal[0]
        : choosePlay({
            hand: s.hands[seat],
            legal,
            trick: s.trick,
            strain: s.strain,
            seat,
            partner: s.partnerOf(seat),
            trickSize: s.n,
            attacking: s.sideOf(seat) === s.attackingSide,
            unseen: s.hands.flatMap((h, i) => (i === seat ? [] : h)),
          });
    simStep(s, card);
  }
}
