/**
 * Bilibili平台适配器
 */
class BilibiliAdapter extends VideoPlatformAdapter {
  /**
   * 提取B站视频ID
   * 支持格式：
   * - https://www.bilibili.com/video/BVxxxxx
   * - https://www.bilibili.com/video/avxxxxx
   * - https://b23.tv/xxxxx (短链接，需要解析)
   */
  extractVideoId(url) {
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname.replace(/^www\./, "");

      // 标准B站域名
      if (host === "bilibili.com" || host === "m.bilibili.com") {
        // 匹配 /video/BVxxxxx 或 /video/avxxxxx
        const videoMatch = urlObj.pathname.match(/\/(?:video\/)?(BV[a-zA-Z0-9]+|av\d+)/i);
        if (videoMatch) {
          return videoMatch[1]; // 返回 BV号 或 av号
        }
      }

      // 短链接 b23.tv
      if (host === "b23.tv") {
        // 短链接需要实际访问才能获取真实URL，这里先返回路径
        // 实际应用中可能需要先解析短链接
        const path = urlObj.pathname.slice(1);
        if (path) {
          // 尝试从路径中提取可能的ID
          // 注意：b23.tv的短链接无法直接提取BV/AV号，需要解析
          // 这里先返回路径，实际使用时可能需要额外处理
          return path;
        }
      }
    } catch (error) {
      console.warn("YouTubeGist: 无法解析B站链接", error);
    }

