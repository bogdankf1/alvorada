import type { ReactNode } from 'react';
import { appStore } from '../../app/store';

/**
 * Shared full-screen overlay shell: blurred scrim + art-deco header (title,
 * optional subtitle, optional right-side actions, Close) + a filled, scrollable
 * body. Click-scrim-to-close; Esc is handled globally in GameScreen.
 *  - variant 'wide'  : full-bleed body (for the Tech/Civics absolute grids)
 *  - variant 'sheet' : body capped to a readable width, centered (dashboards)
 */
export function OverlaySheet(props: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  variant?: 'wide' | 'sheet';
  children: ReactNode;
}) {
  const { title, subtitle, actions, variant = 'sheet', children } = props;
  const close = () => appStore.set({ overlay: null });
  return (
    <div className="overlay-scrim" onClick={close}>
      <div className={`sheet sheet--${variant}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <h2>{title}</h2>
          {subtitle != null && <span className="sheet__subtitle">{subtitle}</span>}
          <div className="grow" />
          {actions}
          <button className="btn" onClick={close}>Close (Esc)</button>
        </div>
        <div className="sheet__body scroll-quiet">{children}</div>
      </div>
    </div>
  );
}
