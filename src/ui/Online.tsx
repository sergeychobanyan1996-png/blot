import { useState } from 'react';
import type { Match2, Match4 } from '../engine/match';
import type { Deal4 } from '../engine/deal4';
import type { Deal2 } from '../engine/deal2';
import type { ClientMsg, RoomView } from '../net/protocol';
import { type RoomIntent, setRoomInUrl, useRoom } from '../net/useRoom';
import { type Lang, type Strings, STRINGS } from './i18n';
import { Table4 } from './Game4';
import { Table2 } from './Game2';
import { type Pacing, useTablePacing } from './useTablePacing';

export function Online({ lang, intent, onExit }: { lang: Lang; intent: RoomIntent; onExit: () => void }) {
  const t = STRINGS[lang];
  const { view, status, error, send, clearError } = useRoom(intent);
  const exit = () => {
    setRoomInUrl(null);
    onExit();
  };

  if (error && !view) {
    return (
      <div className="menu">
        <h2>{error.code === 'notFound' ? t.roomNotFound : error.code === 'full' ? t.roomFull : error.message}</h2>
        <button className="btn primary" onClick={exit}>
          {t.menu}
        </button>
      </div>
    );
  }
  if (!view) return <div className="menu">{t.connecting}</div>;

  const banner = status !== 'open' && <div className="toast">{t.reconnecting}</div>;
  const errorToast = error && (
    <div className="toast warn" onClick={clearError}>
      {error.message}
    </div>
  );

  if (!view.started) {
    return (
      <>
        <Lobby view={view} t={t} send={send} onExit={exit} />
        {banner}
        {errorToast}
      </>
    );
  }
  return (
    <>
      {view.settings.players === 4 ? (
        <OnlineTable4 view={view} lang={lang} send={send} onExit={exit} />
      ) : (
        <OnlineTable2 view={view} lang={lang} send={send} onExit={exit} />
      )}
      {banner}
      {errorToast}
    </>
  );
}

type Send = (m: ClientMsg) => void;

function useSeatLabels(view: RoomView, t: Strings) {
  const seatName = (seat: number) => {
    const s = view.seats[seat];
    if (seat === view.mySeat) return `${s.name ?? t.you} (${t.you})`;
    return s.bot ? `${t.bot} ${seat + 1}` : s.name ?? '—';
  };
  const seatNote = (seat: number) => {
    const s = view.seats[seat];
    return !s.bot && !s.connected ? t.offline : null;
  };
  return { seatName, seatNote };
}

function endActions(view: RoomView, t: Strings, send: Send, onExit: () => void) {
  const host = view.seats[view.mySeat].host;
  return (
    <>
      {host ? (
        <button className="btn primary" onClick={() => send({ type: 'rematch' })}>
          {t.rematch}
        </button>
      ) : (
        <p className="muted">{t.waitingHost}</p>
      )}
      <button className="btn ghost" onClick={onExit}>
        {t.menu}
      </button>
    </>
  );
}

/** Sends 'continue' when this player closes the deal result. */
function withAck<D>(pacing: Pacing<D>, send: Send): Pacing<D> {
  return {
    ...pacing,
    closeSummary: () => {
      pacing.closeSummary();
      send({ type: 'continue' });
    },
  };
}

function waitingNote(view: RoomView, t: Strings): string | null {
  const others = view.waitingFor.filter((s) => s !== view.mySeat);
  return others.length ? t.waitingOthers : null;
}

function OnlineTable4({ view, lang, send, onExit }: { view: RoomView; lang: Lang; send: Send; onExit: () => void }) {
  const t = STRINGS[lang];
  const match = view.match as Match4;
  const lastWasRedeal = match.history.length > 0 && match.history[match.history.length - 1].bidder === null;
  const pacing = useTablePacing<Deal4>(match.history.length, match.deal.tricks.length, match.lastDeal, lastWasRedeal);
  const { seatName, seatNote } = useSeatLabels(view, t);
  return (
    <Table4
      lang={lang}
      match={match}
      mySeat={view.mySeat}
      pacing={withAck(pacing, send)}
      seatName={seatName}
      seatNote={seatNote}
      onBazar={(action) => send({ type: 'bazar', action })}
      onPlay={(card) => send({ type: 'play', card })}
      onExit={onExit}
      endActions={endActions(view, t, send, onExit)}
      waitingNote={waitingNote(view, t)}
    />
  );
}

function OnlineTable2({ view, lang, send, onExit }: { view: RoomView; lang: Lang; send: Send; onExit: () => void }) {
  const t = STRINGS[lang];
  const match = view.match as Match2;
  const pacing = useTablePacing<Deal2>(match.history.length, match.deal.tricks.length, match.lastDeal, false);
  const { seatName, seatNote } = useSeatLabels(view, t);
  return (
    <Table2
      lang={lang}
      match={match}
      mySeat={view.mySeat}
      pacing={withAck(pacing, send)}
      seatName={seatName}
      seatNote={seatNote}
      onTrump={(action) => send({ type: 'trump', action })}
      onPlay={(card) => send({ type: 'play', card })}
      onExit={onExit}
      endActions={endActions(view, t, send, onExit)}
      waitingNote={waitingNote(view, t)}
    />
  );
}

function Lobby({ view, t, send, onExit }: { view: RoomView; t: Strings; send: Send; onExit: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}?room=${view.roomId}`;
  const me = view.seats[view.mySeat];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* clipboard blocked: the link is still visible */
    }
  };
  const teams = view.settings.players === 4 ? [[0, 2], [1, 3]] : [[0], [1]];
  const seatRow = (seat: number) => {
    const s = view.seats[seat];
    return (
      <div key={seat} className={`lobby-seat ${seat === view.mySeat ? 'mine' : ''}`}>
        <span>
          {s.name ?? <i className="muted">{t.emptySeat}</i>}
          {s.host && <span className="dealer-chip">{t.host}</span>}
          {s.name && !s.connected && <span className="muted"> · {t.offline}</span>}
        </span>
        {!s.name && (
          <button className="btn small" onClick={() => send({ type: 'sit', seat })}>
            {t.sitHere}
          </button>
        )}
      </div>
    );
  };
  return (
    <div className="menu">
      <h1>{view.roomId}</h1>
      <p className="muted">{t.shareHint}</p>
      <div className="share">
        <code>{link}</code>
        <button className="btn small" onClick={copy}>
          {copied ? t.copied : t.copyLink}
        </button>
      </div>
      <div className="lobby-teams">
        {teams.map((seats, i) => (
          <div key={i} className="lobby-team">
            {view.settings.players === 4 && <h3>{i === 0 ? t.teamA : t.teamB}</h3>}
            {seats.map(seatRow)}
          </div>
        ))}
      </div>
      <p className="muted">
        {view.settings.players === 4 ? t.bazarBlot : t.blot2} · {view.settings.target} · {t[view.settings.level]}
      </p>
      {me.host ? (
        <button className="btn primary big" onClick={() => send({ type: 'start' })}>
          {t.startGame}
        </button>
      ) : (
        <p>{t.waitingHost}</p>
      )}
      <button className="btn ghost" onClick={onExit}>
        ← {t.menu}
      </button>
    </div>
  );
}