    return null;
  }

  /**
   * 构建Gist服务URL（异步方法）
   * 格式: http://127.0.0.1:5173/watch?v=VIDEO_ID&platform=bilibili
   * 对于B站，会自动获取字幕URL并附加到参数中
   */
  async buildGistUrl(videoId, baseUrl) {
    let gistUrl = `${baseUrl}${videoId}&platform=bilibili`;
    
    console.log("YouTubeGist: buildGistUrl - 开始构建URL", {
      videoId: videoId,
      baseUrl: baseUrl,
      initialGistUrl: gistUrl
    });
    
    // 对于B站，自动获取字幕URL
    try {
      console.log("YouTubeGist: buildGistUrl - 开始获取字幕URL");
      const subtitleUrl = await this.getSubtitleUrl();
      console.log("YouTubeGist: buildGistUrl - getSubtitleUrl返回结果", {
        subtitleUrl: subtitleUrl,
        hasSubtitleUrl: !!subtitleUrl
      });
      
      if (subtitleUrl) {
        // 处理流程：URL解码 -> base64编码 -> URL编码
        // 1. 先URL解码（如果字幕URL已经是URL编码的）
        const decodedSubtitleUrl = decodeURIComponent(subtitleUrl);
        // 2. 然后base64编码
        const base64SubtitleUrl = btoa(decodedSubtitleUrl);
        // 3. 最后URL编码以避免特殊字符问题
        const encodedSubtitleUrl = encodeURIComponent(base64SubtitleUrl);
        gistUrl += `&subtitle_url=${encodedSubtitleUrl}`;
        console.log("YouTubeGist: buildGistUrl - 已获取字幕URL并附加", {
          originalSubtitleUrl: subtitleUrl,
          decodedSubtitleUrl: decodedSubtitleUrl,
          base64SubtitleUrl: base64SubtitleUrl,
          encodedSubtitleUrl: encodedSubtitleUrl,
          encoding: 'url-decode -> base64 -> url-encode',
          finalGistUrl: gistUrl
        });
      } else {
        console.warn("YouTubeGist: buildGistUrl - 无法获取字幕URL，返回基础URL", {
          gistUrl: gistUrl
        });
      }
    } catch (error) {
      console.error("YouTubeGist: buildGistUrl - 获取字幕URL失败", {
        error: error,
        errorMessage: error.message,
        errorStack: error.stack,
        gistUrl: gistUrl
      });
      // 即使获取失败，也返回基础URL
    }
    
    console.log("YouTubeGist: buildGistUrl - 最终返回URL", {
      gistUrl: gistUrl,
      hasSubtitleUrl: gistUrl.includes('subtitle_url')
    });
    
    return gistUrl;
  }

  /**
   * 获取字幕URL（异步方法）
   * 从B站API获取字幕URL并返回
   * @returns {Promise<string|null>} 字幕URL，如果获取失败返回null
   */
  async getSubtitleUrl() {
    try {
      console.log("YouTubeGist: getSubtitleUrl - 开始获取字幕URL");
      
      // 1. 获取aid和cid
      console.log("YouTubeGist: getSubtitleUrl - 开始获取aid和cid");
      const aidCid = await this.getAidAndCid();
      console.log("YouTubeGist: getSubtitleUrl - getAidAndCid返回结果", {
        aidCid: aidCid,
        hasAid: !!aidCid?.aid,
        hasCid: !!aidCid?.cid
      });
      
      if (!aidCid || !aidCid.aid || !aidCid.cid) {
        console.warn("YouTubeGist: getSubtitleUrl - 无法获取aid和cid，无法获取字幕URL", {
          aidCid: aidCid
        });
        return null;
      }

      // 2. 调用B站API获取字幕信息
      const apiUrl = `https://api.bilibili.com/x/player/wbi/v2?aid=${aidCid.aid}&cid=${aidCid.cid}`;
      console.log("YouTubeGist: getSubtitleUrl - 调用B站API获取字幕URL", { 
        apiUrl: apiUrl, 
        aid: aidCid.aid, 
        cid: aidCid.cid 
      });

      const response = await fetch(apiUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Referer': window.location.href,
          'User-Agent': navigator.userAgent
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("YouTubeGist: getSubtitleUrl - API响应数据", {
        code: data.code,
        message: data.message,
        hasData: !!data.data,
        hasSubtitle: !!data.data?.subtitle,
        hasSubtitles: !!data.data?.subtitle?.subtitles,
        subtitlesLength: data.data?.subtitle?.subtitles?.length || 0
      });
      
      if (data.code !== 0) {
        console.error("YouTubeGist: getSubtitleUrl - B站API返回错误", {
          code: data.code,
          message: data.message
        });
        throw new Error(`B站API错误: ${data.message || '未知错误'}`);
      }

      if (!data.data || !data.data.subtitle || !data.data.subtitle.subtitles || data.data.subtitle.subtitles.length === 0) {
        console.warn("YouTubeGist: getSubtitleUrl - 该视频没有可用的字幕", {
          hasData: !!data.data,
          hasSubtitle: !!data.data?.subtitle,
          hasSubtitles: !!data.data?.subtitle?.subtitles,
          subtitlesLength: data.data?.subtitle?.subtitles?.length || 0
        });
        return null;
      }

      // 3. 提取字幕信息并选择优先字幕
      const subtitles = data.data.subtitle.subtitles;
      console.log("YouTubeGist: getSubtitleUrl - 找到字幕列表", {
        subtitlesCount: subtitles.length,
        subtitles: subtitles.map(s => ({ lan: s.lan, lan_doc: s.lan_doc, hasUrl: !!s.subtitle_url, hasUrlV2: !!s.subtitle_url_v2 }))
      });
      
      // 优先获取AI字幕（ai-zh > ai-en > 其他AI字幕）
      const aiSubtitles = subtitles.filter(s => s.lan && s.lan.startsWith('ai-'));
      console.log("YouTubeGist: getSubtitleUrl - AI字幕筛选结果", {
        aiSubtitlesCount: aiSubtitles.length,
        aiSubtitles: aiSubtitles.map(s => ({ lan: s.lan, lan_doc: s.lan_doc }))
      });
      
      const preferredSubtitle = aiSubtitles.find(s => s.lan === 'ai-zh') || 
                               aiSubtitles.find(s => s.lan === 'ai-en') || 
                               aiSubtitles[0] ||
                               subtitles[0];

      console.log("YouTubeGist: getSubtitleUrl - 选择的字幕", {
        preferredSubtitle: preferredSubtitle ? {
          lan: preferredSubtitle.lan,
          lan_doc: preferredSubtitle.lan_doc,
          hasUrl: !!preferredSubtitle.subtitle_url,
          hasUrlV2: !!preferredSubtitle.subtitle_url_v2
        } : null
      });

      if (!preferredSubtitle) {
        console.warn("YouTubeGist: getSubtitleUrl - 未找到合适的字幕");
        return null;
      }

      // 4. 获取字幕URL（优先使用subtitle_url）
      const subtitleUrl = preferredSubtitle.subtitle_url || preferredSubtitle.subtitle_url_v2;
      console.log("YouTubeGist: getSubtitleUrl - 字幕URL", {
        subtitleUrl: subtitleUrl,
        subtitleUrlV2: preferredSubtitle.subtitle_url_v2,
        subtitleUrlOriginal: preferredSubtitle.subtitle_url
      });
      
      if (!subtitleUrl) {
        console.warn("YouTubeGist: getSubtitleUrl - 字幕对象中没有URL");
        return null;
      }

      // 5. 构建完整的字幕URL
      const fullSubtitleUrl = subtitleUrl.startsWith('//') ? `https:${subtitleUrl}` : subtitleUrl;
      
      console.log("YouTubeGist: getSubtitleUrl - 成功获取字幕URL", {
        lan: preferredSubtitle.lan,
        lan_doc: preferredSubtitle.lan_doc,
        originalUrl: subtitleUrl,
        fullSubtitleUrl: fullSubtitleUrl
      });

      return fullSubtitleUrl;
    } catch (error) {
      console.error("YouTubeGist: 获取字幕URL失败", error);
      return null;
    }
  }

  /**
   * 获取面板插入位置的选择器
   * B站右侧推荐区域的选择器
   * 注意：需要插入到右侧推荐列表的容器，而不是视频信息区域（.v-wrap）
   */
  getPanelHostSelectors() {
    return [
      // 优先插入到弹幕框容器的最前面
      "#danmukuBox",                   // 弹幕框容器（ID选择器）
      ".danmaku-box",                   // 弹幕框容器（类选择器）
      // 其次查找右侧推荐列表的父容器
      ".recommend-list-container",     // 推荐列表容器
      ".video-recommend-container",    // 视频推荐容器
      ".right-recommend",              // 右侧推荐
      ".right-container",              // 右侧容器
      "#app .right-container",         // 带app容器的右侧容器
      ".bili-layout-right",            // B站布局右侧
      ".layout-right",                 // 布局右侧
      "#app .layout-right"             // 带app容器的布局右侧
      // 完全排除 .v-wrap 和 .video-info-right，因为它们包含UP主信息
    ];
  }

  /**
   * 获取播放器选择器
   * B站播放器选择器
   */
  getPlayerSelectors() {
    return [
      '#bilibili-player',           // B站播放器ID
      '.bpx-player-container',      // 播放器容器
      '.bilibili-player-video-wrap', // 播放器视频包装器
      '.bpx-player-wrap',           // 播放器包装器
      '#bilibili-player video',     // 播放器内的video元素
      '.bpx-player video'           // 播放器内的video元素（备选）
    ];
  }

  /**
   * 获取导航事件配置
   * B站可能使用不同的导航事件
   */
  getNavigationEvents() {
    return [
      { target: 'window', event: 'popstate' },      // 浏览器历史记录变化
      { target: 'window', event: 'pushstate' },     // 如果B站使用pushState
      { target: 'window', event: 'hashchange' }     // URL hash变化
    ];
  }

  /**
   * 获取平台名称
   */
  getPlatformName() {
    return "Bilibili";
  }

  /**
   * 检查URL是否匹配B站
   */
  matches(url) {
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname.replace(/^www\./, "");
      return host === "bilibili.com" || 
             host === "m.bilibili.com" ||
             host === "b23.tv";
    } catch {
      return false;
    }
  }

  /**
   * 从B站页面获取aid和cid
   * @returns {Promise<{aid: number, cid: number}|null>}
   */
  async getAidAndCid() {
    try {
      console.log("YouTubeGist: getAidAndCid - 开始获取", {
        hasInitialState: typeof window.__INITIAL_STATE__ !== 'undefined',
        hasPlayinfo: typeof window.__playinfo__ !== 'undefined',
        location: window.location.href
      });

      // 等待页面数据加载（最多等待3秒）
      let retries = 0;
      const maxRetries = 30; // 30次 * 100ms = 3秒
      
      while (retries < maxRetries) {
        // 方法1: 从window.__INITIAL_STATE__获取（最可靠的方法）
        if (window.__INITIAL_STATE__) {
          const state = window.__INITIAL_STATE__;
          console.log("YouTubeGist: getAidAndCid - __INITIAL_STATE__存在", {
            hasVideoData: !!state.videoData,
            hasAid: !!state.videoData?.aid,
            pagesCount: state.videoData?.pages?.length || 0
          });
          
          if (state.videoData && state.videoData.aid) {
            // 获取当前分P的cid
            const pages = state.videoData.pages || [];
            // 尝试从URL获取当前分P号
            const urlParams = new URLSearchParams(window.location.search);
            const pParam = urlParams.get('p');
            const currentPage = pParam ? parseInt(pParam, 10) : (state.videoData.p || state.videoData.page || 1);
            const pageInfo = pages[currentPage - 1] || pages[0];
            
            console.log("YouTubeGist: getAidAndCid - 分P信息", {
              currentPage: currentPage,
              pagesCount: pages.length,
              hasPageInfo: !!pageInfo,
              hasCid: !!pageInfo?.cid
            });
            
            if (pageInfo && pageInfo.cid) {
              console.log("YouTubeGist: 从__INITIAL_STATE__获取aid和cid", {
                aid: state.videoData.aid,
                cid: pageInfo.cid,
                page: currentPage
              });
              return {
                aid: state.videoData.aid,
                cid: pageInfo.cid
              };
            }
          }
        }

        // 方法2: 从window.__playinfo__获取
        if (window.__playinfo__) {
          const playinfo = window.__playinfo__;
          console.log("YouTubeGist: getAidAndCid - __playinfo__存在", {
            hasData: !!playinfo.data,
            hasAid: !!playinfo.data?.aid,
            hasCid: !!playinfo.data?.cid
          });
          
          if (playinfo.data && playinfo.data.aid && playinfo.data.cid) {
            console.log("YouTubeGist: 从__playinfo__获取aid和cid", {
              aid: playinfo.data.aid,
              cid: playinfo.data.cid
            });
            return {
              aid: playinfo.data.aid,
              cid: playinfo.data.cid
            };
          }
        }

        // 方法3: 从URL参数获取（如果有）
        const urlParams = new URLSearchParams(window.location.search);
        const aid = urlParams.get('aid');
        const cid = urlParams.get('cid');
        if (aid && cid) {
          console.log("YouTubeGist: 从URL参数获取aid和cid", {
            aid: parseInt(aid, 10),
            cid: parseInt(cid, 10)
          });
          return {
            aid: parseInt(aid, 10),
            cid: parseInt(cid, 10)
          };
        }

        // 如果数据还没加载，等待一段时间后重试
        if (retries < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
          continue;
        }
        
        break;
      }

      // 方法4: 从页面脚本标签中提取（备用方案）
      console.log("YouTubeGist: getAidAndCid - 尝试从脚本标签提取");
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        // 尝试匹配 aid 和 cid（更精确的正则）
        const aidMatch = text.match(/["']aid["']\s*:\s*(\d+)/);
        const cidMatch = text.match(/["']cid["']\s*:\s*(\d+)/);
        if (aidMatch && cidMatch) {
          console.log("YouTubeGist: 从脚本标签获取aid和cid", {
            aid: parseInt(aidMatch[1], 10),
            cid: parseInt(cidMatch[1], 10)
          });
          return {
            aid: parseInt(aidMatch[1], 10),
            cid: parseInt(cidMatch[1], 10)
          };
        }
      }

      // 方法5: 尝试从页面中的data属性获取
      console.log("YouTubeGist: getAidAndCid - 尝试从data属性获取");
      const videoElement = document.querySelector('[data-aid], [data-cid]');
      if (videoElement) {
        const aidAttr = videoElement.getAttribute('data-aid');
        const cidAttr = videoElement.getAttribute('data-cid');
        if (aidAttr && cidAttr) {
          console.log("YouTubeGist: 从data属性获取aid和cid", {
            aid: parseInt(aidAttr, 10),
            cid: parseInt(cidAttr, 10)
          });
          return {
            aid: parseInt(aidAttr, 10),
            cid: parseInt(cidAttr, 10)
          };
        }
      }

      // 方法6: 尝试从页面URL中提取BV号，然后通过API获取aid和cid
      console.log("YouTubeGist: getAidAndCid - 尝试从URL提取BV号");
      const bvMatch = window.location.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
      if (bvMatch) {
        const bvid = bvMatch[1];
        console.log("YouTubeGist: getAidAndCid - 找到BV号，尝试通过API获取aid和cid", { bvid });
        
        try {
          // 调用B站API获取视频信息（包含aid和cid）
          const videoInfoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
          console.log("YouTubeGist: getAidAndCid - 调用视频信息API", { videoInfoUrl });
          
          const videoInfoResponse = await fetch(videoInfoUrl, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Referer': window.location.href,
              'User-Agent': navigator.userAgent
            }
          });

          if (videoInfoResponse.ok) {
            const videoInfoData = await videoInfoResponse.json();
            console.log("YouTubeGist: getAidAndCid - 视频信息API响应", {
              code: videoInfoData.code,
              hasData: !!videoInfoData.data,
              hasAid: !!videoInfoData.data?.aid,
              pagesCount: videoInfoData.data?.pages?.length || 0
            });

            if (videoInfoData.code === 0 && videoInfoData.data) {
              const aid = videoInfoData.data.aid;
              const pages = videoInfoData.data.pages || [];
              
              // 获取当前分P的cid
              const urlParams = new URLSearchParams(window.location.search);
              const pParam = urlParams.get('p');
              const currentPage = pParam ? parseInt(pParam, 10) : 1;
              const pageInfo = pages[currentPage - 1] || pages[0];
              
              if (aid && pageInfo && pageInfo.cid) {
                console.log("YouTubeGist: 通过BV号API获取aid和cid", {
                  bvid: bvid,
                  aid: aid,
                  cid: pageInfo.cid,
                  page: currentPage
                });
                return {
                  aid: aid,
                  cid: pageInfo.cid
                };
              }
            }
          } else {
            console.warn("YouTubeGist: getAidAndCid - 视频信息API调用失败", {
              status: videoInfoResponse.status,
              statusText: videoInfoResponse.statusText
            });
          }
        } catch (error) {
          console.error("YouTubeGist: getAidAndCid - 通过BV号获取aid和cid失败", error);
        }
      }

      console.warn("YouTubeGist: 无法从B站页面获取aid和cid", {
        retries: retries,
        hasInitialState: typeof window.__INITIAL_STATE__ !== 'undefined',
        hasPlayinfo: typeof window.__playinfo__ !== 'undefined'
      });
      return null;
    } catch (error) {
      console.error("YouTubeGist: 获取aid和cid失败", error);
      return null;
    }
  }
}
