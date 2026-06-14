import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { cityYields, computeScore, currentEra, empireHappiness, happinessBreakdown, playerCities } from '../../engine/selectors';
import { IconAmphora, IconCoin, IconFlame, IconLaurel, IconScroll, YIELD_COLORS } from '../icons';

export function TopBar() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game) return null;
  const player = game.players[viewer];

  let science = 0;
  let culture = 0;
  let gold = 0;
  let faith = 0;
  for (const c of playerCities(game, viewer)) {
    const y = cityYields(gameCtx, game, c).total;
    science += y.science;
    culture += y.culture;
    gold += y.gold;
    faith += y.faith;
  }

  const hap = empireHappiness(gameCtx, game, viewer);
  const hapColor = hap.tier === 'content' ? '#7DBE7D' : hap.tier === 'unhappy' ? '#D9A441' : '#C75450';
  const hapItems = happinessBreakdown(gameCtx, game, viewer);
  const tierWord = hap.tier === 'content' ? 'content' : hap.tier === 'unhappy' ? 'unhappy' : 'very unhappy';
  const helping = hapItems.filter((x) => x.amount > 0).map((x) => `  +${x.amount}  ${x.label}`).join('\n');
  const hurting = hapItems.filter((x) => x.amount < 0).map((x) => `  −${-x.amount}  ${x.label}`).join('\n');
  const hapTitle =
    `HAPPINESS  ${hap.net >= 0 ? '+' : '−'}${Math.abs(hap.net)}  (${tierWord})\n\nHelping\n${helping}` +
    (hurting ? `\n\nHurting\n${hurting}` : '');

  const pending = game.proposals.filter((p) => p.to === viewer && game.turn <= p.expiresTurn).length;
  const tech = player.researching ? gameCtx.rules.techs[player.researching] : null;
  const progress = tech ? Math.min(1, player.science / tech.cost) : 0;
  const turnsLeft = tech && science > 0 ? Math.ceil((tech.cost - player.science) / science) : null;
  const era = gameCtx.rules.eras.find((e) => e.id === currentEra(gameCtx, game, viewer));
  const score = computeScore(gameCtx, game, viewer);

  return (
    <div className="topbar plate plate--sm">
      <div
        className="research-chip"
        onClick={() => appStore.set({ overlay: 'tech' })}
        title="Open the tech tree (T)"
      >
        <IconScroll size={17} style={{ color: YIELD_COLORS.science }} />
        <div style={{ flex: 1 }}>
          <div className="label">Research</div>
          <div className="name">{tech ? tech.name : 'Choose research…'}</div>
          <div className="bar">
            <i style={{ width: `${progress * 100}%`, background: YIELD_COLORS.science }} />
          </div>
        </div>
        {turnsLeft !== null && <span className="per-turn num">{turnsLeft}t</span>}
      </div>

      <span className="yield-chip" style={{ color: YIELD_COLORS.science }}>
        <IconScroll />
        <span className="per-turn">+{science}</span>
      </span>
      <span className="yield-chip" style={{ color: YIELD_COLORS.culture }}>
        <IconAmphora />
        <span className="per-turn">+{culture}</span>
      </span>
      <span className="yield-chip" style={{ color: YIELD_COLORS.gold }}>
        <IconCoin />
        <span className="num">{player.gold}</span>
        <span className="per-turn">+{gold}</span>
      </span>
      <span className="yield-chip" style={{ color: YIELD_COLORS.faith }} title="Faith">
        <IconFlame />
        <span className="num">{player.faith}</span>
        <span className="per-turn">+{faith}</span>
      </span>
      {!player.pantheon && player.faith >= gameCtx.rules.settings.religion.pantheonCost && (
        <button className="btn btn--ghost" onClick={() => appStore.set({ religionModal: 'pantheon' })} title="Found Pantheon">
          Pantheon
        </button>
      )}
      {player.techs.includes(gameCtx.rules.settings.religion.religionTech) &&
        !game.religions['rel_' + viewer] &&
        Object.keys(game.religions).length < gameCtx.rules.settings.religion.maxReligions &&
        player.faith >= gameCtx.rules.settings.religion.religionCost && (
          <button className="btn btn--ghost" onClick={() => appStore.set({ religionModal: 'religion' })} title="Found Religion">
            Religion
          </button>
        )}
      <span
        className="yield-chip"
        style={{ color: hapColor }}
        title={hapTitle}
      >
        <span style={{ fontWeight: 700 }}>☺</span>
        <span className="per-turn">{hap.net}</span>
      </span>

      <div className="spacer" />
      <div className="turn-block">
        <div className="t">TURN {game.turn}</div>
        <div className="era">{era?.name ?? ''}</div>
      </div>
      <div className="spacer" />

      <span className="yield-chip" style={{ color: 'var(--ivory)' }} title="Score">
        <IconLaurel />
        <span className="num">{score}</span>
        <span className="per-turn">/ {gameCtx.rules.settings.victory.scoreThreshold}</span>
      </span>
      <button className="btn btn--ghost" onClick={() => appStore.set({ overlay: 'civics' })} title="Civics (C)">Civics</button>
      <button
        className="btn btn--ghost"
        onClick={() => appStore.set({ overlay: 'diplomacy' })}
        title="Foreign affairs (G)"
      >
        Powers{pending > 0 ? ` ●` : ''}
      </button>
      <button
        className="btn btn--ghost"
        onClick={() => appStore.set((s) => ({ aiLogOpen: !s.aiLogOpen }))}
        title="Rivals' reasoning"
      >
        Counsel
      </button>
      <button className="btn btn--ghost" onClick={() => appStore.set({ overlay: 'menu' })}>
        Menu
      </button>
    </div>
  );
}
