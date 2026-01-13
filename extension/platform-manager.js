/**
 * 平台管理器
 * 负责检测当前平台并返回对应的适配器
 */
class PlatformManager {
  constructor() {
    this.adapters = [];
  }

  /**
   * 注册平台适配器
   * @param {VideoPlatformAdapter} adapter - 平台适配器实例
   */
  registerAdapter(adapter) {
    if (!(adapter instanceof VideoPlatformAdapter)) {
      throw new Error("适配器必须继承自 VideoPlatformAdapter");
    }
    this.adapters.push(adapter);
  }

  /**
   * 根据当前URL获取匹配的平台适配器
   * @param {string} url - 当前页面URL
   * @returns {VideoPlatformAdapter|null} - 匹配的适配器，如果没有则返回null
   */
  getAdapter(url) {
    for (const adapter of this.adapters) {
      if (adapter.matches(url)) {
        return adapter;
      }
    }
    return null;
  }

  /**
   * 获取所有已注册的适配器
   * @returns {VideoPlatformAdapter[]}
   */
  getAllAdapters() {
    return [...this.adapters];
  }
}
