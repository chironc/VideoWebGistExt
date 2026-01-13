/**
 * 视频平台适配器基类
 * 每个视频平台需要实现此接口
 */
class VideoPlatformAdapter {
  /**
   * 提取视频ID
   * @param {string} url - 当前页面URL
   * @returns {string|null} - 视频ID，如果不是视频页面则返回null
   */
  extractVideoId(url) {
    throw new Error("必须实现 extractVideoId 方法");
  }

  /**
   * 构建Gist服务URL（异步方法）
   * @param {string} videoId - 视频ID
   * @param {string} baseUrl - Gist服务基础URL
   * @returns {Promise<string>} - 完整的Gist URL
   */
  async buildGistUrl(videoId, baseUrl) {
    throw new Error("必须实现 buildGistUrl 方法");
  }

  /**
   * 获取面板插入位置的选择器列表（按优先级排序）
   * @returns {string[]} - CSS选择器数组
   */
  getPanelHostSelectors() {
    throw new Error("必须实现 getPanelHostSelectors 方法");
  }

  /**
   * 获取播放器元素的选择器列表（用于计算高度）
   * @returns {string[]} - CSS选择器数组
   */
  getPlayerSelectors() {
    throw new Error("必须实现 getPlayerSelectors 方法");
  }

  /**
   * 获取用于监听页面导航的事件配置
   * @returns {Array<{target: string, event: string}>} - 事件配置数组
   *   target: 'window' | 'document'
   *   event: 事件名称
   */
  getNavigationEvents() {
    throw new Error("必须实现 getNavigationEvents 方法");
  }

  /**
   * 获取平台名称（用于日志和状态提示）
   * @returns {string} - 平台名称
   */
  getPlatformName() {
    throw new Error("必须实现 getPlatformName 方法");
  }

  /**
   * 检查当前URL是否匹配此平台
   * @param {string} url - 当前页面URL
   * @returns {boolean} - 是否匹配
   */
  matches(url) {
    throw new Error("必须实现 matches 方法");
  }
}
