const LOCAL_DEBUG_STORAGE_KEY = "youtubegist_local_debug";
const REMOTE_BASE_URL = "https://host.996007.fun:4173/watch?v=";
const LOCAL_BASE_URL = "http://localhost:5173/watch?v=";

let GIST_BASE_URL = LOCAL_BASE_URL; // 默认使用远程服务器
const PANEL_ID = "ygist-panel";
const PANEL_HIDDEN_CLASS = "ygist-hidden";
const PANEL_COLLAPSED_CLASS = "ygist-collapsed";
const PANEL_EXPANDED_CLASS = "ygist-expanded";
const PANEL_STATE_STORAGE_KEY = "ygistExpanded";
const HAS_CHROME_STORAGE =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

let currentVideoId = null;
let panelEl;
let toggleBtnEl;
let bodyEl;
let iframeEl;
let statusEl;
let locationCheckTimer;
let mountCheckTimer;
let embedStatusTimer;
let resizeObserver;
let isExpanded = true;

// 初始化平台管理器
let platformManager;
let currentAdapter = null;

function initPlatformManager() {
  if (!platformManager) {
    platformManager = new PlatformManager();
    // 注册适配器
    platformManager.registerAdapter(new YouTubeAdapter());
    platformManager.registerAdapter(new BilibiliAdapter());
  }
  // 获取当前URL的适配器
  currentAdapter = platformManager.getAdapter(window.location.href);
  return currentAdapter;
}

(function init() {
  if (typeof document === "undefined") {
    return;
  }

  const bootstrap = () => {
    // 初始化平台管理器
    initPlatformManager();
    
    ensurePanel();
    attachPanel();
    handleLocationChange();

    // 根据当前适配器注册导航事件
    if (currentAdapter) {
      const navEvents = currentAdapter.getNavigationEvents();
      navEvents.forEach(({ target, event }) => {
        const targetObj = target === 'window' ? window : document;
        targetObj.addEventListener(event, handleLocationChange);
      });
    }

    // 兜底轮询，避免极端情况下事件未触发。
    locationCheckTimer = window.setInterval(() => {
      attachPanel();
      // 确保平台管理器已初始化
      if (!platformManager) {
        initPlatformManager();
      }
      // 重新获取适配器（URL可能已改变）
      const adapter = platformManager.getAdapter(window.location.href);
      if (adapter) {
        const resolvedId = adapter.extractVideoId(window.location.href);
        if (resolvedId !== currentVideoId) {
          handleLocationChange();
        }
      }
    }, 800);

    window.addEventListener("beforeunload", () => {
      clearTimers();
    });

    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "UPDATE_BASE_URL") {
        GIST_BASE_URL = message.isLocalDebug ? LOCAL_BASE_URL : REMOTE_BASE_URL;
        // 如果当前有视频在加载，重新加载
        if (currentVideoId && isExpanded) {
          loadCurrentVideo();
        }
      }
    });
  };

  const startWhenReady = () => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
    } else {
      bootstrap();
    }
  };

  if (HAS_CHROME_STORAGE) {
    // 读取面板状态和local debug设置
    chrome.storage.local.get({ 
      [PANEL_STATE_STORAGE_KEY]: isExpanded,
      [LOCAL_DEBUG_STORAGE_KEY]: true 
    }, (result) => {
      if (!chrome.runtime || !chrome.runtime.lastError) {
        const stored = result ? result[PANEL_STATE_STORAGE_KEY] : undefined;
        if (typeof stored === "boolean") {
          isExpanded = stored;
        }
        
        // 更新GIST_BASE_URL
        const isLocalDebug = result[LOCAL_DEBUG_STORAGE_KEY] !== undefined ? result[LOCAL_DEBUG_STORAGE_KEY] : true;
        GIST_BASE_URL = isLocalDebug ? LOCAL_BASE_URL : REMOTE_BASE_URL;
      } else {
        console.warn("YouTubeGist: 读取设置失败", chrome.runtime.lastError);
      }
      startWhenReady();
    });
  } else {
    startWhenReady();
  }
})();

function clearTimers() {
  if (locationCheckTimer) {
    window.clearInterval(locationCheckTimer);
    locationCheckTimer = undefined;
  }
  if (mountCheckTimer) {
    window.clearInterval(mountCheckTimer);
    mountCheckTimer = undefined;
  }
  if (embedStatusTimer) {
    window.clearTimeout(embedStatusTimer);
    embedStatusTimer = undefined;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = undefined;
  }
}

