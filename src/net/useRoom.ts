// Browser side of the connection: connects, (re)joins with a saved token, and keeps the latest room view.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMsg, RoomSettings, RoomView, ServerMsg } from './protocol';

export type RoomIntent =
  | { kind: 'create'; name: string; settings: RoomSettings }
  | { kind: 'join'; roomId: string; name: string };

export type ConnStatus = 'connecting' | 'open' | 'closed';

// Kept in localStorage so a player who closed the tab can come back to the same seat.
const tokenKey = (roomId: string) => `blot.token.${roomId}`;
const readToken = (roomId: string): string | undefined => {
  try {
    return localStorage.getItem(tokenKey(roomId)) ?? undefined;
  } catch {
    return undefined;
  }
};
const saveToken = (roomId: string, token: string) => {
  try {
    localStorage.setItem(tokenKey(roomId), token);
  } catch {
    /* storage unavailable: reconnect only works while the tab stays open */
  }
};

export function setRoomInUrl(roomId: string | null): void {
  const url = new URL(location.href);
  if (roomId) url.searchParams.set('room', roomId);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

export function useRoom(intent: RoomIntent) {
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [error, setError] = useState<Extract<ServerMsg, { type: 'error' }> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const joined = useRef<{ roomId: string; token: string } | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setStatus('connecting');
      ws.onopen = () => {
        retry = 0;
        setStatus('open');
        const send = (m: ClientMsg) => ws.send(JSON.stringify(m));
        if (joined.current) send({ type: 'join', roomId: joined.current.roomId, name: intent.name, token: joined.current.token });
        else if (intent.kind === 'create') send({ type: 'create', name: intent.name, settings: intent.settings });
        else send({ type: 'join', roomId: intent.roomId, name: intent.name, token: readToken(intent.roomId.toUpperCase()) });
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMsg;
        if (msg.type === 'welcome') {
          joined.current = { roomId: msg.roomId, token: msg.token };
          saveToken(msg.roomId, msg.token);
          setRoomInUrl(msg.roomId);
          setError(null);
        } else if (msg.type === 'room') setView({ ...msg.view, receivedAt: Date.now() });
        else {
          setError(msg);
          // Could not get into the room at all: stop retrying.
          if (!joined.current && (msg.code === 'notFound' || msg.code === 'full')) {
            stopped = true;
            ws.close();
          }
        }
      };
      ws.onclose = () => {
        setStatus('closed');
        if (!stopped) timer = setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
    // The intent is fixed for the lifetime of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((m: ClientMsg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  return { view, status, error, send, clearError: () => setError(null) };
}
