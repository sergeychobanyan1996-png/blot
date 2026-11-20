import { useState } from 'react';
import { type Card, type Strain, type Suit, rankStrength, sameCard } from '../engine/cards';
import type { Combo } from '../engine/combos';
import type { BazarAction, BazarOptions, Bid } from '../engine/bazar';
import type { PlayedCard } from '../engine/tricks';
import { type Lang, type Strings, SUIT_SYMBOL, isRed, strainName } from './i18n';

const SUIT_ORDER: Suit[] = ['S', 'H', 'C', 'D'];

export function sortHand(hand: readonly Card[], trump: Suit | null): Card[] {
  return [...hand].sort(
    (a, b) =>
      SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) ||
      rankStrength(b.rank, b.suit === trump) - rankStrength(a.rank, a.suit === trump),
  );
}

export function CardView({
  card,
  playable,
  dimmed,
  onClick,
  small,
}: {
  card: Card;
  playable?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  small?: boolean;
}) {
  const cls = ['card', isRed(card.suit) ? 'red' : 'black', playable ? 'playable' : '', dimmed ? 'dimmed' : '', small ? 'small' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} onClick={playable ? onClick : undefined} disabled={!playable} aria-label={`${card.rank}${card.suit}`}>
      <span className="corner">
        {card.rank}
        <br />
        {SUIT_SYMBOL[card.suit]}
      </span>
      <span className="pip">{SUIT_SYMBOL[card.suit]}</span>
    </button>
  );
}

export function CardBacks({ count, vertical }: { count: number; vertical?: boolean }) {
  return (
    <div className={`backs ${vertical ? 'vertical' : ''}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card back" />
      ))}
    </div>
  );
}

export function HandView({
  hand,
  legal,
  trump,
  onPlay,
}: {
  hand: readonly Card[];
  legal: readonly Card[];
  trump: Suit | null;
  onPlay: (c: Card) => void;
}) {
  const active = legal.length > 0;
  return (
    <div className="hand">
      {sortHand(hand, trump).map((c) => {
        const ok = legal.some((l) => sameCard(l, c));
        return <CardView key={`${c.rank}${c.suit}`} card={c} playable={ok} dimmed={active && !ok} onClick={() => onPlay(c)} />;
      })}
    </div>
  );
}

/** Center of the table; `positionOf` maps a seat to bottom/left/top/right. */
export function TrickView({
  trick,
  positionOf,
}: {
  trick: readonly PlayedCard[];
  positionOf: (seat: number) => string;
}) {
  return (
    <div className="trick">
      {trick.map((p) => (
        <div key={p.seat} className={`trick-card pos-${positionOf(p.seat)}`}>
          <CardView card={p.card} small />
        </div>
      ))}
    </div>
  );
}

export function StrainLabel({ strain, lang }: { strain: Strain; lang: Lang }) {
  if (strain === 'NT') return <span className="strain">{strainName(lang, 'NT')}</span>;
  return (
    <span className={`strain ${isRed(strain) ? 'red' : 'black'}`} title={strainName(lang, strain)}>
      {SUIT_SYMBOL[strain]}
    </span>
  );
}

export function BidLabel({ bid, lang, t }: { bid: Bid; lang: Lang; t: Strings }) {
  return (
    <span className="bid-label">
      {bid.level} <StrainLabel strain={bid.strain} lang={lang} />
      {bid.kaput && <> {t.kaput}</>}
    </span>
  );
}

export function ActionBubble({ action, lang, t }: { action: BazarAction | undefined; lang: Lang; t: Strings }) {
  if (!action) return null;
  return (
    <div className={`bubble ${action.type}`}>
      {action.type === 'pass' && t.pass}
      {action.type === 'contra' && t.contra}
      {action.type === 'sur' && t.sur}
      {action.type === 'bid' && <BidLabel bid={action.bid} lang={lang} t={t} />}
    </div>
  );
}

const STRAINS: Strain[] = ['S', 'H', 'D', 'C', 'NT'];

export function BazarPanel({
  options,
  lang,
  t,
  onAction,
}: {
  options: BazarOptions;
  lang: Lang;
  t: Strings;
  onAction: (a: BazarAction) => void;
}) {
  const min = options.minLevel ?? 8;
  const [level, setLevel] = useState(min);
  const [kaput, setKaput] = useState(false);
  const lvl = Math.max(level, min);
  const isKaput = kaput || options.mustKaput;
  return (
    <div className="panel bazar-panel">
      {options.minLevel !== null && (
        <>
          <div className="level-row">
            <button className="btn small" onClick={() => setLevel(Math.max(min, lvl - 1))} disabled={lvl <= min}>
              −
            </button>
            <span className="level">{lvl}</span>
            <button className="btn small" onClick={() => setLevel(lvl + 1)}>
              +
            </button>
            <label className="kaput-toggle">
              <input type="checkbox" checked={isKaput} disabled={options.mustKaput} onChange={(e) => setKaput(e.target.checked)} />
              {t.kaput}
            </label>
          </div>
          <div className="strain-row">
            {STRAINS.map((s) => (
              <button key={s} className="btn strain-btn" onClick={() => onAction({ type: 'bid', bid: { level: lvl, strain: s, kaput: isKaput } })}>
                {lvl} <StrainLabel strain={s} lang={lang} />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="action-row">
        {options.pass && (
          <button className="btn" onClick={() => onAction({ type: 'pass' })}>
            {t.pass}
          </button>
        )}
        {options.contra && (
          <button className="btn warn" onClick={() => onAction({ type: 'contra' })}>
            {t.contra}
          </button>
        )}
        {options.sur && (
          <button className="btn warn" onClick={() => onAction({ type: 'sur' })}>
            {t.sur}
          </button>
        )}
      </div>
    </div>
  );
}

export function comboText(c: Combo, t: Strings): string {
  if (c.kind === 'carre') return `${t.carre} ${c.rank}`;
  const name = c.value === 100 ? t.hundred : c.value === 50 ? t.fifty : t.terz;
  return `${name} ${SUIT_SYMBOL[c.suit]}`;
}

export function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">{children}</div>
    </div>
  );
}
