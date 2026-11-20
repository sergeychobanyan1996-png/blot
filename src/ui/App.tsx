import { useState } from 'react';
import { TARGETS, type Target } from '../engine/match';
import type { BotLevel } from '../bots';
import type { RoomIntent } from '../net/useRoom';
import { type Lang, LANGS, STRINGS } from './i18n';
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
  const [target, setTarget] = useState<Target>(() => load('blot.target', 101));
  const [level, setLevel] = useState<BotLevel>(() => load('blot.level', 'strong'));
  const [name, setName] = useState<string>(() => load('blot.name', ''));
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
    const Game = players === 4 ? Game4 : Game2;
    return <Game lang={lang} target={target} level={level} onExit={toMenu} />;
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
          {TARGETS.map((v) => (
            <button key={v} className={`btn ${target === v ? 'selected' : ''}`} onClick={() => pick('blot.target', setTarget)(v)}>
              {v}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>{t.difficulty}</h3>
        <div className="seg">
          {(['easy', 'strong'] as BotLevel[]).map((v) => (
            <button key={v} className={`btn ${level === v ? 'selected' : ''}`} onClick={() => pick('blot.level', setLevel)(v)}>
              {t[v]}
            </button>
          ))}
        </div>
      </section>
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
          onClick={() => setScreen({ kind: 'online', intent: { kind: 'create', name: playerName, settings: { players, target, level } } })}
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
