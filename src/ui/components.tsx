import { useState, type CSSProperties, type ReactNode } from 'react';
import { type Card, type Rank, type Strain, type Suit, RANKS, SUITS, rankStrength, sameCard } from '../engine/cards';
import type { Combo } from '../engine/combos';
import type { Declarations } from '../engine/declare';
import type { BazarAction, BazarOptions, Bid } from '../engine/bazar';
import type { PlayedCard } from '../engine/tricks';
import type { DealSummary } from '../engine/match';
import { type Lang, type Strings, SUIT_SYMBOL, isRed, strainName } from './i18n';

const SUIT_ORDER: Suit[] = ['S', 'H', 'C', 'D'];

export function sortHand(hand: readonly Card[], trump: Suit | null): Card[] {
  return [...hand].sort(
    (a, b) =>
      SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) ||
      rankStrength(b.rank, b.suit === trump) - rankStrength(a.rank, a.suit === trump),
  );
}

// Pip positions (x%, y%, upside-down) for the number cards, as on a real deck.
const PIPS: Partial<Record<Rank, [number, number, boolean][]>> = {
  '7': [[30, 20, false], [70, 20, false], [50, 35, false], [30, 50, false], [70, 50, false], [30, 80, true], [70, 80, true]],
  '8': [[30, 20, false], [70, 20, false], [50, 35, false], [30, 50, false], [70, 50, false], [50, 65, true], [30, 80, true], [70, 80, true]],
  '9': [[30, 20, false], [70, 20, false], [30, 40, false], [70, 40, false], [50, 50, false], [30, 60, true], [70, 60, true], [30, 80, true], [70, 80, true]],
  '10': [[30, 20, false], [70, 20, false], [50, 30, false], [30, 40, false], [70, 40, false], [30, 60, true], [70, 60, true], [50, 70, true], [30, 80, true], [70, 80, true]],
};

/** Suit shapes drawn in a 100×100 box, so they look the same on every computer and at any size. */
function SuitShape({ suit }: { suit: Suit }) {
  switch (suit) {
    case 'H':
      return <path d="M50 92 C22 70 4 52 4 31 C4 14 16 4 30 4 C40 4 47 10 50 19 C53 10 60 4 70 4 C84 4 96 14 96 31 C96 52 78 70 50 92 Z" />;
    case 'D':
      return <path d="M50 2 L88 50 L50 98 L12 50 Z" />;
    case 'S':
      return (
        <path d="M50 3 C38 24 4 40 4 63 C4 78 15 88 29 88 C38 88 44 84 47 78 C46 88 41 93 32 97 L68 97 C59 93 54 88 53 78 C56 84 62 88 71 88 C85 88 96 78 96 63 C96 40 62 24 50 3 Z" />
      );
    case 'C':
      return (
        <>
          <circle cx="50" cy="27" r="22" />
          <circle cx="25" cy="60" r="22" />
          <circle cx="75" cy="60" r="22" />
          <path d="M42 50 L58 50 L56 70 C57 84 62 92 70 97 L30 97 C38 92 43 84 44 70 Z" />
        </>
      );
  }
}

/** A suit sign in the current text colour (red or black comes from the card or chip). */
export function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg className={`suit-icon ${className ?? ''}`} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
      <SuitShape suit={suit} />
    </svg>
  );
}

const INK = '#111';
const GOLD = '#e8b21e';
const BLUE = '#1f4e9c';
const SKIN = '#f6d8b8';

