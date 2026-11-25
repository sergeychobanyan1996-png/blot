import { useEffect, useState, type ReactNode } from 'react';
import { type Card, trumpOf } from '../engine/cards';
import { type BazarAction, bazarOptions, teamOf4 } from '../engine/bazar';
import { type Deal4, declareStage4, legalCards4 } from '../engine/deal4';
import { type Match4, type Target, announceMove, autoDeclare, bazarMove4, newMatch4, playMove4, showMove } from '../engine/match';
import { type BotLevel, botBazar4, botPlay4 } from '../bots';
import { type Lang, type Strings, STRINGS, fill } from './i18n';
import {
  ActionBubble,
  Avatar,
  BazarPanel,
  BidLabel,
  Bubble,
  CardBacks,
  DeclarePanel,
  ExitConfirm,
  ScoreHistory,
  FullscreenButton,
  HandView,
  Modal,
  SeatCombos,
  TrickView,
  blotCall,
} from './components';
import { BOT_DELAY_MS, type Pacing, safely, useTablePacing } from './useTablePacing';

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
  onAnnounce: (picks: number[]) => void;
  onShow: () => void;
  onExit: () => void;
  /** Online games explain that a bot takes over when you leave. */
  online?: boolean;
  /** Optional team names, by team index (0 = seats 0 and 2). */
  teamNames?: readonly [string, string] | null;
  /** Buttons for the match-over dialog. */
  endActions: ReactNode;
  /** Shown while other players are still reading the deal result. */
  waitingNote?: string | null;
}

