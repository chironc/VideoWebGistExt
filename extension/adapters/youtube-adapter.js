/**
 * YouTube平台适配器
 */
class YouTubeAdapter extends VideoPlatformAdapter {
  /**
   * 提取YouTube视频ID
   * 支持格式：
   * - https://www.youtube.com/watch?v=VIDEO_ID
   * - https://m.youtube.com/watch?v=VIDEO_ID
   * - https://youtu.be/VIDEO_ID
   * - https://youtube-nocookie.com/embed/VIDEO_ID
   */
  extractVideoId(url) {
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname.replace(/^www\./, "");

      if (host === "youtube.com" || host === "m.youtube.com") {
        return urlObj.searchParams.get("v");
      }

      if (host === "youtu.be") {
        return urlObj.pathname.slice(1) || null;
      }

      if (host === "youtube-nocookie.com") {
        const embedMatch = urlObj.pathname.match(/\/embed\/([\w-]{11})/);
        return embedMatch ? embedMatch[1] : null;
      }
    } catch (error) {
      console.warn("YouTubeGist: 无法解析YouTube链接", error);
    }

    return null;
  }

  /**
   * 构建Gist服务URL（异步方法）
   * 格式: http://127.0.0.1:5173/watch?v=VIDEO_ID&platform=youtube
   */
  async buildGistUrl(videoId, baseUrl) {
    return `${baseUrl}${videoId}&platform=youtube`;
  }

  /**
   * 获取面板插入位置的选择器
   */
  getPanelHostSelectors() {
    return [
      "#secondary-inner",
      "#secondary",
      "ytd-watch-flexy #secondary-inner",
      "ytd-watch-flexy #secondary"
    ];
  }

  /**
   * 获取播放器选择器
   */
  getPlayerSelectors() {
    return [
      '#movie_player',
      '#player',
      'ytd-player #movie_player',
      'ytd-player #player',
      '.html5-video-player',
      'video'
    ];
  }

  /**
   * 获取导航事件配置
   */
  getNavigationEvents() {
    return [
      { target: 'window', event: 'yt-navigate-finish' },
      { target: 'window', event: 'popstate' },
      { target: 'document', event: 'yt-page-data-updated' }
    ];
  }

  /**
   * 获取平台名称
   */
  getPlatformName() {
    return "YouTube";
  }

  /**
   * 检查URL是否匹配YouTube
   */
  matches(url) {
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname.replace(/^www\./, "");
      return host === "youtube.com" || 
             host === "m.youtube.com" || 
             host === "youtu.be" ||
             host === "youtube-nocookie.com";
    } catch {
      return false;
    }
  }
}
