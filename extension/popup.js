const LOCAL_DEBUG_STORAGE_KEY = "youtubegist_local_debug";

const statusEl = document.getElementById("status");
const localDebugCheckbox = document.getElementById("local-debug");

init().catch((error) => {
  console.error(error);
  setStatus("加载设置时出错，请重试。" + (error?.message ? `\n${error.message}` : ""));
});

async function init() {
  // 加载保存的设置
  await loadSettings();
  
  // 监听复选框变化
  localDebugCheckbox.addEventListener("change", handleLocalDebugChange);
}

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([LOCAL_DEBUG_STORAGE_KEY]);
    const isLocalDebug = result[LOCAL_DEBUG_STORAGE_KEY] || false;
    localDebugCheckbox.checked = isLocalDebug;
  } catch (error) {
    console.warn("读取设置失败:", error);
    setStatus("读取设置失败，使用默认配置。");
  }
}

async function handleLocalDebugChange() {
  const isLocalDebug = localDebugCheckbox.checked;
  
  try {
    await chrome.storage.local.set({ [LOCAL_DEBUG_STORAGE_KEY]: isLocalDebug });
    setStatus("设置已保存");
    
    // 通知content script更新URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      // 检查是否在支持的平台上（YouTube或Bilibili）
      const supportedPlatforms = ["youtube.com", "youtu.be", "bilibili.com", "b23.tv"];
      const isSupportedPlatform = supportedPlatforms.some(platform => tab.url.includes(platform));
      
      if (isSupportedPlatform) {
        chrome.tabs.sendMessage(tab.id, { 
          type: "UPDATE_BASE_URL", 
          isLocalDebug: isLocalDebug 
        }).catch(() => {
          // content script可能还没加载，忽略错误
        });
      }
    }
  } catch (error) {
    console.error("保存设置失败:", error);
    setStatus("保存设置失败，请重试。");
  }
}

function setStatus(message) {
  if (!message) {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
    return;
  }

  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
}
