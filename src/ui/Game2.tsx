import { useEffect, useState, type ReactNode } from 'react';
import { type Card, trumpOf } from '../engine/cards';
import { type Deal2, type TrumpAction, declareStage2, legalCards2, trumpOptions2 } from '../engine/deal2';
import { type Match2, type Target, announceMove, autoDeclare, newMatch2, playMove2, showMove, trumpMove2 } from '../engine/match';
import { type BotLevel, botPlay2, botTrump2 } from '../bots';
import { type Lang, type Strings, STRINGS } from './i18n';
import {
  Avatar,
  Bubble,
  CardBacks,
  CardView,
  DeclarePanel,
  ExitConfirm,
  HandView,
  Modal,
  SeatCombos,
  StrainLabel,
  TrickView,
  blotCall,
} from './components';
import { BOT_DELAY_MS, type Pacing, useTablePacing } from './useTablePacing';

export interface Table2Props {
  lang: Lang;
  match: Match2;
  mySeat: number;
  pacing: Pacing<Deal2>;
  seatName: (seat: number) => string;
  seatNote?: (seat: number) => string | null;
  onTrump: (a: TrumpAction) => void;
  onPlay: (c: Card) => void;
  onAnnounce: (picks: number[]) => void;
  onShow: () => void;
  onExit: () => void;
  online?: boolean;
  endActions: ReactNode;
  waitingNote?: string | null;
}

/** Trump choice: round 1 take or pass; round 2 a suit or Բոյ, optionally taking the turned card. */
function TrumpPanel({ deal, mySeat, lang, t, onTrump }: { deal: Deal2; mySeat: number; lang: Lang; t: Strings; onTrump: (a: TrumpAction) => void }) {
  const [takeCard, setTakeCard] = useState(false);
  const opts = trumpOptions2(deal, mySeat);
  if (!opts.take && !opts.pass && opts.name.length === 0) return null;
  return (
    <div className="panel">
      {deal.phase === 'trump2' && !opts.pass && <div className="muted">{t.mustChoose}</div>}
      {opts.name.length > 0 && (
        <label className={`combo-chip pick ${takeCard ? 'on' : ''}`}>
          <input type="checkbox" checked={takeCard} onChange={(e) => setTakeCard(e.target.checked)} />
          {t.takeTurnUp}
          <CardView card={deal.turnUp} size="mini" />
        </label>
      )}
      <div className="action-row">
        {opts.take && (
          <button className="btn primary" onClick={() => onTrump({ type: 'take' })}>
            {t.take} <CardView card={deal.turnUp} size="mini" />
          </button>
        )}
        {opts.name.map((s) => (
          <button key={s} className="btn strain-btn" onClick={() => onTrump({ type: 'name', strain: s, takeCard })}>
            <StrainLabel strain={s} lang={lang} />
          </button>
        ))}
        {opts.pass && (
          <button className="btn" onClick={() => onTrump({ type: 'pass' })}>
            {t.passTrump}
          </button>
        )}
      </div>
    </div>
  );
}

