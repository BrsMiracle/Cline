import { LAYOUT_META, getFinish, getTheme, type ProductConfig } from '../config/presets';

export interface SummaryProps {
  config: ProductConfig;
  onBuy: () => void;
}

export function Summary({ config, onBuy }: SummaryProps) {
  const finish = getFinish(config.finishId);
  const theme = getTheme(config.themeId);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

  return (
    <section className="panel reveal reveal--2" aria-label="配置摘要">
      <h2 className="panel__title">
        <span>配置摘要</span>
        <span aria-hidden="true">02</span>
      </h2>
      <div className="summary" data-testid="summary">
        <div className="summary__row">
          <span className="summary__key">外壳配色</span>
          <span className="summary__val" data-testid="summary-finish">
            <i
              className="summary__dot"
              style={{ background: finish.swatch }}
              aria-hidden="true"
            />
            {finish.name} · {finish.nameEn}
          </span>
        </div>
        <div className="summary__row">
          <span className="summary__key">键帽主题</span>
          <span className="summary__val" data-testid="summary-theme">
            <i
              className="summary__dot"
              style={{ background: hex(theme.base) }}
              aria-hidden="true"
            />
            {theme.name} · {theme.nameEn}
          </span>
        </div>
        <div className="summary__row">
          <span className="summary__key">空格刻字</span>
          <span className="summary__val" data-testid="summary-space">
            {config.spaceText || '留白'}
          </span>
        </div>
        <div className="summary__row">
          <span className="summary__key">布局</span>
          <span className="summary__val">
            {LAYOUT_META.name} · {LAYOUT_META.keyCount} 键 · {LAYOUT_META.widthU}u
          </span>
        </div>
        <div className="summary__row">
          <span className="summary__key">状态</span>
          <span className="summary__val" data-testid="summary-state">
            {config.exploded ? '拆解视图 · 三层分离' : '已组装 · 可正常输入'}
          </span>
        </div>
      </div>

      <div className="price-tag" style={{ marginTop: 16 }}>
        <span className="price-tag__num">¥ 1,299</span>
        <span className="price-tag__note">含 PBT 键帽套装 · 顺丰包邮</span>
      </div>
      <button type="button" className="btn btn--primary btn--wide" onClick={onBuy}>
        加入购物车
      </button>
    </section>
  );
}
