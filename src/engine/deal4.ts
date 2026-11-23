// One deal of Բազառ-Բլոտ: deal → bazar → 8 tricks (with combinations announced and shown) → score.

import { type Card, makeDeck, sameCard, trumpOf } from './cards';
import { type BazarAction, type BazarState, type Contract, applyBazar, contractOf, newBazar, teamOf4 } from './bazar';
import type { ComboResolution } from './combos';
import {
  type Declarations,
  type DeclareStage,
  announce,
  beforePlay,
  declareStage,
  newDeclarations,
  resolveDeclared,
  settleAnnouncements,
  show,
} from './declare';
import { type Rng, shuffle } from './rng';
import { type Score4, type DealTally, score4 } from './scoring';
import { type PlayedCard, type TrickRecord, legalCards, winningIndex } from './tricks';
import { tallyTricks } from './tally';

export interface Deal4 {
  dealer: number;
  phase: 'bazar' | 'play' | 'done' | 'redeal';
  hands: Card[][];
  dealtHands: Card[][];
  bazar: BazarState;
  contract: Contract | null;
  decl: Declarations | null;
  /** Final comparison of the shown combinations; set when the deal ends. */
  combos: ComboResolution | null;
  trick: PlayedCard[];
  tricks: TrickRecord[];
  turn: number;
  tally: DealTally | null;
  score: Score4 | null;
}

export const partnerOf4 = (seat: number): number => (seat + 2) % 4;
/** Seats in playing order starting left of the dealer. */
export const order4 = (dealer: number): number[] => [1, 2, 3, 4].map((i) => (dealer + i) % 4);

export function startDeal4(dealer: number, rng: Rng): Deal4 {
  const deck = shuffle(makeDeck(32), rng);
  const hands = [0, 1, 2, 3].map((i) => deck.slice(i * 8, i * 8 + 8));
  const bazar = newBazar(dealer);
  return {
    dealer,
    phase: 'bazar',
    hands,
    dealtHands: structuredClone(hands),
    bazar,
    contract: null,
    decl: null,
    combos: null,
    trick: [],
    tricks: [],
    turn: bazar.turn,
    tally: null,
    score: null,
  };
}

export function bazar4(deal: Deal4, seat: number, action: BazarAction): Deal4 {
  if (deal.phase !== 'bazar') throw new Error('Not in bazar');
  const d = structuredClone(deal);
  d.bazar = applyBazar(d.bazar, seat, action);
  d.turn = d.bazar.turn;
  if (d.bazar.phase === 'redeal') d.phase = 'redeal';
  if (d.bazar.phase === 'done') {
    d.contract = contractOf(d.bazar);
    d.decl = newDeclarations(d.dealtHands, d.contract.bid.strain, [0, 1, 0, 1]);
    d.phase = 'play';
    d.turn = (d.dealer + 1) % 4;
  }
  return d;
}

/** Whether `seat` may announce or show combinations right now (on its turn, before its card). */
export function declareStage4(deal: Deal4, seat: number): DeclareStage {
  if (deal.phase !== 'play' || seat !== deal.turn || !deal.decl) return null;
  return declareStage(deal.decl, seat, deal.tricks.length);
}

export function announce4(deal: Deal4, seat: number, picks: readonly number[]): Deal4 {
  if (deal.phase !== 'play' || seat !== deal.turn) throw new Error('Not your turn');
  return { ...deal, decl: announce(deal.decl!, seat, picks, deal.tricks.length) };
}

export function show4(deal: Deal4, seat: number): Deal4 {
  if (deal.phase !== 'play' || seat !== deal.turn) throw new Error('Not your turn');
  return { ...deal, decl: show(deal.decl!, seat, deal.tricks.length) };
}

export function legalCards4(deal: Deal4, seat: number): Card[] {
  if (deal.phase !== 'play' || seat !== deal.turn || !deal.contract) return [];
  return legalCards(deal.hands[seat], deal.trick, {
    trump: trumpOf(deal.contract.bid.strain),
    partner: partnerOf4(seat),
  });
}

export function play4(deal: Deal4, seat: number, card: Card): Deal4 {
  if (!legalCards4(deal, seat).some((c) => sameCard(c, card))) throw new Error('Illegal card');
  const d = structuredClone(deal);
  const contract = d.contract!;
  const strain = contract.bid.strain;
  d.decl = beforePlay(d.decl!, seat, d.tricks.length);
  d.hands[seat] = d.hands[seat].filter((c) => !sameCard(c, card));
  d.trick.push({ seat, card });

  if (d.trick.length < 4) {
    d.turn = (seat + 1) % 4;
    return d;
  }
  const winner = d.trick[winningIndex(d.trick, trumpOf(strain))].seat;
  d.tricks.push({ cards: d.trick, winner });
  d.trick = [];
  d.turn = winner;
  if (d.tricks.length === 1) d.decl = settleAnnouncements(d.decl, strain, order4(d.dealer));
  if (d.tricks.length === 8) {
    d.combos = resolveDeclared(d.decl, strain, order4(d.dealer), teamOf4, 2);
    d.tally = { ...tallyTricks(d.tricks, strain, teamOf4), comboRaw: d.combos.comboRaw, blotRaw: d.combos.blotRaw };
    d.score = score4(contract, d.tally);
    d.phase = 'done';
  }
  return d;
}
