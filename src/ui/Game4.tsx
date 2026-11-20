import { useEffect, useState, type ReactNode } from 'react';
import { type Card, trumpOf } from '../engine/cards';
import { type BazarAction, bazarOptions, teamOf4 } from '../engine/bazar';
import { type Deal4, legalCards4 } from '../engine/deal4';
import { type Match4, type Target, bazarMove4, newMatch4, playMove4 } from '../engine/match';
import { type BotLevel, botBazar4, botPlay4 } from '../bots';
import { type Lang, type Strings, STRINGS } from './i18n';
import { ActionBubble, BazarPanel, BidLabel, CardBacks, HandView, Modal, TrickView, comboText } from './components';
import { BOT_DELAY_MS, type Pacing, useTablePacing } from './useTablePacing';

const POS = ['bottom', 'left', 'top', 'right'];

export interface Table4Props {
  lang: Lang;
  match: Match4;
  mySeat: number;
  pacing: Pacing<Deal4>;
  seatName: (seat: number) => string;
  /** Extra note under a seat name (e.g. "offline"). */
  seatNote?: (seat: number) => string | null;
  onBazar: (a: BazarAction) => void;
  onPlay: (c: Card) => void;
  onExit: () => void;
  /** Buttons for the match-over dialog. */
  endActions: ReactNode;
  /** Shown in the deal result while other players are still reading it. */
  waitingNote?: string | null;
}

/** The 4-player table, used by both the local game and online rooms. */
export function Table4({ lang, match, mySeat, pacing, seatName, seatNote, onBazar, onPlay, onExit, endActions, waitingNote }: Table4Props) {
  const t = STRINGS[lang];
  const positionOf = (seat: number) => POS[(seat - mySeat + 4) % 4];
  const myTeam = teamOf4(mySeat);
  const deal: Deal4 = pacing.summary ?? match.deal;
  const paused = pacing.summary !== null || pacing.holding || match.winner !== null;

  const b = deal.bazar;
  const humanOptions = deal.phase === 'bazar' && !paused ? bazarOptions(b, mySeat) : null;
  const showPanel = humanOptions && (humanOptions.pass || humanOptions.contra || humanOptions.sur);
  const lastAction = (seat: number): BazarAction | undefined =>
    [...b.history].reverse().find((h) => h.seat === seat)?.action;
  const shownTrick =
    pacing.holding || (pacing.summary && deal.tricks.length === 8) ? deal.tricks[deal.tricks.length - 1]?.cards ?? [] : deal.trick;
  const trump = deal.contract ? trumpOf(deal.contract.bid.strain) : null;
  const legal = !paused ? legalCards4(match.deal, mySeat) : [];
  const showCombos = deal.phase === 'play' && deal.tricks.length < 2 && deal.combos;

  const seatBlock = (seat: number) => (
    <div key={seat} className={`seat seat-${positionOf(seat)} ${deal.turn === seat && deal.phase !== 'done' ? 'active' : ''}`}>
      <div className="seat-name">
        {seatName(seat)}
        {deal.dealer === seat && (
          <span className="dealer-chip" title={t.dealer}>
            D
          </span>
        )}
      </div>
      {seatNote?.(seat) && <div className="seat-note">{seatNote(seat)}</div>}
      {seat !== mySeat && <CardBacks count={deal.hands[seat].length} vertical={positionOf(seat) !== 'top'} />}
      {deal.phase === 'bazar' && <ActionBubble action={lastAction(seat)} lang={lang} t={t} />}
      {showCombos && deal.combos!.perSeat[seat].length > 0 && (
        <div className={`combo-tag ${deal.combos!.winnerTeam === teamOf4(seat) ? 'win' : 'lose'}`}>
          {deal.combos!.perSeat[seat].map((c) => comboText(c, t)).join(', ')}
        </div>
      )}
    </div>
  );

  return (
    <div className="game">
      <header className="topbar">
        <button className="btn ghost" onClick={onExit}>
          ← {t.menu}
        </button>
        <div className="scores">
          <span>
            {t.us}: <b>{match.scores[myTeam]}</b>
          </span>
          <span>
            {t.them}: <b>{match.scores[1 - myTeam]}</b>
          </span>
          <span className="muted">/ {match.target}</span>
        </div>
        <div className="contract">
          {deal.contract && (
            <>
              {t.contract}: <BidLabel bid={deal.contract.bid} lang={lang} t={t} /> · {seatName(deal.contract.declarer)}
              {deal.contract.contra > 0 && <span className="warn-text"> ×{deal.contract.contra === 1 ? t.contra : t.sur}</span>}
            </>
          )}
        </div>
      </header>

      <div className="table four">
        {[0, 1, 2, 3].map(seatBlock)}
        <div className="center">
          <TrickView trick={shownTrick} positionOf={positionOf} />
          {pacing.redealNotice && <div className="notice">{t.redeal}</div>}
        </div>
      </div>

      <div className="bottom">
        {showPanel && <BazarPanel key={`${b.history.length}`} options={humanOptions!} lang={lang} t={t} onAction={onBazar} />}
        {legal.length > 0 && <div className="turn-hint">{t.yourTurn}</div>}
        <HandView hand={deal.hands[mySeat]} legal={legal} trump={trump} onPlay={onPlay} />
      </div>

      {pacing.summary && (
        <DealSummary4
          deal={pacing.summary}
          scoresAfter={match.history[match.history.length - 1].scoresAfter}
          myTeam={myTeam}
          t={t}
          lang={lang}
          onClose={pacing.closeSummary}
          seatName={seatName}
        />
      )}
      {match.winner !== null && !pacing.summary && (
        <Modal>
          <h2>{match.winner === myTeam ? t.youWin : t.youLose}</h2>
          <p className="big-score">
            {match.scores[myTeam]} : {match.scores[1 - myTeam]}
          </p>
          {endActions}
        </Modal>
      )}
      {waitingNote && !pacing.summary && <div className="toast">{waitingNote}</div>}
    </div>
  );
}