function ensurePanel() {
  if (panelEl || !document.body) {
    return;
  }

  panelEl = document.createElement("section");
  panelEl.id = PANEL_ID;
  panelEl.classList.add(PANEL_HIDDEN_CLASS);
  if (isExpanded) {
    panelEl.classList.add(PANEL_EXPANDED_CLASS);
  } else {
    panelEl.classList.add(PANEL_COLLAPSED_CLASS);
  }

  toggleBtnEl = document.createElement("button");
  toggleBtnEl.id = "ygist-toggle";
  toggleBtnEl.type = "button";
  // 按钮文本将在 showPanel 中根据当前平台更新
  toggleBtnEl.textContent = "YouTubeGist";
  toggleBtnEl.disabled = true;
  toggleBtnEl.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  toggleBtnEl.addEventListener("click", () => {
    if (isExpanded) {
      collapsePanel();
    } else {
      expandPanel();
    }
  });
  panelEl.appendChild(toggleBtnEl);

  bodyEl = document.createElement("div");
  bodyEl.className = "ygist-panel-body";

  statusEl = document.createElement("div");
  statusEl.id = "ygist-status";
  statusEl.style.display = "none";
  bodyEl.appendChild(statusEl);

  const frameShell = document.createElement("div");
  frameShell.id = "ygist-frame-shell";

  iframeEl = document.createElement("iframe");
  iframeEl.id = "ygist-frame";
  iframeEl.title = "YouTubeGist 页面";
  iframeEl.referrerPolicy = "no-referrer";
  iframeEl.addEventListener("load", () => {
    iframeEl.dataset.loaded = "true";
    setStatus("");
  });

  frameShell.appendChild(iframeEl);
  bodyEl.appendChild(frameShell);

  panelEl.appendChild(bodyEl);
  document.body.appendChild(panelEl);
}

function handleLocationChange() {
  // 确保平台管理器已初始化
  if (!platformManager) {
    initPlatformManager();
  }
  
  // 重新获取适配器（URL可能已改变）
  currentAdapter = platformManager.getAdapter(window.location.href);
  
  ensurePanel();
  attachPanel();

  if (!panelEl) {
    return;
  }

  // 如果没有匹配的适配器，隐藏面板
  if (!currentAdapter) {
    currentVideoId = null;
    hidePanel();
    return;
  }

  const videoId = currentAdapter.extractVideoId(window.location.href);

  if (!videoId) {
    currentVideoId = null;
    hidePanel();
    return;
  }

  showPanel();

  const videoChanged = videoId !== currentVideoId;
  currentVideoId = videoId;

  if (!isExpanded) {
    clearEmbed();
    setStatus("");
    return;
  }

  const currentSrc = iframeEl.getAttribute("src");
  if (videoChanged || !currentSrc) {
    loadCurrentVideo();
  }
}

function showPanel() {
  panelEl.classList.remove(PANEL_HIDDEN_CLASS);
  toggleBtnEl.disabled = false;

  // 更新按钮文本以显示当前平台
  if (currentAdapter) {
    const platformName = currentAdapter.getPlatformName();
    toggleBtnEl.textContent = `${platformName}Gist`;
  } else {
    toggleBtnEl.textContent = "YouTubeGist";
  }

  if (isExpanded) {
    panelEl.classList.add(PANEL_EXPANDED_CLASS);
    panelEl.classList.remove(PANEL_COLLAPSED_CLASS);
    // 设置初始高度
    updateIframeHeight();
    // 设置ResizeObserver来监听播放器大小变化
    setupResizeObserver();
  } else {
    panelEl.classList.add(PANEL_COLLAPSED_CLASS);
    panelEl.classList.remove(PANEL_EXPANDED_CLASS);
  }

  toggleBtnEl.setAttribute("aria-expanded", isExpanded ? "true" : "false");
}

function hidePanel() {
  if (!panelEl) {
    return;
  }

  panelEl.classList.add(PANEL_HIDDEN_CLASS);
  toggleBtnEl.disabled = true;
  clearEmbed();
  setStatus("");
}

function attachPanel() {
  if (!panelEl) {
    return;
  }

  const host = findPanelHost();

  if (!host) {
    if (!mountCheckTimer) {
      mountCheckTimer = window.setInterval(() => {
        if (findPanelHost()) {
          attachPanel();
        }
      }, 500);
    }
    return;
  }

  if (mountCheckTimer) {
    window.clearInterval(mountCheckTimer);
    mountCheckTimer = undefined;
  }

  // 如果 panelEl 已经在正确的 host 中，且是第一个子元素，则无需操作
  if (panelEl.parentElement === host && panelEl === host.firstChild) {
    return;
  }

  // 需要移动 panelEl 到 host 的最前面
  host.insertBefore(panelEl, host.firstChild);
}