/** One half of a double-headed court figure (drawn twice, the second turned upside down). */
function CourtHalf({ rank, red, suit }: { rank: 'J' | 'Q' | 'K'; red: boolean; suit: Suit }) {
  const accent = red ? '#d0121b' : INK;
  return (
    <g strokeWidth={1.2} stroke={INK} strokeLinejoin="round">
      {/* robe */}
      <path d="M14 70 L22 44 Q50 33 78 44 L86 70 Z" fill={GOLD} />
      <path d="M22 70 L27 50 L36 48 L34 70 Z" fill={BLUE} />
      <path d="M78 70 L73 50 L64 48 L66 70 Z" fill={BLUE} />
      <path d="M41 41 L59 41 L63 70 L37 70 Z" fill={accent} />
      <path d="M50 46 L55 56 L50 66 L45 56 Z" fill={GOLD} />
      <path d="M36 40 Q50 49 64 40 L60 35 Q50 42 40 35 Z" fill="#fff" />
      {/* head */}
      {rank === 'Q' && <path d="M38 22 Q34 38 42 41 L58 41 Q66 38 62 22 Z" fill={GOLD} />}
      <circle cx="50" cy="26" r="10" fill={SKIN} />
      <path d="M46 25 h2 M52 25 h2 M48 31 q2 1.5 4 0" fill="none" strokeWidth={1} />
      {/* headwear */}
      {rank === 'K' && <path d="M38 18 L39 5 L44.5 12 L50 3 L55.5 12 L61 5 L62 18 Z" fill={GOLD} />}
      {rank === 'K' && <path d="M44 33 Q50 41 56 33 Q50 37 44 33 Z" fill={INK} />}
      {rank === 'Q' && <path d="M40 18 Q41 9 44 13 Q47 6 50 12 Q53 6 56 13 Q59 9 60 18 Z" fill={GOLD} />}
      {rank === 'J' && <path d="M37 20 Q49 4 64 15 L66 20 Z" fill={accent} />}
      {rank === 'J' && <path d="M62 15 Q74 6 78 14" fill="none" stroke={GOLD} strokeWidth={2.5} />}
      {/* what they hold */}
      {rank === 'K' && <path d="M80 8 L80 58 M75 16 L85 16" fill="none" strokeWidth={2.2} />}
      {rank === 'Q' && <circle cx="24" cy="40" r="4" fill={accent} />}
      {rank === 'Q' && <path d="M24 44 L26 60" fill="none" />}
      {rank === 'J' && <path d="M20 10 L22 60 M16 14 Q20 6 24 14" fill="none" strokeWidth={2} />}
      <g transform="translate(5 5) scale(0.15)" fill={accent} stroke="none">
        <SuitShape suit={suit} />
      </g>
    </g>
  );
}

function CourtArt({ card }: { card: Card }) {
  const rank = card.rank as 'J' | 'Q' | 'K';
  const red = isRed(card.suit);
  return (
    <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <CourtHalf rank={rank} red={red} suit={card.suit} />
      <g transform="rotate(180 50 70)">
        <CourtHalf rank={rank} red={red} suit={card.suit} />
      </g>
      <path d="M0 70 H100" stroke={INK} strokeWidth={1} />
    </svg>
  );
}

