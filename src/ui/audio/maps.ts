export type SfxName =
  | 'click' | 'select' | 'move' | 'attack'
  | 'cityFound' | 'complete' | 'notify' | 'victory';

/** A player action → its interaction sound. Null = silent here (e.g. world-event
 *  actions that already have an event sound, to avoid double-firing). */
export function actionSfx(type: string): SfxName | null {
  switch (type) {
    case 'MOVE_UNIT': return 'move';
    case 'ATTACK':
    case 'RANGED_ATTACK': return 'attack';
    case 'SET_PRODUCTION':
    case 'BUY_ITEM':
    case 'ADOPT_POLICY':
    case 'SET_SPECIALISTS':
    case 'BUY_TILE': return 'click';
    default: return null;
  }
}

/** A surfaced world-event/toast type → its sound. */
export function eventSfx(type: string): SfxName | null {
  switch (type) {
    case 'cityFounded': return 'cityFound';
    case 'wonderBuilt':
    case 'techDone':
    case 'prodDone':
    case 'pantheonFounded':
    case 'religionFounded': return 'complete';
    case 'victory': return 'victory';
    case 'war':
    case 'cityCaptured':
    case 'unitKilled': return 'attack';
    case 'cityGrew':
    case 'denounce':
    case 'attitudeShift':
    case 'eventChronicle':
    case 'policyAdopted':
    case 'tradeEstablished': return 'notify';
    default: return null;
  }
}
