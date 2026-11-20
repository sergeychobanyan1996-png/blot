// Shared pacing for both tables: hold a finished trick on screen, show the deal result, delay bots.

import { useEffect, useRef, useState } from 'react';

export const BOT_DELAY_MS = 650;
export const TRICK_HOLD_MS = 1100;

export interface Pacing<D> {
  /** Deal whose result screen is open, or null. */
  summary: D | null;
  closeSummary: () => void;
  /** A just-finished trick is being shown; nobody may play. */
  holding: boolean;
  redealNotice: boolean;
}

/**
 * @param dealKey changes when a new deal starts
 * @param trickCount tricks finished in the current deal
 * @param finished the deal that just ended (match.lastDeal) when the history grew
 */
export function useTablePacing<D>(
  historyLength: number,
  trickCount: number,
  lastDeal: D | null,
  wasRedeal: boolean,
): Pacing<D> {
  const prev = useRef({ historyLength, trickCount });
  const [summary, setSummary] = useState<D | null>(null);
  const [holding, setHolding] = useState(false);
  const [redealNotice, setRedealNotice] = useState(false);

  useEffect(() => {
    const p = prev.current;
    prev.current = { historyLength, trickCount };
    if (historyLength > p.historyLength) {
      if (wasRedeal) {
        setRedealNotice(true);
        const id = setTimeout(() => setRedealNotice(false), 1800);
        return () => clearTimeout(id);
      }
      setSummary(lastDeal);
      return undefined;
    }
    if (trickCount > p.trickCount) {
      setHolding(true);
      const id = setTimeout(() => setHolding(false), TRICK_HOLD_MS);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [historyLength, trickCount, lastDeal, wasRedeal]);

  return { summary, closeSummary: () => setSummary(null), holding, redealNotice };
}
