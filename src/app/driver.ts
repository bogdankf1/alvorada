/**
 * LocalGame: the session driver. Owns the authoritative state + action log,
 * pushes every mutation through validate/apply (exactly what a server will
 * do), paces AI turns so the world feels inhabited, surfaces events as
 * toasts, and autosaves. The engine never knows this file exists.
 */
import type { Action, Ctx, GameConfig, GameState } from '../engine/types';
import { initialState } from '../engine/state';
import { applyAction } from '../engine/reducer';
import { validateAction } from '../engine/validate';
import { STANDARD_RULESET } from '../data/standard';
import { decide } from '../ai/decide';
import { appStore, pushToast } from './store';
import { autosave } from './save';
import { tileIndex } from '../engine/hex';
import { VIS_VISIBLE } from '../engine/types';

export const gameCtx: Ctx = { rules: STANDARD_RULESET };

const TOAST_TYPES = new Set([
  'techDone',
  'cityGrew',
  'cityStarved',
  'prodDone',
  'war',
  'cityCaptured',
  'cityFounded',
  'unitKilled',
  'unitCaptured',
  'unitBlocked',
  'playerEliminated',
  'capitalMoved',
  'resourceRevealed',
  'cityBombarded',
  'victory',
]);

export interface DispatchResult {
  ok: boolean;
  reason?: string;
}

export class LocalGame {
  state: GameState;
  readonly log: Action[] = [];
  private lastEventSeq: number;
  private lastProposalSeen = 0;
  private aiRunning = false;
  /** Called after every applied action — the renderer hooks animations here. */
  onAction: ((action: Action, prev: GameState, next: GameState) => void) | null = null;

  constructor(initial: GameState) {
    this.state = initial;
    this.lastEventSeq = initial.eventSeq;
  }

  static newGame(config: GameConfig): LocalGame {
    return new LocalGame(initialState(config, gameCtx));
  }

  get viewingPlayer(): number {
    return appStore.get().viewingPlayer;
  }

  /** Validate + apply + publish. The only way state changes during play. */
  dispatch(action: Action): DispatchResult {
    const v = validateAction(gameCtx, this.state, action);
    if (!v.ok) return { ok: false, reason: v.reason };
    const prev = this.state;
    this.state = applyAction(gameCtx, this.state, action);
    this.log.push(action);
    this.onAction?.(action, prev, this.state);
    this.publish();
    if (action.type === 'END_TURN') {
      void this.runAiTurns();
    }
    return { ok: true };
  }

  private publish(): void {
    appStore.set({ game: this.state });
    this.drainEvents();
    this.surfaceProposals();
  }

  private surfaceProposals(): void {
    const viewer = this.viewingPlayer;
    let newest = 0;
    for (const p of this.state.proposals) {
      if (p.to === viewer && p.id > this.lastProposalSeen && p.id > newest) newest = p.id;
    }
    if (newest > 0) {
      this.lastProposalSeen = newest;
      appStore.set({ proposalModal: newest });
    }
  }

  private drainEvents(): void {
    const viewer = this.viewingPlayer;
    for (const ev of this.state.events) {
      if (ev.seq < this.lastEventSeq) continue;
      this.lastEventSeq = ev.seq + 1;
      if (ev.player !== null && ev.player !== viewer) continue;
      if (!TOAST_TYPES.has(ev.type)) continue;
      pushToast({ type: ev.type, msg: ev.msg, q: ev.q, r: ev.r });
    }
  }

  /** Is this action's stage visible to the viewing player right now? */
  private actionVisible(action: Action, state: GameState): boolean {
    if (!('unit' in action)) return false;
    const u = state.units[action.unit];
    if (!u) return false;
    const idx = tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH);
    return state.visibility[this.viewingPlayer][idx] === VIS_VISIBLE;
  }

  private async runAiTurns(): Promise<void> {
    if (this.aiRunning) return;
    this.aiRunning = true;
    appStore.set({ aiThinking: true });
    try {
      let batched = 0;
      while (
        this.state.phase === 'playing' &&
        this.state.players[this.state.currentPlayer].controller === 'ai'
      ) {
        const pid = this.state.currentPlayer;
        const { action, reason } = decide(gameCtx, this.state, pid);
        const visible = this.actionVisible(action, this.state);
        const prev = this.state;
        try {
          this.state = applyAction(gameCtx, this.state, action);
        } catch (err) {
          // an AI bug must never wedge the session: log, end its turn, move on
          console.error('AI action rejected', action, err);
          this.state = applyAction(gameCtx, this.state, { type: 'END_TURN', player: pid });
          this.publish();
          continue;
        }
        this.log.push(action);
        this.onAction?.(action, prev, this.state);
        if (action.type !== 'END_TURN') {
          appStore.set((s) => ({
            aiLog: [...s.aiLog.slice(-79), { turn: this.state.turn, player: pid, reason }],
          }));
        }
        this.publish();
        if (visible && (action.type === 'MOVE_UNIT' || action.type === 'ATTACK' || action.type === 'RANGED_ATTACK')) {
          await sleep(220); // let the glide/lunge finish before the rival's next move
        } else if (++batched % 25 === 0) {
          await sleep(0); // yield to the UI thread on long invisible stretches
        }
      }
    } finally {
      this.aiRunning = false;
      appStore.set({ aiThinking: false });
      autosave(this.state);
    }
  }

  /** Resume after loading a save where an AI holds the turn. */
  kick(): void {
    if (
      this.state.phase === 'playing' &&
      this.state.players[this.state.currentPlayer].controller === 'ai'
    ) {
      void this.runAiTurns();
    } else {
      autosave(this.state);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The singleton session (null on the menu screen). */
export let currentGame: LocalGame | null = null;

export function startGame(game: LocalGame): void {
  currentGame = game;
  appStore.set({
    screen: 'game',
    game: game.state,
    selectedUnit: null,
    selectedCity: null,
    overlay: null,
    toasts: [],
    aiLog: [],
    winnerSeen: false,
    viewingPlayer: Math.max(0, game.state.players.findIndex((p) => p.controller === 'human')),
  });
  game.kick();
}

export function quitToMenu(): void {
  if (currentGame) autosave(currentGame.state);
  currentGame = null;
  appStore.set({ screen: 'menu', game: null });
}
