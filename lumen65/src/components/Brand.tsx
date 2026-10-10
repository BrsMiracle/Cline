import { LAYOUT_META } from '../config/presets';

export function Brand() {
  return (
    <header className="brand reveal">
      <div className="brand__mark" aria-hidden="true">
        L
      </div>
      <div className="brand__text">
        <span className="brand__name">LUMEN</span>
        <span className="brand__sub">Keyboards · Est. 2024</span>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="panel reveal reveal--1" aria-labelledby="product-title">
      <p className="eyebrow">全铝 Gasket · 三模连接</p>
      <h1 className="hero__title" id="product-title">
        <span>LUMEN 65</span>
      </h1>
      <p className="hero__text">
        65% 紧凑布局，{LAYOUT_META.keyCount} 枚 PBT 键帽落在同一张阳极氧化铝定位板上。
        可换外壳配色与键帽主题，也可以把三层结构整个拆开看清楚它为什么这样好听。
      </p>
      <div className="chips">
        <span className="chip">
          <i className="chip__dot" aria-hidden="true" />
          <b>{LAYOUT_META.name}</b> 布局
        </span>
        <span className="chip">
          <b>{LAYOUT_META.keyCount}</b> 键
        </span>
        <span className="chip">
          铝合金 <b>一体化底壳</b>
        </span>
        <span className="chip">
          Gasket <b>缓震结构</b>
        </span>
      </div>
    </section>
  );
}