function findPanelHost() {
  if (!currentAdapter) {
    return document.body || null;
  }

  const selectors = currentAdapter.getPanelHostSelectors();

  for (const selector of selectors) {
    const candidate = document.querySelector(selector);
    if (candidate instanceof HTMLElement) {
      return candidate;
    }
  }

  return document.body || null;
}

// extractYouTubeVideoId 函数已被适配器的 extractVideoId 方法替代

function getPlayerHeight() {
  if (!currentAdapter) {
    return 480;
  }

  // 使用适配器提供的播放器选择器
  const selectors = currentAdapter.getPlayerSelectors();

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.offsetHeight > 0) {
      return element.offsetHeight;
    }
  }

  // 如果找不到播放器，返回默认高度
  return 480;
}

function updateIframeHeight() {
  if (!iframeEl) {
    return;
  }

  const playerHeight = getPlayerHeight() - 50; // 减去50像素偏移
  const frameShell = document.getElementById('ygist-frame-shell');
  
  if (frameShell) {
    frameShell.style.height = `${playerHeight}px`;
  }
}

function setupResizeObserver() {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  if (!currentAdapter) {
    return;
  }

  // 使用适配器提供的播放器选择器
  const playerSelectors = currentAdapter.getPlayerSelectors();

  for (const selector of playerSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      resizeObserver = new ResizeObserver(() => {
        updateIframeHeight();
      });
      resizeObserver.observe(element);
      break;
    }
  }
}

function expandPanel() {
  if (!panelEl) {
    return;
  }

  isExpanded = true;
  panelEl.classList.add(PANEL_EXPANDED_CLASS);
  panelEl.classList.remove(PANEL_COLLAPSED_CLASS);
  toggleBtnEl.setAttribute("aria-expanded", "true");
  persistPanelState();
  // 设置高度和ResizeObserver
  updateIframeHeight();
  setupResizeObserver();
  loadCurrentVideo();
}

function collapsePanel() {
  if (!panelEl) {
    return;
  }

  isExpanded = false;
  panelEl.classList.add(PANEL_COLLAPSED_CLASS);
  panelEl.classList.remove(PANEL_EXPANDED_CLASS);
  toggleBtnEl.setAttribute("aria-expanded", "false");
  persistPanelState();
  // 清理ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = undefined;
  }
  clearEmbed();
  setStatus("");
}

async function loadCurrentVideo() {
  if (!currentVideoId || !currentAdapter) {
    const platformName = currentAdapter ? currentAdapter.getPlatformName() : "视频平台";
    setStatus(`请在 ${platformName} 视频页面中使用 YouTubeGist 面板。`);
    return;
  }

  try {
    // 使用适配器构建Gist URL（异步方法）
    const gistUrl = await currentAdapter.buildGistUrl(currentVideoId, GIST_BASE_URL);
    iframeEl.dataset.loaded = "false";
    setStatus("正在加载对应的 YouTubeGist 页面...");
    iframeEl.src = gistUrl;

    if (embedStatusTimer) {
      window.clearTimeout(embedStatusTimer);
    }

    embedStatusTimer = window.setTimeout(() => {
      if (iframeEl.dataset.loaded !== "true") {
        setStatus("如果页面无法正常显示，请点击上方链接在新标签页打开。");
      }
    }, 3500);
  } catch (error) {
    console.error("YouTubeGist: 加载视频失败", error);
    setStatus("加载失败，请稍后重试。");
  }
}

function clearEmbed() {
  if (!iframeEl) {
    return;
  }

  if (embedStatusTimer) {
    window.clearTimeout(embedStatusTimer);
    embedStatusTimer = undefined;
  }

  iframeEl.removeAttribute("src");
  iframeEl.dataset.loaded = "false";
}

function setStatus(message) {
  if (!statusEl) {
    return;
  }

  if (!message) {
    statusEl.textContent = "";
    statusEl.style.display = "none";
    return;
  }

  statusEl.textContent = message;
  statusEl.style.display = "block";
}

function persistPanelState() {
  if (!HAS_CHROME_STORAGE) {
    return;
  }

  chrome.storage.local.set({ [PANEL_STATE_STORAGE_KEY]: isExpanded }, () => {
    if (chrome.runtime && chrome.runtime.lastError) {
      console.warn("YouTubeGist: 保存面板状态失败", chrome.runtime.lastError);
    }
  });
}