/** The 2-player table, used by both the local game and online rooms. */
export function Table2(props: Table2Props) {
  const { lang, match, mySeat, pacing, seatName, seatNote, onTrump, onPlay, onAnnounce, onShow, onExit, online, endActions, waitingNote } = props;
  const t = STRINGS[lang];
  const [confirmExit, setConfirmExit] = useState(false);
  const opp = 1 - mySeat;
  const positionOf = (seat: number) => (seat === mySeat ? 'bottom' : 'top');
  const deal: Deal2 = pacing.summary ?? match.deal;
  const paused = pacing.summary !== null || pacing.holding || match.winner !== null;

  const choosing = deal.phase === 'trump1' || deal.phase === 'trump2';
  const finished = pacing.holding || (pacing.summary !== null && deal.tricks.length === 8);
  const lastTrick = deal.tricks[deal.tricks.length - 1];
  const shownTrick = finished ? lastTrick?.cards ?? [] : deal.trick;
  const collectTo = finished && lastTrick ? positionOf(lastTrick.winner) : null;
  const trump = deal.trump ? trumpOf(deal.trump) : null;
  const stage = !paused ? declareStage2(match.deal, mySeat) : null;
  const legal = !paused ? legalCards2(match.deal, mySeat) : [];
  const played = [...deal.tricks.flatMap((x) => x.cards), ...deal.trick];

  const seatBlock = (seat: number) => {
    const card = shownTrick.find((p) => p.seat === seat)?.card;
    const call = blotCall(deal.decl, trump, played, seat, card, t);
    return (
      <div className={`seat seat-${positionOf(seat)} ${deal.turn === seat && deal.phase !== 'done' && !finished ? 'active' : ''}`}>
        <div className="plate">
          <Avatar name={seatName(seat)} seat={seat} />
          <span className="plate-name">{seatName(seat)}</span>
          {deal.dealer === seat && (
            <span className="dealer-chip" title={t.dealer}>
              D
            </span>
          )}
          {deal.taker === seat && <span className="taker-chip">{t.trump}</span>}
        </div>
        {seatNote?.(seat) && <div className="seat-note">{seatNote(seat)}</div>}
        {seat === opp && <CardBacks count={deal.hands[opp].length} />}
        {call && <Bubble tone="gold">{call}</Bubble>}
        {deal.phase === 'play' && <SeatCombos decl={deal.decl} seat={seat} mySeat={mySeat} tricksDone={deal.tricks.length} t={t} />}
      </div>
    );
  };

  return (
    <div className="game">
      <header className="topbar">
        <button className="btn ghost" onClick={() => (match.winner === null ? setConfirmExit(true) : onExit())}>
          ← {t.menu}
        </button>
        <div className="scores">
          <span className="score-pill us">
            {seatName(mySeat)} <b>{match.scores[mySeat]}</b>
          </span>
          <span className="score-pill them">
            {seatName(opp)} <b>{match.scores[opp]}</b>
          </span>
          <span className="muted">/ {match.target}</span>
        </div>
        <div className="contract">
          {deal.trump && (
            <>
              {t.trump}: <StrainLabel strain={deal.trump} lang={lang} /> · {seatName(deal.taker!)}
            </>
          )}
        </div>
      </header>

      <div className="table two">
        {seatBlock(opp)}
        <div className="center">
          <div className="felt" />
          {choosing ? (
            <div className="turn-up">
              <div className="muted">{t.turnUp}</div>
              <CardView card={deal.turnUp} className="deal-in" />
            </div>
          ) : (
            <TrickView trick={shownTrick} positionOf={positionOf} collectTo={collectTo} />
          )}
        </div>
        {seatBlock(mySeat)}
      </div>

      <div className="bottom">
        {!paused && choosing && <TrumpPanel key={`${match.dealIndex}-${deal.phase}`} deal={deal} mySeat={mySeat} lang={lang} t={t} onTrump={onTrump} />}
        {stage && (
          <DeclarePanel
            key={`${match.dealIndex}-${stage}`}
            stage={stage}
            combos={stage === 'announce' ? match.deal.decl!.detected[mySeat] : match.deal.decl!.announced[mySeat]!}
            t={t}
            onAnnounce={onAnnounce}
            onShow={onShow}
          />
        )}
        {legal.length > 0 && stage !== 'announce' && <div className="turn-hint">{t.yourTurn}</div>}
        <HandView key={match.dealIndex} hand={deal.hands[mySeat]} legal={legal} trump={trump} onPlay={onPlay} locked={stage === 'announce'} />
      </div>

      {pacing.summary && (
        <DealSummary2
          deal={pacing.summary}
          scoresAfter={match.history[match.history.length - 1].scoresAfter}
          mySeat={mySeat}
          seatName={seatName}
          t={t}
          lang={lang}
          onClose={pacing.closeSummary}
        />
      )}
      {match.winner !== null && !pacing.summary && (
        <Modal>
          <h2>{match.winner === mySeat ? t.youWin : t.youLose}</h2>
          <p className="big-score">
            {match.scores[mySeat]} : {match.scores[opp]}
          </p>
          {endActions}
        </Modal>
      )}
      {confirmExit && <ExitConfirm t={t} online={online} onStay={() => setConfirmExit(false)} onLeave={onExit} />}
      {waitingNote && !pacing.summary && <div className="toast">{waitingNote}</div>}
    </div>
  );
}

function DealSummary2({
  deal,
  scoresAfter,
  mySeat,
  seatName,
  t,
  lang,
  onClose,
}: {
  deal: Deal2;
  scoresAfter: number[];
  mySeat: number;
  seatName: (s: number) => string;
  t: Strings;
  lang: Lang;
  onClose: () => void;
}) {
  const s = deal.score!;
  const tally = deal.tally!;
  const opp = 1 - mySeat;
  const row = (label: string, v: number[]) => (
    <tr>
      <td>{label}</td>
      <td>{v[mySeat]}</td>
      <td>{v[opp]}</td>
    </tr>
  );
  return (
    <Modal>
      <h2>{t.dealResult}</h2>
      <p>
        {t.trump}: <StrainLabel strain={deal.trump!} lang={lang} /> · {seatName(deal.taker!)} ·{' '}
        <b className={s.made ? 'ok-text' : 'warn-text'}>{s.made ? t.made : t.failed}</b>
        {s.kaput && <b> · {t.kaput}</b>}
      </p>
      <table className="summary">
        <thead>
          <tr>
            <th />
            <th>{seatName(mySeat)}</th>
            <th>{seatName(opp)}</th>
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

// ---------------------------------------------------------------- local game against a bot

const HUMAN = 0;
const BOT = 1;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export function Game2({ lang, target, level, onExit }: { lang: Lang; target: Target; level: BotLevel; onExit: () => void }) {
  const t = STRINGS[lang];
  const [match, setMatch] = useState<Match2>(() => newMatch2(target, newSeed()));
  const pacing = useTablePacing(match.history.length, match.deal.tricks.length, match.lastDeal, false);
  const paused = pacing.summary !== null || pacing.holding || match.winner !== null;

  useEffect(() => {
    if (paused || match.deal.turn !== BOT) return undefined;
    const move =
      match.deal.phase === 'play'
        ? (m: Match2) => {
            const ready = autoDeclare(m, BOT);
            return playMove2(ready, BOT, botPlay2(ready.deal, BOT, level));
          }
        : (m: Match2) => trumpMove2(m, BOT, botTrump2(m.deal, BOT, level));
    const id = setTimeout(() => setMatch(move), BOT_DELAY_MS);
    return () => clearTimeout(id);
  }, [match, paused, level]);

  return (
    <Table2
      lang={lang}
      match={match}
      mySeat={HUMAN}
      pacing={pacing}
      seatName={(seat) => (seat === HUMAN ? t.you : t.bot)}
      onTrump={(a) => setMatch((m) => trumpMove2(m, HUMAN, a))}
      onPlay={(c) => setMatch((m) => playMove2(m, HUMAN, c))}
      onAnnounce={(picks) => setMatch((m) => announceMove(m, HUMAN, picks))}
      onShow={() => setMatch((m) => showMove(m, HUMAN))}
      onExit={onExit}
      endActions={
        <>
          <button className="btn primary" onClick={() => setMatch(newMatch2(target, newSeed()))}>
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
