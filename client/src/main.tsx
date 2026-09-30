import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initPowerSave } from './utils/powerSave';

/* 节能模式：在 React 挂载前写入 <html data-power-save>，首帧即按模式渲染
   （极光背景等常驻动效由 React 渲染，故模块顶层写入已足够早，无需内联脚本） */
initPowerSave();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
