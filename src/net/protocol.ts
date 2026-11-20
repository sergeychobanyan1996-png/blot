// Messages between the browser and the game server (JSON over WebSocket at /ws).

import type { Card } from '../engine/cards';
import type { BazarAction } from '../engine/bazar';
import type { TrumpAction } from '../engine/deal2';
import type { Match2, Match4, Target } from '../engine/match';
import type { BotLevel } from '../bots';

export type Players = 2 | 4;

export interface RoomSettings {
  players: Players;
  target: Target;
  level: BotLevel;
}

export interface SeatInfo {
  name: string | null;
  bot: boolean;
  connected: boolean;
  host: boolean;
}

export type ClientMsg =
  | { type: 'create'; name: string; settings: RoomSettings }
  | { type: 'join'; roomId: string; name: string; token?: string }
  | { type: 'sit'; seat: number }
  | { type: 'start' }
  | { type: 'bazar'; action: BazarAction }
  | { type: 'play'; card: Card }
  | { type: 'trump'; action: TrumpAction }
  | { type: 'announce'; picks: number[] }
  | { type: 'show' }
  | { type: 'continue' }
  | { type: 'rematch' };

export interface RoomView {
  roomId: string;
  settings: RoomSettings;
  seats: SeatInfo[];
  mySeat: number;
  started: boolean;
  /** The match as this seat may see it: other hands and the deck seed are hidden. */
  match: Match4 | Match2 | null;
  /** Seats whose players have not yet closed the deal result. */
  waitingFor: number[];
}

export type ServerMsg =
  | { type: 'welcome'; roomId: string; token: string; seat: number }
  | { type: 'room'; view: RoomView }
  | { type: 'error'; code: 'notFound' | 'full' | 'illegal' | 'notHost' | 'bad'; message: string };
