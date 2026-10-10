import type { ToastItem } from '../App';

export type LayerKey = 'caps' | 'plate' | 'case';

const LAYERS: Array<{ id: LayerKey; title: string; sub: string }> = [
  { id: 'caps', title: 'PBT 键帽', sub: '五面热升华 · 球帽高度' },
  { id: 'plate', title: '铝合金定位板', sub: 'Gasket 缓震 · 热插拔轴座' },
  { id: 'case', title: '一体成型底壳', sub: 'CNC 阳极氧化 · 5.7° 倾角' },
];

export function LayerLabels({
  register,
}: {
  register: (layer: LayerKey, el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="layer-labels" aria-hidden="true" data-testid="layer-labels">
      {LAYERS.map((layer) => (
        <div
          key={layer.id}
          className="layer-label"
          ref={(el) => register(layer.id, el)}
          data-layer={layer.id}
        >
          <span className="layer-label__dot" />
          <span className="layer-label__text">
            <span className="layer-label__title">{layer.title}</span>
            <span className="layer-label__sub">{layer.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function HintBar({
  typingMode,
  autoRotate,
  lastKey,
  count,
  onDisableTyping,
}: {
  typingMode: boolean;
  autoRotate: boolean;
  lastKey: string | null;
  count: number;
  onDisableTyping: () => void;
}) {
  return (
    <div className="hintbar" role="note">
      <span className="hintbar__item">
        <span className="kbd">拖动</span> 旋转
      </span>
      <span className="hintbar__sep" aria-hidden="true" />
      <span className="hintbar__item">
        <span className="kbd">滚轮</span> 缩放
      </span>
      <span className="hintbar__sep" aria-hidden="true" />
      <span className="hintbar__item">
        <span className="kbd">点击键帽</span> 触发手感
      </span>
      <span className="hintbar__sep" aria-hidden="true" />
      {typingMode ? (
        <>
          <span className="hintbar__item typing-hud">
            <span className="typing-hud__key" aria-live="polite" data-testid="typing-last">
              {lastKey ?? '—'}
            </span>
            已敲击 <b className="typing-hud__stat">{count}</b> 次
          </span>
          <span className="hintbar__sep" aria-hidden="true" />
          <span className="hintbar__item">
            <button type="button" className="linkish" onClick={onDisableTyping}>
              退出键盘体验
            </button>
          </span>
        </>
      ) : (
        <span className="hintbar__item">
          <span className="kbd">键盘体验模式</span> 开启后可直接敲 A–Z / 空格
        </span>
      )}
      <span className="hintbar__sep hintbar__item--optional" aria-hidden="true" />
      <span className="hintbar__item hintbar__item--optional">
        {autoRotate ? '缓慢自转中 · 拖动即停' : '自动旋转已停止'}
      </span>
    </div>
  );
}

export function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div className="toasts" aria-live="polite" data-testid="toasts">
      {items.map((item) => (
        <div className="toast" key={item.id}>
          <i className="toast__dot" aria-hidden="true" />
          {item.text}
        </div>
      ))}
    </div>
  );
}

export function WebGLFallback() {
  return (
    <div className="fallback" role="alert">
      <div className="fallback__card">
        <h2>无法启动 3D 预览</h2>
        <p>
          当前浏览器或设备没有可用的 WebGL 环境，因此 Three.js 无法渲染键盘模型。
          请使用支持 WebGL 的现代浏览器（Chrome / Edge / Safari / Firefox）并确认硬件加速已开启。
          本页的配置控件仍然可以通过键盘操作，配置会照常保存在本机。
        </p>
      </div>
    </div>
  );
}