function CardFace({ card }: { card: Card }) {
  const sym = <SuitIcon suit={card.suit} />;
  const pips = PIPS[card.rank];
  const face = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  return (
    <>
      <span className="corner tl">
        <span className="rank">{card.rank}</span>
        <span className="suit">{sym}</span>
      </span>
      <span className="art">
        {pips?.map(([x, y, flip], i) => (
          <span key={i} className={`pip ${flip ? 'flip' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}>
            {sym}
          </span>
        ))}
        {card.rank === 'A' && <span className="ace">{sym}</span>}
        {face && (
          <span className="face">
            <CourtArt card={card} />
          </span>
        )}
      </span>
      <span className="corner br">
        <span className="rank">{card.rank}</span>
        <span className="suit">{sym}</span>
      </span>
    </>
  );
}

export function CardView({
  card,
  playable,
  dimmed,
  onClick,
  size,
  className,
  style,
}: {
  card: Card;
  playable?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  size?: 'small' | 'mini';
  className?: string;
  style?: CSSProperties;
}) {
  const cls = ['card', isRed(card.suit) ? 'red' : 'black', playable && 'playable', dimmed && 'dimmed', size, className]
    .filter(Boolean)
    .join(' ');
  // A div, not a button, so a card can also sit inside other buttons.
  return (
    <div
      className={cls}
      style={style}
      role={playable ? 'button' : 'img'}
      tabIndex={playable ? 0 : undefined}
      onClick={playable ? onClick : undefined}
      onKeyDown={playable ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick?.() : undefined}
      aria-label={`${card.rank}${card.suit}`}
    >
      <CardFace card={card} />
    </div>
  );
}

/**
 * Another player's hand: face-down cards, with any combination they have shown laid
 * face up in the same place (not over the table).
 */
export function CardBacks({ count, vertical, open = [], title }: { count: number; vertical?: boolean; open?: readonly Card[]; title?: string }) {
  const faces = open.slice(0, count);
  return (
    <div className={`backs ${vertical ? 'vertical' : ''} ${faces.length ? 'has-open' : ''}`} title={title}>
      {faces.map((c) => (
        <CardView key={`${c.rank}${c.suit}`} card={c} className="open" />
      ))}
      {Array.from({ length: count - faces.length }, (_, i) => (
        <div key={i} className="card back" />
      ))}
    </div>
  );
}

/** Shown combination cards a seat still holds, while they stay on view (the first two tricks). */
export function openCards(decl: Declarations | null, seat: number, tricksDone: number, played: readonly PlayedCard[]): Card[] {
  if (!decl || tricksDone > 2) return [];
  return decl.shown[seat]
    .flatMap((c) => c.cards)
    .filter((c, i, all) => all.findIndex((o) => sameCard(o, c)) === i)
    .filter((c) => !played.some((p) => sameCard(p.card, c)));
}

export function openTitle(decl: Declarations | null, seat: number, t: Strings): string | undefined {
  const shown = decl?.shown[seat];
  return shown?.length ? shown.map((c) => comboText(c, t)).join(', ') : undefined;
}

/**
 * The player's hand as a fan; cards are dealt in with a short stagger. No card is marked
 * as playable: a card that may not be played just shakes and says so.
 */
export function HandView({
  hand,
  legal,
  trump,
  onPlay,
  locked,
  illegalText,
}: {
  hand: readonly Card[];
  legal: readonly Card[];
  trump: Suit | null;
  onPlay: (c: Card) => void;
  /** Cards cannot be played yet (e.g. combinations must be announced first). */
  locked?: boolean;
  illegalText: string;
}) {
  const active = legal.length > 0 && !locked;
  const cards = sortHand(hand, trump);
  const mid = (cards.length - 1) / 2;
  const spread = Math.min(5, 36 / Math.max(1, cards.length));
  const [refused, setRefused] = useState<{ key: string; n: number } | null>(null);
  const refuse = (key: string) => {
    const n = (refused?.n ?? 0) + 1;
    // Clear first so a second tap on the same card shakes it again.
    setRefused(null);
    requestAnimationFrame(() => setRefused({ key, n }));
    setTimeout(() => setRefused((r) => (r?.n === n ? null : r)), 1600);
  };
  return (
    <div className="hand">
      {cards.map((c, i) => {
        const key = `${c.rank}${c.suit}`;
        const ok = active && legal.some((l) => sameCard(l, c));
        const off = i - mid;
        const style = {
          '--rot': `${off * spread}deg`,
          '--drop': `${Math.abs(off) * Math.abs(off) * 1.4}px`,
          '--i': i,
        } as CSSProperties;
        return (
          <CardView
            key={key}
            card={c}
            playable={active}
            onClick={() => (ok ? onPlay(c) : refuse(key))}
            className={`in-hand ${refused?.key === key ? 'refused' : ''}`}
            style={style}
          />
        );
      })}
      {refused && <div className="illegal-tip">{illegalText}</div>}
    </div>
  );
}

/** A small, stable tilt per card so a trick looks thrown rather than stacked. */
const tilt = (c: Card) => ((RANKS.indexOf(c.rank) * 7 + SUITS.indexOf(c.suit) * 13) % 13) - 6;

/**
 * Center of the table. New cards fly in from their player's side; a finished trick
 * (`collectTo` set) slides to the winner's side.
 */
export function TrickView({
  trick,
  positionOf,
  collectTo,
}: {
  trick: readonly PlayedCard[];
  positionOf: (seat: number) => string;
  collectTo?: string | null;
}) {
  return (
    <div className={`trick ${collectTo ? `collect to-${collectTo}` : ''}`}>
      {trick.map((p) => (
        <div
          key={`${p.card.rank}${p.card.suit}`}
          className={`trick-card pos-${positionOf(p.seat)}`}
          style={{ '--tilt': `${tilt(p.card)}deg` } as CSSProperties}
        >
          <CardView card={p.card} size="small" />
        </div>
      ))}
    </div>
  );
}

/** A trump/suit sign drawn like a card's suit: card-coloured symbol on a small white tile. */
export function StrainLabel({ strain, lang }: { strain: Strain; lang: Lang }) {
  if (strain === 'NT') return <span className="suit-chip nt">{strainName(lang, 'NT')}</span>;
  return (
    <span className={`suit-chip ${isRed(strain) ? 'red' : 'black'}`} title={strainName(lang, strain)} aria-label={strainName(lang, strain)}>
      <SuitIcon suit={strain} />
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

export function Bubble({ children, tone }: { children: ReactNode; tone?: 'warn' | 'gold' }) {
  return <div className={`bubble ${tone ?? ''}`}>{children}</div>;
}

export function ActionBubble({ action, lang, t }: { action: BazarAction | undefined; lang: Lang; t: Strings }) {
  if (!action) return null;
  return (
    <Bubble tone={action.type === 'contra' || action.type === 'sur' ? 'warn' : undefined}>
      {action.type === 'pass' && t.pass}
      {action.type === 'contra' && t.contra}
      {action.type === 'sur' && t.sur}
      {action.type === 'bid' && <BidLabel bid={action.bid} lang={lang} t={t} />}
    </Bubble>
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

/** Full description, for the player's own or shown combinations: "Թերզ ♥", "Չորս թուղթ J". */
export function comboText(c: Combo, t: Strings): string {
  if (c.kind === 'carre') return `${t.carre} ${c.rank}`;
  return `${comboClass(c, t)} ${SUIT_SYMBOL[c.suit]}`;
}

/** What an announcement says: only the class. */
export function comboClass(c: Combo, t: Strings): string {
  if (c.kind === 'carre') return t.carre;
  return c.value === 100 ? t.hundred : c.value === 50 ? t.fifty : t.terz;
}

/** Announce (first trick) or show (second trick) the player's combinations. */
export function DeclarePanel({
  stage,
  combos,
  t,
  onAnnounce,
  onShow,
  onSkipShow,
}: {
  stage: 'announce' | 'show';
  combos: readonly Combo[];
  t: Strings;
  onAnnounce: (picks: number[]) => void;
  onShow: () => void;
  onSkipShow: () => void;
}) {
  const [picked, setPicked] = useState<boolean[]>(() => combos.map(() => true));
  if (stage === 'show') {
    return (
      <div className="panel declare-panel">
        <div className="declare-cards">
          {combos.map((c, i) => (
            <span key={i} className="combo-chip">
              {comboText(c, t)}
            </span>
          ))}
        </div>
        <div className="action-row">
          <button className="btn primary" onClick={onShow}>
            {t.showCombos}
          </button>
          <button className="btn ghost" onClick={onSkipShow}>
            {t.dontShow}
          </button>
        </div>
        <div className="muted small-text">{t.showHint}</div>
      </div>
    );
  }
  return (
    <div className="panel declare-panel">
      <div className="muted">{t.yourCombos}</div>
      <div className="declare-cards">
        {combos.map((c, i) => (
          <label key={i} className={`combo-chip pick ${picked[i] ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={picked[i]}
              onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
            />
            {comboText(c, t)}
          </label>
        ))}
      </div>
      <div className="action-row">
        <button className="btn primary" onClick={() => onAnnounce(picked.flatMap((on, i) => (on ? [i] : [])))} disabled={!picked.some(Boolean)}>
          {t.announce}
        </button>
        <button className="btn ghost" onClick={() => onAnnounce([])}>
          {t.announceNone}
        </button>
      </div>
    </div>
  );
}

/**
 * Combination info next to a seat during the first tricks: what was announced (class only for others),
 * then the shown cards themselves.
 */
export function SeatCombos({ decl, seat, mySeat, tricksDone, t }: { decl: Declarations | null; seat: number; mySeat: number; tricksDone: number; t: Strings }) {
  if (!decl || tricksDone > 2) return null;
  const shown = decl.shown[seat];
  // Other players' shown cards are laid face up in their hand (CardBacks), not here.
  if (shown.length && seat !== mySeat) return null;
  if (shown.length) {
    const cards = shown.flatMap((c) => c.cards).filter((c, i, all) => all.findIndex((o) => sameCard(o, c)) === i);
    return (
      <div className="shown-combos" title={shown.map((c) => comboText(c, t)).join(', ')}>
        {cards.map((c) => (
          <CardView key={`${c.rank}${c.suit}`} card={c} size="mini" />
        ))}
      </div>
    );
  }
  const announced = decl.announced[seat];
  if (!announced?.length || tricksDone > 1) return null;
  // After the first trick the announcements are compared: «բոյ» (top card) decides equal classes.
  const compared = tricksDone >= 1 && decl.leader !== null;
  const wins = compared && decl.sides[seat] === decl.leader;
  const text = announced
    .map((c) => (seat === mySeat ? comboText(c, t) : compared ? comboWithBoy(c, t) : comboClass(c, t)))
    .join(' · ');
  return (
    <div className={`combo-tag ${compared ? (wins ? 'win' : 'lose') : ''}`}>
      {compared && (wins ? '✓ ' : '✗ ')}
      {text}
    </div>
  );
}

/** Class plus «բոյ» (top card), as answered when both sides announce: "Թերզ · բոյ K". */
function comboWithBoy(c: Combo, t: Strings): string {
  return c.kind === 'carre' ? `${t.carre} ${c.rank}` : `${comboClass(c, t)} · ${t.boy} ${c.top}`;
}

/** «Բլոտ» / «Ռեբլոտ» when the holder plays the trump K or Q. */
export function blotCall(decl: Declarations | null, trump: Suit | null, played: readonly PlayedCard[], seat: number, card: Card | undefined, t: Strings): string | null {
  if (!decl || !trump || !card || decl.blotSeat !== seat || card.suit !== trump || (card.rank !== 'K' && card.rank !== 'Q')) return null;
  const count = played.filter((p) => p.seat === seat && p.card.suit === trump && (p.card.rank === 'K' || p.card.rank === 'Q')).length;
  return count <= 1 ? t.blotCall : t.reblotCall;
}

export function Modal({ children }: { children: ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">{children}</div>
    </div>
  );
}

/** "Leave the game?" — guards the Menu button against accidental taps. */
export function ExitConfirm({ t, online, onStay, onLeave }: { t: Strings; online?: boolean; onStay: () => void; onLeave: () => void }) {
  return (
    <Modal>
      <h2>{t.exitTitle}</h2>
      <p className="muted">{online ? t.exitOnline : t.exitLocal}</p>
      <div className="action-row">
        <button className="btn primary" onClick={onStay}>
          {t.exitNo}
        </button>
        <button className="btn warn" onClick={onLeave}>
          {t.exitYes}
        </button>
      </div>
    </Modal>
  );
}

/** Toggles browser full screen so the table can use the whole display. */
export function FullscreenButton({ t }: { t: Strings }) {
  const toggle = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      /* not supported (e.g. some phones) */
    }
  };
  if (typeof document === 'undefined' || !document.fullscreenEnabled) return null;
  return (
    <button className="btn ghost fullscreen-btn" onClick={toggle} title={t.fullscreen} aria-label={t.fullscreen}>
      ⛶
    </button>
  );
}

