import { useMemo, useState } from 'react';
import { LocalGame, startGame } from '../app/driver';
import { loadAutosave } from '../app/save';
import { STANDARD_RULESET } from '../data/standard';
import type { PlayerSpec } from '../engine/types';

const SIZES = [
  { id: 'duel', name: 'Duel', w: 34, h: 22, foes: 1, blurb: '1 rival' },
  { id: 'small', name: 'Small', w: 40, h: 26, foes: 2, blurb: '2 rivals' },
  { id: 'standard', name: 'Standard', w: 46, h: 28, foes: 3, blurb: '3 rivals' },
] as const;

export function MainMenu() {
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('standard');
  const [civ, setCiv] = useState('rome');
  const [seedText, setSeedText] = useState(() => String(randomSeed()));
  const autosave = useMemo(loadAutosave, []);
  const civs = Object.values(STANDARD_RULESET.civs);

  const begin = () => {
    const cfg = SIZES.find((s) => s.id === size)!;
    const seed = Number.parseInt(seedText, 10);
    const others = civs.filter((c) => c.id !== civ).map((c) => c.id);
    const players: PlayerSpec[] = [
      { civ, controller: 'human' },
      ...others.slice(0, cfg.foes).map((c) => ({ civ: c, controller: 'ai' as const })),
    ];
    startGame(
      LocalGame.newGame({
        seed: Number.isFinite(seed) ? seed : randomSeed(),
        mapW: cfg.w,
        mapH: cfg.h,
        players,
      }),
    );
  };

  return (
    <div className="menu-root">
      <svg className="menu-rose" width="120" height="120" viewBox="0 0 100 100" fill="none" stroke="currentColor">
        <circle cx="50" cy="50" r="34" strokeWidth="1.4" />
        <circle cx="50" cy="50" r="40" strokeWidth="0.8" opacity="0.6" />
        <path d="M50 4v92M4 50h92M19 19l62 62M81 19l-62 62" strokeWidth="0.8" />
        <path d="M50 12 55 45 50 50 45 45Z" fill="currentColor" stroke="none" />
        <path d="M50 88 55 55 50 50 45 55Z" fill="currentColor" stroke="none" opacity="0.6" />
      </svg>

      <div className="menu-card plate">
        <h1 className="menu-title">ALVORADA</h1>
        <p className="menu-sub">Guide a people from the first dawn to empire</p>

        <div className="menu-section">
          <div className="plate-title">The World</div>
          <div className="menu-row">
            {SIZES.map((s) => (
              <div
                key={s.id}
                className={`choice ${size === s.id ? 'is-active' : ''}`}
                onClick={() => setSize(s.id)}
              >
                {s.name}
                <small>
                  {s.w}×{s.h} · {s.blurb}
                </small>
              </div>
            ))}
          </div>
        </div>

        <div className="menu-section">
          <div className="plate-title">Your People</div>
          <div className="menu-row">
            {civs.map((c) => (
              <div
                key={c.id}
                className={`choice ${civ === c.id ? 'is-active' : ''}`}
                onClick={() => setCiv(c.id)}
              >
                <span className="civ-chip">
                  <i className="civ-dot" style={{ background: c.color }} />
                  {c.name}
                </span>
                <small>{c.leader}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="menu-section">
          <div className="plate-title">Seed</div>
          <div className="menu-row seed-row">
            <input
              className="seed-input"
              value={seedText}
              onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ''))}
              spellCheck={false}
            />
            <button className="btn" onClick={() => setSeedText(String(randomSeed()))}>
              Reroll
            </button>
          </div>
        </div>

        <div className="menu-actions">
          {autosave && (
            <button className="btn" onClick={() => startGame(new LocalGame(autosave))}>
              Continue · Turn {autosave.turn}
            </button>
          )}
          <button className="btn btn--primary" onClick={begin}>
            Begin the Journey
          </button>
        </div>
      </div>
    </div>
  );
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}
