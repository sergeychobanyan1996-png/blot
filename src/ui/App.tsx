import { useState } from 'react';
import { TARGETS, type Target, targetFor } from '../engine/match';
import { type BotLevel, BOT_LEVELS, DEFAULT_LEVEL, toLevel } from '../bots';
import type { RoomIntent } from '../net/useRoom';
import { type Lang, LANGS, STRINGS, levelName } from './i18n';
import { Game4 } from './Game4';
import { Game2 } from './Game2';
import { Online } from './Online';

type Players = 2 | 4;
type Screen = { kind: 'menu' } | { kind: 'local' } | { kind: 'online'; intent: RoomIntent };

const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
};

const roomFromUrl = (): string => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';

export function App() {
  const [lang, setLang] = useState<Lang>(() => load('blot.lang', 'hy'));
  const [players, setPlayers] = useState<Players>(() => load('blot.players', 4));
  // Each mode remembers its own target.
  const [targets, setTargets] = useState<Record<Players, Target>>(() => ({
    2: targetFor(2, load<unknown>('blot.target2', null)),
    4: targetFor(4, load<unknown>('blot.target4', null)),
  }));
  const target = targets[players];
  const setTarget = (v: Target) => {
    setTargets((t) => ({ ...t, [players]: v }));
    save(`blot.target${players}`, v);
  };
  const [level, setLevel] = useState<BotLevel>(() => toLevel(load<unknown>('blot.level', DEFAULT_LEVEL)));
  const [name, setName] = useState<string>(() => load('blot.name', ''));
  const [teamNames, setTeamNames] = useState<[string, string]>(() => load('blot.teams', ['', '']));
  const setTeam = (i: 0 | 1, v: string) => {
    const next: [string, string] = i === 0 ? [v, teamNames[1]] : [teamNames[0], v];
    setTeamNames(next);
    save('blot.teams', next);
  };
  const teams = teamNames.some((n) => n.trim()) ? teamNames : undefined;
  const [code, setCode] = useState(roomFromUrl);
  // Opening a shared link with a known name goes straight into the room.
  const [screen, setScreen] = useState<Screen>(() =>
    roomFromUrl() && name.trim() ? { kind: 'online', intent: { kind: 'join', roomId: roomFromUrl(), name } } : { kind: 'menu' },
  );
  const t = STRINGS[lang];

  const pick = <T,>(key: string, set: (v: T) => void) => (v: T) => {
    set(v);
    save(key, v);
  };
  const toMenu = () => setScreen({ kind: 'menu' });
  const playerName = name.trim();

  if (screen.kind === 'local') {
    if (players === 4) return <Game4 lang={lang} target={target} level={level} teamNames={teams} onExit={toMenu} />;
    return <Game2 lang={lang} target={target} level={level} onExit={toMenu} />;
  }
  if (screen.kind === 'online') return <Online lang={lang} intent={screen.intent} onExit={toMenu} />;

  return (
    <div className="menu">
      <h1>
        <span className="red">♥</span> {t.title} <span>♠</span>
      </h1>
      <section>
        <h3>{t.language}</h3>
        <div className="seg">
          {LANGS.map((l) => (
            <button key={l.id} className={`btn ${lang === l.id ? 'selected' : ''}`} onClick={() => pick('blot.lang', setLang)(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="seg">
          {([4, 2] as Players[]).map((p) => (
            <button key={p} className={`btn ${players === p ? 'selected' : ''}`} onClick={() => pick('blot.players', setPlayers)(p)}>
              <b>{p === 4 ? t.bazarBlot : t.blot2}</b>
              <br />
              <small>{p === 4 ? t.players4 : t.players2}</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>{t.target}</h3>
        <div className="seg">
          {[...TARGETS[players]].sort((a, b) => a - b).map((v) => (
            <button key={v} className={`btn ${target === v ? 'selected' : ''}`} onClick={() => setTarget(v)}>
              {v}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>{t.difficulty}</h3>
        <div className="seg levels">
          {BOT_LEVELS.map((v) => (
            <button
              key={v}
              className={`btn level-btn ${level === v ? 'selected' : ''}`}
              title={levelName(lang, v)}
              onClick={() => pick('blot.level', setLevel)(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="muted level-name">{levelName(lang, level)}</div>
      </section>
      {players === 4 && (
        <section className="team-names">
          <input className="input" placeholder={t.teamNameOurs} value={teamNames[0]} maxLength={20} onChange={(e) => setTeam(0, e.target.value)} />
          <input className="input" placeholder={t.teamNameTheirs} value={teamNames[1]} maxLength={20} onChange={(e) => setTeam(1, e.target.value)} />
        </section>
      )}
      <button className="btn primary big" onClick={() => setScreen({ kind: 'local' })}>
        {t.vsBots}
      </button>

      <section className="online-box">
        <h3>{t.online}</h3>
        <input
          className="input"
          placeholder={t.yourName}
          value={name}
          maxLength={20}
          onChange={(e) => pick('blot.name', setName)(e.target.value)}
        />
        <button
          className="btn primary"
          disabled={!playerName}
          onClick={() => setScreen({ kind: 'online', intent: { kind: 'create', name: playerName, settings: { players, target, level, ...(players === 4 && teams ? { teamNames: teams } : {}) } } })}
        >
          {t.createRoom}
        </button>
        <div className="join-row">
          <input
            className="input code"
            placeholder={t.roomCode}
            value={code}
            maxLength={5}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button
            className="btn"
            disabled={!playerName || code.length < 5}
            onClick={() => setScreen({ kind: 'online', intent: { kind: 'join', roomId: code, name: playerName } })}
          >
            {t.joinRoom}
          </button>
        </div>
      </section>
    </div>
  );
}