/** Every deal of the match so far: what was played, made or not, points and running score. */
export function ScoreHistory({
  history,
  mine,
  labels,
  seatName,
  lang,
  t,
  onClose,
}: {
  history: readonly DealSummary[];
  /** Side (team or seat) shown in the first column. */
  mine: number;
  labels: [string, string];
  seatName: (seat: number) => string;
  lang: Lang;
  t: Strings;
  onClose: () => void;
}) {
  const other = 1 - mine;
  return (
    <Modal>
      <h2>{t.history}</h2>
      <div className="history-scroll">
        <table className="summary history">
          <thead>
            <tr>
              <th>#</th>
              <th>{t.contract}</th>
              <th />
              <th>{labels[0]}</th>
              <th>{labels[1]}</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {t.noDealsYet}
                </td>
              </tr>
            )}
            {history.map((h, i) => {
              const c = h.contract;
              if (h.bidder === null || !c) {
                return (
                  <tr key={i} className="muted">
                    <td>{i + 1}</td>
                    <td colSpan={2}>{t.redealRow}</td>
                    <td>{h.scoresAfter[mine]}</td>
                    <td>{h.scoresAfter[other]}</td>
                  </tr>
                );
              }
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="history-contract">
                    {c.level !== undefined && <>{c.level} </>}
                    <StrainLabel strain={c.strain} lang={lang} />
                    {c.kaput && <> {t.kaput}</>}
                    {!!c.contra && <span className="warn-text"> {c.contra === 1 ? t.contra : t.sur}</span>}
                    <span className="muted"> · {seatName(c.declarer)}</span>
                  </td>
                  <td className={h.made ? 'ok-text' : 'warn-text'}>{h.made ? '✓' : '✗'}</td>
                  <td>
                    <b>{h.scoresAfter[mine]}</b> <span className="muted">+{h.points[mine]}</span>
                  </td>
                  <td>
                    <b>{h.scoresAfter[other]}</b> <span className="muted">+{h.points[other]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button className="btn primary" onClick={onClose}>
        {t.close}
      </button>
    </Modal>
  );
}

/** Small avatar circle with the player's initial. */
export function Avatar({ name, seat }: { name: string; seat: number }) {
  return <span className={`avatar a${seat}`}>{name.trim().charAt(0).toUpperCase() || '?'}</span>;
}
