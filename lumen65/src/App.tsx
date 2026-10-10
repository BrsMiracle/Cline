import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage } from './three/Stage';
import { DEFAULT_CONFIG, type KeyDef, type ProductConfig } from './config/presets';
import { clearConfig, loadConfig, saveConfig } from './lib/storage';
import { Brand, Hero } from './components/Brand';
import { Configurator } from './components/Configurator';
import { Summary } from './components/Summary';
import {
  HintBar,
  LayerLabels,
  Toasts,
  WebGLFallback,
  type LayerKey,
} from './components/Overlays';

export interface ToastItem {
  id: number;
  text: string;
}

const timeNow = () =>
  new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function App() {
  const [config, setConfig] = useState<ProductConfig>(() => loadConfig());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<{ label: string; id: number } | null>(null);
  const [pressCount, setPressCount] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [webglFailed, setWebglFailed] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const labelsRef = useRef<Record<LayerKey, HTMLElement | null>>({
    caps: null,
    plate: null,
    case: null,
  });
  const configRef = useRef(config);
  configRef.current = config;
  const typingHintShown = useRef(false);
  const loadedRef = useRef(false);
  const skipSaveRef = useRef(false);

  /* ------------------------------------------------------------- toasts */

  const pushToast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2800);
  }, []);

  /* --------------------------------------------------------- stage setup */

  const onCapTap = useCallback(
    (key: KeyDef) => {
      if (!configRef.current.typingMode && !typingHintShown.current) {
        typingHintShown.current = true;
        pushToast('开启「键盘体验模式」后可以直接敲键盘体验');
      }
      setLastKey({ label: key.label || 'Space', id: Date.now() });
      setPressCount((n) => n + 1);
    },
    [pushToast],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let stage: Stage;
    try {
      stage = new Stage(host, {
        onCapTap,
        onFirstInteraction: () => setAutoRotate(false),
      });
    } catch (error) {
      console.error('[LUMEN 65] WebGL init failed', error);
      setWebglFailed(true);
      return;
    }
    stageRef.current = stage;
    stage.setLabelElements({
      caps: labelsRef.current.caps ?? undefined,
      plate: labelsRef.current.plate ?? undefined,
      case: labelsRef.current.case ?? undefined,
    });
    const initial = configRef.current;
    stage.setFinish(initial.finishId);
    stage.setTheme(initial.themeId);
    stage.setExploded(initial.exploded);
    stage.setTypingMode(initial.typingMode);
    stage.setSound(initial.sound);
    stage.setSpaceLegend(initial.spaceText);

    const debug = window as unknown as Record<string, unknown>;
    debug.__LUMEN__ = {
      stage,
      getConfig: () => configRef.current,
      projectKey: (code: string) => stage.projectKey(code),
      debug: () => stage.debug,
      setTypingMode: (v: boolean) => stage.setTypingMode(v),
    };
    loadedRef.current = true;

    return () => {
      stage.dispose();
      stageRef.current = null;
      debug.__LUMEN__ = undefined;
    };
  }, [onCapTap]);

  /* ---------------------------------------------- config → stage + storage */

  useEffect(() => {
    stageRef.current?.setFinish(config.finishId);
  }, [config.finishId]);

  useEffect(() => {
    stageRef.current?.setTheme(config.themeId);
  }, [config.themeId]);

  useEffect(() => {
    stageRef.current?.setExploded(config.exploded);
  }, [config.exploded]);

  useEffect(() => {
    stageRef.current?.setTypingMode(config.typingMode);
  }, [config.typingMode]);

  useEffect(() => {
    stageRef.current?.setSound(config.sound);
  }, [config.sound]);

  useEffect(() => {
    stageRef.current?.setSpaceLegend(config.spaceText);
  }, [config.spaceText]);

  useEffect(() => {
    // 「恢复默认」clears this page's key — don't immediately write it back
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    const ok = saveConfig(config);
    if (ok && loadedRef.current) setSavedAt(timeNow());
  }, [config]);


  /* ------------------------------------------------------------- keyboard */

  useEffect(() => {
    const isFormField = (el: EventTarget | Element | null) => {
      const node = el as HTMLElement | null;
      if (!node || !node.tagName) return false;
      const tag = node.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        node.isContentEditable === true
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return; // browser shortcuts
      if (event.repeat) return;
      const stage = stageRef.current;
      if (!stage || !configRef.current.typingMode) return;
      if (isFormField(event.target) || isFormField(document.activeElement)) return;
      const target = event.target as HTMLElement | null;
      const code = event.code;
      // never steal Space from a focused button / link
      if (code === 'Space' && target && (target.tagName === 'BUTTON' || target.tagName === 'A')) {
        return;
      }
      if (!stage.pressKey(code)) return;
      if (code === 'Space' || code.startsWith('Arrow')) event.preventDefault();
      const label = stage.model.keyByCode(code)[0]?.def.label ?? code;
      setLastKey({ label: label || 'Space', id: Date.now() });
      setPressCount((n) => n + 1);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!configRef.current.typingMode) return;
      stageRef.current?.releaseKey(event.code);
    };

    const releaseAll = () => stageRef.current?.model.releaseAll();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', releaseAll);
    };
  }, []);

  /* --------------------------------------------------------------- actions */

  const toggleExplode = useCallback(() => {
    setConfig((prev) => {
      const exploded = !prev.exploded;
      pushToast(exploded ? '拆解视图：键帽 / 定位板 / 底壳' : '已组装回到默认状态');
      return { ...prev, exploded };
    });
  }, [pushToast]);

  const toggleTyping = useCallback(() => {
    setConfig((prev) => {
      const typingMode = !prev.typingMode;
      if (typingMode) {
        // hand the keyboard back to the product instead of the focused button
        const active = document.activeElement as HTMLElement | null;
        if (active && active !== document.body) active.blur();
      }
      pushToast(typingMode ? '键盘体验模式已开启 · 试试 A–Z 或空格' : '键盘体验模式已关闭');
      return { ...prev, typingMode };
    });
  }, [pushToast]);

  const toggleSound = useCallback(() => {
    setConfig((prev) => {
      pushToast(prev.sound ? '按键音已关闭' : '按键音已开启');
      return { ...prev, sound: !prev.sound };
    });
  }, [pushToast]);

  const resetView = useCallback(() => {
    stageRef.current?.resetView();
    pushToast('视角已复位');
  }, [pushToast]);

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => {
      const next = !prev;
      stageRef.current?.setAutoRotate(next);
      return next;
    });
  }, []);

  const saveNow = useCallback(() => {
    const ok = saveConfig(configRef.current);
    setSavedAt(ok ? timeNow() : null);
    pushToast(ok ? '配置已保存到本机浏览器' : '当前浏览器不允许写入本地存储');
  }, [pushToast]);

  const resetDefaults = useCallback(() => {
    const canPersist = clearConfig();
    skipSaveRef.current = true;
    setConfig({ ...DEFAULT_CONFIG });
    stageRef.current?.setAutoRotate(true);
    setAutoRotate(true);
    setSavedAt(null);
    pushToast(canPersist ? '已恢复默认配置，本页记录已清除' : '已恢复默认配置（本地存储不可用）');
  }, [pushToast]);

  const buy = useCallback(() => pushToast('演示页面：这里会是真正的结算流程'), [pushToast]);

  const registerLabel = useCallback((layer: LayerKey, el: HTMLDivElement | null) => {
    labelsRef.current[layer] = el;
    const stage = stageRef.current;
    if (!stage) return;
    stage.setLabelElements({
      caps: (labelsRef.current.caps as HTMLElement | null) ?? undefined,
      plate: (labelsRef.current.plate as HTMLElement | null) ?? undefined,
      case: (labelsRef.current.case as HTMLElement | null) ?? undefined,
    });
  }, []);


  /* ---------------------------------------------------------------- render */

  return (
    <>
      <div className="hud">
        <div className="hud__left">
          <Brand />
          <Hero />
        </div>

        <div className="scene" aria-label="LUMEN 65 三维产品预览">
          <div className="scene__glow" aria-hidden="true" />
          <div className="scene__canvas" ref={hostRef} data-testid="canvas-host" />
          <div className="scene__vignette" aria-hidden="true" />
        </div>

        <div className="hud__foot">
          <Summary config={config} onBuy={buy} />
        </div>
        <div className="hud__right">
          <Configurator
            config={config}
            savedAt={savedAt}
            autoRotate={autoRotate}
            onFinish={(id) => setConfig((prev) => ({ ...prev, finishId: id }))}
            onTheme={(id) => setConfig((prev) => ({ ...prev, themeId: id }))}
            onSpaceText={(text) =>
              setConfig((prev) => ({ ...prev, spaceText: text.slice(0, 12) }))
            }
            onToggleExplode={toggleExplode}
            onToggleTyping={toggleTyping}
            onToggleSound={toggleSound}
            onResetView={resetView}
            onToggleAutoRotate={toggleAutoRotate}
            onSave={saveNow}
            onResetDefaults={resetDefaults}
          />
        </div>
      </div>

      <LayerLabels register={registerLabel} />
      <HintBar
        typingMode={config.typingMode}
        autoRotate={autoRotate}
        lastKey={lastKey?.label ?? null}
        count={pressCount}
        onDisableTyping={toggleTyping}
      />
      <Toasts items={toasts} />
      {webglFailed ? <WebGLFallback /> : null}
    </>
  );
}