/** The 4-player table, used by both the local game and online rooms. */
export function Table4(props: Table4Props) {
  const { lang, match, mySeat, pacing, seatName, seatNote, onBazar, onPlay, onAnnounce, onShow, onExit, online, endActions, waitingNote, teamNames } =
    props;
  const t = STRINGS[lang];
  const [confirmExit, setConfirmExit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const positionOf = (seat: number) => POS[(seat - mySeat + 4) % 4];
  const myTeam = teamOf4(mySeat);
  const teamLabel = (team: number) => teamNames?.[team]?.trim() || (team === myTeam ? t.ourTeam : t.theirTeam);
  const deal: Deal4 = pacing.summary ?? match.deal;
  const paused = pacing.summary !== null || pacing.holding || match.winner !== null;

  const b = deal.bazar;
  const humanOptions = deal.phase === 'bazar' && !paused ? bazarOptions(b, mySeat) : null;
  const showBazar = humanOptions && (humanOptions.pass || humanOptions.contra || humanOptions.sur);
  const lastAction = (seat: number): BazarAction | undefined =>
    [...b.history].reverse().find((h) => h.seat === seat)?.action;

  const finished = pacing.holding || (pacing.summary !== null && deal.tricks.length === 8);
  const lastTrick = deal.tricks[deal.tricks.length - 1];
  const shownTrick = finished ? lastTrick?.cards ?? [] : deal.trick;
  const collectTo = finished && lastTrick ? positionOf(lastTrick.winner) : null;
  const trump = deal.contract ? trumpOf(deal.contract.bid.strain) : null;
  const stage = !paused ? declareStage4(match.deal, mySeat) : null;
  // "Don't show" just hides the panel; playing the card then forfeits the combinations.
  const [skippedShow, setSkippedShow] = useState<number | null>(null);
  const declaring = stage === 'announce' || (stage === 'show' && skippedShow !== match.dealIndex);
  const legal = !paused ? legalCards4(match.deal, mySeat) : [];
  const played = [...deal.tricks.flatMap((x) => x.cards), ...deal.trick];

  const seatBlock = (seat: number) => {
    const card = shownTrick.find((p) => p.seat === seat)?.card;
    const call = blotCall(deal.decl, trump, played, seat, card, t);
    return (
      <div key={seat} className={`seat seat-${positionOf(seat)} ${deal.turn === seat && deal.phase !== 'done' && !finished ? 'active' : ''}`}>
        <div className="plate">
          <Avatar name={seatName(seat)} seat={seat} />
          <span className="plate-name">{seatName(seat)}</span>
          {deal.dealer === seat && (
            <span className="dealer-chip" title={t.dealer}>
              D
            </span>
          )}
        </div>
        {seat !== mySeat && <CardBacks count={deal.hands[seat].length} vertical={positionOf(seat) !== 'top'} />}
        {/* Floats beside the seat so bubbles never resize the table. */}
        <div className="seat-extras">
          {seatNote?.(seat) && <div className="seat-note">{seatNote(seat)}</div>}
          {deal.phase === 'bazar' && <ActionBubble action={lastAction(seat)} lang={lang} t={t} />}
          {call && <Bubble tone="gold">{call}</Bubble>}
          {deal.phase === 'play' && <SeatCombos decl={deal.decl} seat={seat} mySeat={mySeat} tricksDone={deal.tricks.length} t={t} />}
        </div>
      </div>
    );
  };

  return (
    <div className="game">
      <header className="topbar">
        <button className="btn ghost" onClick={() => (match.winner === null ? setConfirmExit(true) : onExit())}>
          ← {t.menu}
        </button>
        <button className="scores" onClick={() => setShowHistory(true)} title={t.history}>
          <span className="score-pill us">
            {teamLabel(myTeam)} <b>{match.scores[myTeam]}</b>
          </span>
          <span className="score-pill them">
            {teamLabel(1 - myTeam)} <b>{match.scores[1 - myTeam]}</b>
          </span>
          <span className="muted">/ {match.target}</span>
        </button>
        <div className="contract">
          {deal.contract && (
            <>
              <BidLabel bid={deal.contract.bid} lang={lang} t={t} /> · {seatName(deal.contract.declarer)}
              {deal.contract.contra > 0 && <span className="warn-text"> · {deal.contract.contra === 1 ? t.contra : t.sur}</span>}
            </>
          )}
        </div>
        <FullscreenButton t={t} />
      </header>

      <div className="table four">
        {[0, 1, 2, 3].map(seatBlock)}
        <div className="center">
          <div className="board" />
          <TrickView trick={shownTrick} positionOf={positionOf} collectTo={collectTo} />
          {pacing.redealNotice && <div className="notice">{t.redeal}</div>}
        </div>
      </div>

      <div className="bottom">
        {/* Fixed-height slot: panels appear here without moving the table. */}
        <div className="controls">
          {showBazar && <BazarPanel key={`${b.history.length}`} options={humanOptions!} lang={lang} t={t} onAction={onBazar} />}
          {declaring && (
            <DeclarePanel
              key={`${match.dealIndex}-${stage}`}
              stage={stage!}
              combos={stage === 'announce' ? match.deal.decl!.detected[mySeat] : match.deal.decl!.announced[mySeat]!}
              t={t}
              onAnnounce={onAnnounce}
              onShow={onShow}
              onSkipShow={() => setSkippedShow(match.dealIndex)}
            />
          )}
          {legal.length > 0 && !declaring && <div className="turn-hint">{t.yourTurn}</div>}
        </div>
        <HandView key={match.dealIndex} hand={deal.hands[mySeat]} legal={legal} trump={trump} onPlay={onPlay} locked={stage === 'announce'} />
      </div>

      {pacing.summary && (
        <DealSummary4
          deal={pacing.summary}
          scoresAfter={match.history[match.history.length - 1].scoresAfter}
          myTeam={myTeam}
          teamLabel={teamLabel}
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
      {showHistory && (
        <ScoreHistory
          history={match.history}
          mine={myTeam}
          labels={[teamLabel(myTeam), teamLabel(1 - myTeam)]}
          seatName={seatName}
          lang={lang}
          t={t}
          onClose={() => setShowHistory(false)}
        />
      )}
      {confirmExit && <ExitConfirm t={t} online={online} onStay={() => setConfirmExit(false)} onLeave={onExit} />}
      {waitingNote && !pacing.summary && <div className="toast">{waitingNote}</div>}
    </div>
  );
}

function DealSummary4({
  deal,
  scoresAfter,
  myTeam,
  teamLabel,
  t,
  lang,
  onClose,
  seatName,
}: {
  deal: Deal4;
  scoresAfter: number[];
  myTeam: number;
  teamLabel: (team: number) => string;
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
  const team = c.team;
  const need = c.bid.level * 10;
  const got = tally.cardRaw[team] + tally.comboRaw[team] + tally.blotRaw[team];
  return (
    <Modal>
      <h2>{t.dealResult}</h2>
      <p className="muted">
        {t.contract}: <BidLabel bid={c.bid} lang={lang} t={t} /> · {seatName(c.declarer)}
        {c.contra > 0 && <span className="warn-text"> · {c.contra === 1 ? t.contra : t.sur}</span>}
      </p>
      <div className={`result-banner ${s.made ? 'ok' : 'bad'}`}>
        <span className="result-icon">{s.made ? '✓' : '✗'}</span>
        {teamLabel(team)} {s.made ? t.madeVerb : t.failedVerb}
      </div>
      <p>
        {s.tharsKaput
          ? t.tharsLong
          : fill(t.neededGot, { need, got })}
      </p>
      {c.bid.kaput && !s.tharsKaput && <p>{fill(t.kaputNeeded, { tricks: tally.tricksWon[team] })}</p>}
      {s.kaput && !s.tharsKaput && !c.bid.kaput && <p className="ok-text">{t.kaputLong}</p>}
      <table className="summary">
        <thead>
          <tr>
            <th />
            <th>{teamLabel(myTeam)}</th>
            <th>{teamLabel(1 - myTeam)}</th>
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

export function Game4({
  lang,
  target,
  level,
  teamNames,
  onExit,
}: {
  lang: Lang;
  target: Target;
  level: BotLevel;
  teamNames?: readonly [string, string];
  onExit: () => void;
}) {
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
      move = (m) => {
        const ready = autoDeclare(m, seat);
        return playMove4(ready, seat, botPlay4(ready.deal, seat, level));
      };
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
      onBazar={(a) => setMatch(safely((m) => bazarMove4(m, HUMAN, a)))}
      onPlay={(c) => setMatch(safely((m) => playMove4(m, HUMAN, c)))}
      onAnnounce={(picks) => setMatch(safely((m) => announceMove(m, HUMAN, picks)))}
      onShow={() => setMatch(safely((m) => showMove(m, HUMAN)))}
      onExit={onExit}
      teamNames={teamNames}
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