function DealSummary4({
  deal,
  scoresAfter,
  myTeam,
  t,
  lang,
  onClose,
  seatName,
}: {
  deal: Deal4;
  scoresAfter: number[];
  myTeam: number;
  t: Strings;
  lang: Lang;
  onClose: () => void;
  seatName: (s: number) => string;
}) {
  const s = deal.score!;
  const tally = deal.tally!;
  const c = deal.contract!;
  const row = (label: string, v: number[]) => (
    <tr>
      <td>{label}</td>
      <td>{v[myTeam]}</td>
      <td>{v[1 - myTeam]}</td>
    </tr>
  );
  return (
    <Modal>
      <h2>{t.dealResult}</h2>
      <p>
        <BidLabel bid={c.bid} lang={lang} t={t} /> · {seatName(c.declarer)} ·{' '}
        <b className={s.made ? 'ok-text' : 'warn-text'}>{s.made ? t.made : t.failed}</b>
        {s.tharsKaput && <b className="warn-text"> · {t.tharsKaput}</b>}
        {s.kaput && !s.tharsKaput && <b> · {t.kaput}</b>}
      </p>
      <table className="summary">
        <thead>
          <tr>
            <th />
            <th>{t.us}</th>
            <th>{t.them}</th>
          </tr>
        </thead>
        <tbody>
          {row(t.tricks, tally.tricksWon)}
          {row(t.cards, tally.cardRaw)}
          {row(t.combos, tally.comboRaw)}
          {row(t.blotBonus, tally.blotRaw)}
          {row(t.points, s.points)}
          {row(t.total, scoresAfter)}
        </tbody>
      </table>
      <button className="btn primary" onClick={onClose}>
        {t.continue}
      </button>
    </Modal>
  );
}

// ---------------------------------------------------------------- local game against bots

const HUMAN = 0;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export function Game4({ lang, target, level, onExit }: { lang: Lang; target: Target; level: BotLevel; onExit: () => void }) {
  const t = STRINGS[lang];
  const [match, setMatch] = useState<Match4>(() => newMatch4(target, newSeed()));
  const lastWasRedeal = match.history.length > 0 && match.history[match.history.length - 1].bidder === null;
  const pacing = useTablePacing(match.history.length, match.deal.tricks.length, match.lastDeal, lastWasRedeal);
  const paused = pacing.summary !== null || pacing.holding || match.winner !== null;
  const seatName = (seat: number) => (seat === HUMAN ? t.you : seat === 2 ? t.partner : `${t.bot} ${seat}`);

  // Bots move on their own turn; in awaitSur the declarer decides unless the human is on that team.
  useEffect(() => {
    if (paused) return undefined;
    const d = match.deal;
    let move: ((m: Match4) => Match4) | null = null;
    if (d.phase === 'bazar') {
      const b = d.bazar;
      const seat = b.phase === 'awaitSur' ? b.current!.seat : b.turn;
      const humanDecides = b.phase === 'awaitSur' ? teamOf4(seat) === teamOf4(HUMAN) : seat === HUMAN;
      if (!humanDecides) {
        const action = botBazar4(b, seat, d.hands[seat], level);
        if (action) move = (m) => bazarMove4(m, seat, action);
      }
    } else if (d.phase === 'play' && d.turn !== HUMAN) {
      const seat = d.turn;
      move = (m) => playMove4(m, seat, botPlay4(m.deal, seat, level));
    }
    if (!move) return undefined;
    const id = setTimeout(() => setMatch(move!), BOT_DELAY_MS);
    return () => clearTimeout(id);
  }, [match, paused, level]);

  return (
    <Table4
      lang={lang}
      match={match}
      mySeat={HUMAN}
      pacing={pacing}
      seatName={seatName}
      onBazar={(a) => setMatch((m) => bazarMove4(m, HUMAN, a))}
      onPlay={(c) => setMatch((m) => playMove4(m, HUMAN, c))}
      onExit={onExit}
      endActions={
        <>
          <button className="btn primary" onClick={() => setMatch(newMatch4(target, newSeed()))}>
            {t.playAgain}
          </button>
          <button className="btn ghost" onClick={onExit}>
            {t.menu}
          </button>
        </>
      }
    />
  );
}
