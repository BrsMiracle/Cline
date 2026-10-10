import { FINISHES, THEMES, getFinish, getTheme, type ProductConfig } from '../config/presets';

export interface ConfiguratorProps {
  config: ProductConfig;
  savedAt: string | null;
  autoRotate: boolean;
  onFinish: (id: string) => void;
  onTheme: (id: string) => void;
  onSpaceText: (text: string) => void;
  onToggleExplode: () => void;
  onToggleTyping: () => void;
  onToggleSound: () => void;
  onResetView: () => void;
  onToggleAutoRotate: () => void;
  onSave: () => void;
  onResetDefaults: () => void;
}

export function Configurator(props: ConfiguratorProps) {
  const { config } = props;
  const finish = getFinish(config.finishId);
  const theme = getTheme(config.themeId);

  return (
    <section className="panel reveal reveal--1" aria-label="产品配置">
      <h2 className="panel__title">
        <span>配置你的 LUMEN 65</span>
        <span aria-hidden="true">01</span>
      </h2>

      <div className="field">
        <div className="field__label">
          <span>外壳配色</span>
          <span className="field__value">{finish.name}</span>
        </div>
        <div className="swatches" role="radiogroup" aria-label="外壳配色">
          {FINISHES.map((item) => {
            const active = item.id === config.finishId;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`swatch${active ? ' swatch--active' : ''}`}
                onClick={() => props.onFinish(item.id)}
                data-testid={`finish-${item.id}`}
              >
                <span className="swatch__sw" style={{ background: item.swatch }} aria-hidden="true" />
                <span className="swatch__name">{item.name}</span>
                <span className="swatch__en">{item.nameEn}</span>
                <span className="swatch__check" aria-hidden="true">
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <div className="field__label">
          <span>键帽主题</span>
          <span className="field__value">{theme.name}</span>
        </div>
        <div className="swatches" role="radiogroup" aria-label="键帽主题">
          {THEMES.map((item) => {
            const active = item.id === config.themeId;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`swatch${active ? ' swatch--active' : ''}`}
                onClick={() => props.onTheme(item.id)}
                data-testid={`theme-${item.id}`}
              >
                <span className="swatch__sw" style={{ background: item.swatch }} aria-hidden="true" />
                <span className="swatch__name">{item.name}</span>
                <span className="swatch__en">{item.nameEn}</span>
                <span className="swatch__check" aria-hidden="true">
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <div className="field__label">
          <label htmlFor="space-legend">空格刻字</label>
          <span className="field__value">{config.spaceText || '留白'}</span>
        </div>
        <input
          id="space-legend"
          className="text-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          value={config.spaceText}
          placeholder="例如 LUMEN 65"
          onChange={(event) => props.onSpaceText(event.target.value)}
          data-testid="space-text"
        />
        <p className="field__hint">刻在空格键帽上 · 输入框聚焦时不会劫持按键</p>
      </div>

      <div className="field">
        <div className="field__label">
          <span>结构与体验</span>
          <span className="field__value">{config.exploded ? '已拆解' : '已组装'}</span>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn--wide"
            aria-pressed={config.exploded}
            onClick={props.onToggleExplode}
            data-testid="toggle-explode"
          >
            {config.exploded ? '组装回去' : '拆解三层结构'}
          </button>
          <div className="action-row">
            <button
              type="button"
              className="btn"
              aria-pressed={config.typingMode}
              onClick={props.onToggleTyping}
              data-testid="toggle-typing"
            >
              键盘体验模式
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={config.sound}
              onClick={props.onToggleSound}
              data-testid="toggle-sound"
            >
              {config.sound ? '按键音 开' : '按键音 关'}
            </button>
          </div>
          <div className="action-row">
            <button type="button" className="btn" onClick={props.onResetView} data-testid="reset-view">
              复位视角
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={props.autoRotate}
              onClick={props.onToggleAutoRotate}
            >
              自动旋转
            </button>
          </div>
        </div>
      </div>

      <div className="save-row">
        <span className="save-state">
          <i className="save-state__dot" aria-hidden="true" />
          {props.savedAt ? `已自动保存到本机 · ${props.savedAt}` : '尚未保存'}
        </span>
        <span>
          <button type="button" className="linkish" onClick={props.onSave} data-testid="save-config">
            立即保存
          </button>
          <button
            type="button"
            className="linkish"
            onClick={props.onResetDefaults}
            data-testid="reset-defaults"
          >
            恢复默认
          </button>
        </span>
      </div>
    </section>
  );
}
