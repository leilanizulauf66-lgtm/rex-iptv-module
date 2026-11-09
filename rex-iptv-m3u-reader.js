
var WidgetMetadata = {
  id: "custom.iptv.m3u",
  title: "电视直播",
  description: "多 M3U 源合并解析，自动去重，单源失败自动跳过。",
  author: "Custom",
  site: "https://github.com/leilanizulauf66-lgtm/rex-iptv-module",
  version: "1.2.0",
  requiredVersion: "0.0.1",
  modules: [{
    title: "电视直播",
    description: "多个 M3U 地址合并为一个频道列表，支持分组筛选和图标缩放设置。",
    functionName: "loadM3UChannels",
    requiresWebView: false,
    cacheDuration: 300,
    params: [
      {
        name: "playlistUrls",
        title: "M3U 地址（每行一个）",
        type: "input",
        value: "https://iptv.yang-1989.xyz/playlist.m3u"
      },
      {
        name: "groupFilter",
        title: "分组筛选（可留空）",
        type: "input",
        value: ""
      },
      {
        name: "iconScale",
        title: "频道图标缩放比例（30-200）",
        type: "input",
        value: "100"
      }
    ]
  }]
};

function m3uAttr(line, name) {
  var match = line.match(
    new RegExp("(?:^|\\s)" + name + '="([^"]*)"', "i")
  );
  return match ? match[1].trim() : "";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（()）【】\[\]·_\-]/g, "");
}

function parseM3U(text, groupFilter, iconScale) {
  var lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  var list = [];
  var current = null;
  var filter = String(groupFilter || "").trim().toLowerCase();

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    if (line.indexOf("#EXTINF:") === 0) {
      var comma = line.indexOf(",");
      var displayName = comma >= 0 ? line.slice(comma + 1).trim() : "";
      current = {
        title: m3uAttr(line, "tvg-name") || displayName || "未命名频道",
        logo: m3uAttr(line, "tvg-logo"),
        tvgId: m3uAttr(line, "tvg-id"),
        group: m3uAttr(line, "group-title")
      };
      continue;
    }

    if (line.indexOf("#EXTGRP:") === 0 && current) {
      current.group = line.slice(8).trim() || current.group;
      continue;
    }

    if (line.charAt(0) === "#") continue;

    if (/^https?:\/\//i.test(line) && current) {
      var group = current.group || "";
      if (!filter || group.toLowerCase().indexOf(filter) !== -1) {
        list.push({
          id: line,
          type: "url",
          title: current.title,
          coverUrl: current.logo,
          posterPath: current.logo,
          backdropPath: current.logo,
          videoUrl: line,
          playerType: "app",
          description: group,
          iconScale: iconScale,
          coverScale: iconScale,
          _tvgId: current.tvgId
        });
      }
      current = null;
    }
  }
  return list;
}

function getDedupeKey(channel) {
  var tvgId = normalizeText(channel._tvgId);
  if (tvgId) return "id:" + tvgId;

  var title = normalizeText(channel.title);
  if (title) return "name:" + title;

  return "url:" + String(channel.videoUrl || "");
}

async function fetchPlaylist(url) {
  var response = await Widget.http.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  if (response && (response.statusCode >= 400 || response.status >= 400)) {
    throw new Error("HTTP 请求失败");
  }

  var body = response && response.data !== undefined ? response.data : response;
  if (typeof body !== "string") throw new Error("返回内容不是文本");
  return body;
}

async function loadM3UChannels(params) {
  params = params || {};

  var rawUrls = String(
    params.playlistUrls ||
    params.playlistUrl ||
    "https://iptv.yang-1989.xyz/playlist.m3u"
  );

  var urls = rawUrls
    .split(/[\r\n,;]+/)
    .map(function (item) { return item.trim(); })
    .filter(function (item, index, all) {
      return item && all.indexOf(item) === index;
    });

  urls = urls.filter(function (url) {
    return /^https?:\/\//i.test(url);
  });

  if (!urls.length) {
    throw new Error("请至少填写一个有效的 M3U 地址（http:// 或 https://）");
  }

  var rawScale = Number(params.iconScale || 100);
  if (!isFinite(rawScale)) rawScale = 100;
  var iconScale = Math.max(30, Math.min(200, Math.round(rawScale)));

  if (
    typeof Widget === "undefined" ||
    !Widget.http ||
    typeof Widget.http.get !== "function"
  ) {
    throw new Error("当前 Rex 环境未提供 Widget.http.get 网络接口");
  }

  var merged = [];

  // 逐个读取，某个源失败不会影响其他源
  for (var i = 0; i < urls.length; i++) {
    try {
      var text = await fetchPlaylist(urls[i]);
      var parsed = parseM3U(text, params.groupFilter, iconScale);

      for (var j = 0; j < parsed.length; j++) {
        merged.push(parsed[j]);
      }
    } catch (error) {
      // 跳过无法访问或格式错误的源
    }
  }

  if (!merged.length) {
    throw new Error(
      "所有 M3U 地址均未解析到频道，请检查地址、网络或播放列表格式"
    );
  }

  var seen = {};
  var result = [];

  for (var k = 0; k < merged.length; k++) {
    var channel = merged[k];
    var key = getDedupeKey(channel);

    if (seen[key]) continue;

    seen[key] = true;
    delete channel._tvgId;
    result.push(channel);
  }

  return result;
}
