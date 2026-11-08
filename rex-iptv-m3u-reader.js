
var WidgetMetadata = {
  id: "custom.iptv.m3u",
  title: "自定义 IPTV · M3U",
  description: "读取远程 M3U 播放列表，提取频道名称、台标和播放地址。",
  author: "Custom",
  site: "https://github.com/leilanizulauf66-lgtm/rex-iptv-module",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  modules: [{
    title: "电视台列表",
    description: "读取 M3U 文件并按分组筛选频道。",
    functionName: "loadM3UChannels",
    requiresWebView: false,
    cacheDuration: 300,
    params: [
      {
        name: "playlistUrl",
        title: "M3U 播放列表地址",
        type: "input",
        value: "https://iptv.yang-1989.xyz/playlist.m3u"
      },
      {
        name: "groupFilter",
        title: "分组筛选（可留空）",
        type: "input",
        value: ""
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

function m3uParse(text, groupFilter) {
  var lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);

  var list = [];
  var current = null;
  var filter = String(groupFilter || "").trim().toLowerCase();

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    if (line.indexOf("#EXTINF:") === 0) {
      var comma = line.indexOf(",");
      var name = comma >= 0 ? line.slice(comma + 1).trim() : "";

      current = {
        title: m3uAttr(line, "tvg-name") || name || "未命名频道",
        logo: m3uAttr(line, "tvg-logo"),
        id: m3uAttr(line, "tvg-id"),
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
      if (
        !filter ||
        String(current.group || "").toLowerCase().indexOf(filter) !== -1
      ) {
        list.push({
          id: line,
          type: "url",
          title: current.title,
          coverUrl: current.logo,
          posterPath: current.logo,
          backdropPath: current.logo,
          videoUrl: line,
          playerType: "app",
          description: current.group || ""
        });
      }
      current = null;
    }
  }

  return list;
}

async function loadM3UChannels(params) {
  params = params || {};

  var url = String(
    params.playlistUrl ||
    "https://iptv.yang-1989.xyz/playlist.m3u"
  ).trim();

  if (!/^https?:\/\//i.test(url)) {
    throw new Error("请输入有效的 M3U 地址");
  }

  if (
    typeof Widget === "undefined" ||
    !Widget.http ||
    typeof Widget.http.get !== "function"
  ) {
    throw new Error("当前 Rex 环境未提供 Widget.http.get 网络接口");
  }

  var response = await Widget.http.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (
    response &&
    (response.statusCode >= 400 || response.status >= 400)
  ) {
    throw new Error("M3U 请求失败");
  }

  var body = response && response.data !== undefined
    ? response.data
    : response;

  if (typeof body !== "string") {
    throw new Error("服务器返回内容不是 M3U 文本");
  }

  var channels = m3uParse(body, params.groupFilter);

  if (!channels.length) {
    throw new Error("没有解析到频道，请检查 M3U 地址或分组");
  }

  return channels;
}
