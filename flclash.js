function main(config) {
  var MOBILE_LOW_POWER = true;

  // 低功耗：尽量减少周期测速/探测
  var PROBE_INTERVAL = MOBILE_LOW_POWER ? 86400 : 1800;           // url-test/fallback interval：24h
  var REGION_URLTEST_INTERVAL = MOBILE_LOW_POWER ? 86400 : 3600;  // 地区组测速：24h
  var PROVIDER_INTERVAL = MOBILE_LOW_POWER ? 7200 : 900;          // provider 拉取：2h
  var PROVIDER_HC_INTERVAL = MOBILE_LOW_POWER ? 7200 : 600;       // provider 健康检查：2h

  function accel(url) {
    if (!url || typeof url !== "string") return url;
    return url.replace(
      /https?:\/\/(testingcf\.jsdelivr\.net|cdn\.jsdelivr\.net)/g,
      "https://fastly.jsdelivr.net"
    );
  }

  var exitNodeUrl =
    "";//这里填入出口订阅

  // 强制直连/自定义
  var customRules = [
    "DOMAIN-SUFFIX,linux.do,节点选择",
    "DOMAIN-SUFFIX,cloud.189.cn,DIRECT",
    "DOMAIN-SUFFIX,cloudcube.telecomjs.com,DIRECT",
    "DOMAIN-SUFFIX,qh6oss.ctyunxs.cn,DIRECT",
    "DOMAIN-SUFFIX,wuxi.cn,DIRECT",
    "DOMAIN-SUFFIX,entertang.work,DIRECT",
    "DOMAIN,embyty.entertang.work,DIRECT"
  ];

  // IP 检测/泄露
  var ipBlockRules = [
    "DOMAIN-KEYWORD,ip,节点选择",
    "DOMAIN-KEYWORD,check,节点选择",
    "DOMAIN-KEYWORD,query,节点选择",
    "DOMAIN-KEYWORD,detect,节点选择",
    "DOMAIN-KEYWORD,leak,节点选择"
  ];

  // WebRTC 防泄露
  var webrtcRules = [
    "DOMAIN-KEYWORD,stun,节点选择",
    "DOMAIN-KEYWORD,turn,节点选择",
    "DOMAIN-KEYWORD,webrtc,节点选择",
    "DOMAIN,stun.l.google.com,节点选择",
    "DOMAIN,stun1.l.google.com,节点选择",
    "DOMAIN,stun2.l.google.com,节点选择",
    "DOMAIN,stun3.l.google.com,节点选择",
    "DOMAIN,stun4.l.google.com,节点选择",
    "DOMAIN,stun.services.mozilla.com,节点选择",
    "DOMAIN,stun.stunprotocol.org,节点选择"
  ];

  // 应用净化增强（少量补丁，无 provider）
  var appCleanRules = [
    "DOMAIN-SUFFIX,umeng.com,应用净化",
    "DOMAIN-SUFFIX,umengcloud.com,应用净化",
    "DOMAIN-SUFFIX,cnzz.com,应用净化",
    "DOMAIN-SUFFIX,flurry.com,应用净化",
    "DOMAIN-SUFFIX,adjust.com,应用净化",
    "DOMAIN-SUFFIX,appsflyer.com,应用净化",
    "DOMAIN-SUFFIX,mmstat.com,应用净化",
    "DOMAIN-SUFFIX,doubleclick.net,应用净化"
  ];

  // ==================== 非节点过滤（去重后的关键词）====================
  // 需要排除“非节点信息”的组：
  // - 自动选择（exclude-filter）
  // - 手动切换（exclude-filter）
  // - 前置节点（本地节点列表收集时过滤）
  //
  // 注意：这里仅“去重 + 统一格式”，不做复杂正则容错，以减少误杀。
  // t.me 需要写成 t\\.me
  var NON_NODE_KEYWORDS_DEDUP =
    "官网|公告|通知|维护|订阅|防失联|最新网址|备用|客服|工单|联系|反馈|教程|使用说明|购买|续费|充值|返利|推荐|优惠|福利|活动|推广|代理商|机场|节点池|测速|解锁|说明|规则|TG群|电报|telegram|频道|群组|讨论组|t\\.me|流量|剩余|用量|到期|过期|续期|重置|重设|下次|距离|套餐|账单|有效期|时间|日期|定期|下方|地址|更新|官方|网站|VPN|GB|TB";

  // Clash 用：exclude-filter
  var NON_NODE_EXCLUDE_FILTER = "(?i)(?:" + NON_NODE_KEYWORDS_DEDUP + ")";

  // JS 用：过滤本地节点名（与上面保持一致）
  // 说明：这里用同一套关键词，大小写不敏感匹配
  var NON_NODE_EXCLUDE_RE = new RegExp("(?:"
    + NON_NODE_KEYWORDS_DEDUP.replace(/\\\./g, "\\.")
    + ")", "i");

  function createUrlTestGroup(name, icon, filter, interval, excludeFilter) {
    interval = interval || REGION_URLTEST_INTERVAL;
    excludeFilter = excludeFilter || "";
    var base = {
      name: name,
      icon: accel(icon),
      type: "url-test",
      "include-all": true,
      interval: interval,
      tolerance: 120,
      lazy: true, // ✅ 低功耗：按需才测
      "disable-udp": true
    };
    if (filter) base.filter = filter;
    if (excludeFilter) base["exclude-filter"] = excludeFilter;
    return base;
  }

  function createSelectGroup(name, icon, proxies) {
    return { name: name, icon: accel(icon), type: "select", proxies: proxies };
  }

  // ==================== provider（唯一）====================
  config["proxy-providers"] = {
    "exit-nodes": {
      type: "http",
      url: exitNodeUrl,
      path: "./providers/exit-nodes.yaml",
      interval: PROVIDER_INTERVAL,
      "health-check": {
        enable: true,
        url: "https://www.gstatic.com/generate_204",
        interval: PROVIDER_HC_INTERVAL
      }
    }
  };

  // ==================== 前置节点（第一跳，本地节点）====================
  var localProxies = [];
  if (config.proxies && config.proxies.length > 0) {
    for (var i = 0; i < config.proxies.length; i++) {
      var n = config.proxies[i].name;
      // ✅ 排除“非节点信息”
      if (n && !NON_NODE_EXCLUDE_RE.test(n)) {
        localProxies.push(n);
      }
    }
  }

  var preNodeSelect = {
    name: "前置节点",
    icon: accel(
      "https://fastly.jsdelivr.net/gh/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/link.svg"
    ),
    type: "select",
    proxies: localProxies
  };

  // 链式出口（第二跳来自订阅，第一跳由前置节点决定）
  var chainedExit = {
    name: "链式出口",
    icon: accel(
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/World_Map.png"
    ),
    type: "select",
    use: ["exit-nodes"],
    "dialer-proxy": "前置节点"
  };

  // 链式代理（隐藏，仅内部引用）
  var chainProxy = {
    name: "链式代理",
    icon: accel(
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Link.png"
    ),
    type: "select",
    hidden: true,
    proxies: ["链式出口"]
  };

  // ==================== 地区组（保留，低功耗）====================
  var hkGroup = createUrlTestGroup(
    "香港节点",
    "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Hong_Kong.png",
    "(?i)🇭🇰|香港|HK|hk|Hong Kong|HongKong|hongkong",
    REGION_URLTEST_INTERVAL,
    ""
  );

  var twGroup = createUrlTestGroup(
    "台湾节点",
    "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Taiwan.png",
    "(?i)🇹🇼|台湾|新北|彰化|TW|Taiwan",
    REGION_URLTEST_INTERVAL,
    ""
  );

  var sgGroup = createUrlTestGroup(
    "狮城节点",
    "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Singapore.png",
    "(?i)🇸🇬|新加坡|坡|狮城|SG|Singapore",
    REGION_URLTEST_INTERVAL,
    ""
  );

  var usGroup = createUrlTestGroup(
    "美国节点",
    "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/United_States.png",
    "(?i)🇺🇸|美国|US|United States|洛杉矶|西雅图|芝加哥|达拉斯|凤凰城|硅谷|圣何塞",
    REGION_URLTEST_INTERVAL,
    ""
  );

  var jpGroup = createUrlTestGroup(
    "日本节点",
    "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Japan.png",
    "(?i)🇯🇵|日本|东京|大阪|JP|Japan",
    REGION_URLTEST_INTERVAL,
    ""
  );

  var krGroup = createUrlTestGroup(
    "韩国节点",
    "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Korea.png",
    "(?i)🇰🇷|KR|Korea|KOR|首尔|韩|韓",
    REGION_URLTEST_INTERVAL,
    ""
  );

  var otherGroup = {
    name: "其他节点",
    icon: accel(
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Global.png"
    ),
    type: "url-test",
    "include-all": true,
    interval: REGION_URLTEST_INTERVAL,
    tolerance: 100,
    lazy: true,
    "disable-udp": true,
    "exclude-filter":
      "(?i)🇭🇰|港|HK|hk|Hong Kong|HongKong|hongkong|🇹🇼|台|TW|Taiwan|🇸🇬|新加坡|SG|Singapore|🇺🇸|美|US|United States|🇯🇵|日本|JP|Japan|🇰🇷|KR|Korea|KOR"
  };

  // 自动/手动（低功耗）
  var autoSelect = {
    name: "自动选择",
    icon: accel(
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Auto.png"
    ),
    type: "url-test",
    "include-all": true,
    interval: PROBE_INTERVAL,
    tolerance: 120,
    lazy: true,
    "disable-udp": true,
    // ✅ 排除“非节点信息”（替换掉你原本的香港排除）
    "exclude-filter": NON_NODE_EXCLUDE_FILTER
  };

  var manualSelect = {
    name: "手动切换",
    icon: accel(
      "https://fastly.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/select.png"
    ),
    "include-all": true,
    type: "select",
    // ✅ 排除“非节点信息”
    "exclude-filter": NON_NODE_EXCLUDE_FILTER
  };

  // ==================== 核心：节点选择 = 默认降级 fallback（含地区组）====================
  var nodeSelectDefaultFallback = {
    name: "节点选择",
    icon: accel(
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Rocket.png"
    ),
    type: "fallback",
    proxies: [
      "链式代理",
      "前置节点",
      "香港节点",
      "手动切换",
      "自动选择",
      "台湾节点",
      "狮城节点",
      "美国节点",
      "日本节点",
      "韩国节点",
      "其他节点",
      "DIRECT"
    ],
    url: "https://www.gstatic.com/generate_204",
    interval: PROBE_INTERVAL,
    lazy: true,
    tolerance: 250,
    "disable-udp": true
  };

  // ==================== proxy-groups：节点选择首位 + 链式代理隐藏 =====================
  config["proxy-groups"] = [
    nodeSelectDefaultFallback,

    chainProxy,
    preNodeSelect,
    chainedExit,

    autoSelect,
    manualSelect,

    // 业务组（不做真实URL探测，保持省电简洁）
    createSelectGroup(
      "AI节点",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Bot.png",
      ["美国节点", "节点选择", "香港节点", "狮城节点", "台湾节点", "日本节点", "韩国节点", "其他节点", "手动切换", "DIRECT"]
    ),
    createSelectGroup(
      "电报消息",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Telegram.png",
      ["香港节点", "节点选择", "狮城节点", "台湾节点", "日本节点", "美国节点", "韩国节点", "其他节点", "手动切换", "DIRECT"]
    ),
    createSelectGroup(
      "油管视频",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/YouTube.png",
      ["节点选择", "日本节点", "韩国节点", "香港节点", "台湾节点", "美国节点", "狮城节点", "其他节点", "手动切换", "DIRECT"]
    ),
    createSelectGroup(
      "奈飞视频",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Netflix.png",
      ["节点选择", "日本节点", "狮城节点", "美国节点", "香港节点", "台湾节点", "韩国节点", "其他节点", "手动切换", "DIRECT"]
    ),
    createSelectGroup(
      "GitHub",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/GitHub.png",
      ["节点选择", "美国节点", "日本节点", "香港节点", "狮城节点", "台湾节点", "韩国节点", "其他节点", "DIRECT", "手动切换"]
    ),
    createSelectGroup(
      "谷歌FCM",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Google_Search.png",
      ["美国节点", "节点选择", "DIRECT", "自动选择", "手动切换"]
    ),
    createSelectGroup(
      "微软Bing",
      "https://fastly.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/bing.png",
      ["DIRECT", "节点选择", "自动选择", "手动切换"]
    ),
    createSelectGroup(
      "微软云盘",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/OneDrive.png",
      ["DIRECT", "节点选择", "自动选择", "手动切换"]
    ),
    createSelectGroup(
      "微软服务",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Microsoft.png",
      ["节点选择", "DIRECT", "美国节点", "香港节点", "狮城节点", "台湾节点", "日本节点", "韩国节点", "其他节点", "手动切换"]
    ),
    createSelectGroup(
      "苹果服务",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Apple.png",
      ["DIRECT", "节点选择", "香港节点", "台湾节点", "日本节点", "美国节点", "狮城节点", "韩国节点", "其他节点", "手动切换"]
    ),
    createSelectGroup(
      "游戏平台",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Game.png",
      ["DIRECT", "节点选择", "美国节点", "香港节点", "台湾节点", "狮城节点", "日本节点", "韩国节点", "其他节点", "手动切换"]
    ),

    createSelectGroup(
      "全球直连",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Direct.png",
      ["DIRECT", "节点选择", "自动选择"]
    ),
    createSelectGroup(
      "广告拦截",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AdBlack.png",
      ["REJECT", "DIRECT"]
    ),
    createSelectGroup(
      "应用净化",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Hijacking.png",
      ["REJECT", "DIRECT"]
    ),
    createSelectGroup(
      "跟踪分析",
      "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Reject.png",
      ["REJECT", "DIRECT"]
    ),
    createSelectGroup(
      "漏网之鱼",
      "https://fastly.jsdelivr.net/gh/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/fish.svg",
      ["节点选择", "DIRECT", "自动选择", "手动切换"]
    ),

    hkGroup, twGroup, sgGroup, usGroup, jpGroup, krGroup, otherGroup
  ];

  // ==================== rules：GEOSITE 精确分流；GEOIP 只用 CN/private =====================
  var rules = [];
  rules = rules.concat(ipBlockRules, customRules, webrtcRules);

  rules.push("GEOSITE,category-ads-all,广告拦截");
  rules.push("GEOSITE,tracker,跟踪分析");
  rules = rules.concat(appCleanRules);

  rules.push("GEOSITE,private,全球直连");
  rules.push("GEOIP,private,全球直连,no-resolve");
  rules.push("IP-CIDR,10.0.0.0/8,全球直连,no-resolve");
  rules.push("IP-CIDR,172.16.0.0/12,全球直连,no-resolve");
  rules.push("IP-CIDR,192.168.0.0/16,全球直连,no-resolve");
  rules.push("IP-CIDR,127.0.0.0/8,全球直连,no-resolve");
  rules.push("IP-CIDR,169.254.0.0/16,全球直连,no-resolve");

  // 业务分流
  rules.push("GEOSITE,telegram,电报消息");
  rules.push("GEOSITE,youtube,油管视频");
  rules.push("GEOSITE,netflix,奈飞视频");
  rules.push("GEOSITE,openai,AI节点");

  rules.push("GEOSITE,github,GitHub");
  rules.push("GEOSITE,onedrive,微软云盘");
  rules.push("GEOSITE,microsoft,微软服务");
  rules.push("GEOSITE,apple,苹果服务");

  // CN 友好直连
  rules.push("GEOSITE,microsoft@cn,全球直连");
  rules.push("GEOSITE,apple-cn,全球直连");
  rules.push("GEOSITE,steam@cn,全球直连");
  rules.push("GEOSITE,category-games@cn,全球直连");

  // 大分流（CN / !CN）
  rules.push("GEOSITE,geolocation-!cn@cn,全球直连");
  rules.push("GEOSITE,geolocation-cn@!cn,节点选择");
  rules.push("GEOSITE,cn,全球直连");
  rules.push("GEOSITE,geolocation-!cn,节点选择");

  // GEOIP 仅 CN 兜底
  rules.push("GEOIP,CN,全球直连");

  // 最终兜底
  rules.push("MATCH,漏网之鱼");

  config["rules"] = rules;

  // ==================== 基本配置 ====================
  config["mode"] = "rule";
  config["log-level"] = MOBILE_LOW_POWER ? "error" : "warning";
  config["mixed-port"] = 7890;
  config["allow-lan"] = true;
  config["ipv6"] = false;
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["keep-alive-interval"] = 1800;
  config["find-process-mode"] = "strict";
  config["global-client-fingerprint"] = "chrome";

  // ==================== DNS（不改 1053）====================
  config["dns"] = {
    enable: true,
    ipv6: false,
    "prefer-h3": MOBILE_LOW_POWER ? false : true,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter": [
      "*.lan",
      "*.local",
      "time.*.com",
      "ntp.*.com",
      "+.pool.ntp.org",
      "stun.*",
      "turn.*",
      "localhost.ptlogin2.qq.com",
      "+.msftconnecttest.com",
      "+.qq.com",
      "+.wechat.com",
      "+.weixin.qq.com"
    ],
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    "proxy-server-nameserver": ["https://223.5.5.5/dns-query"],
    nameserver: ["https://1.1.1.1/dns-query", "https://8.8.8.8/dns-query"],
    "nameserver-policy": {
      "geosite:cn": ["https://223.5.5.5/dns-query", "https://1.12.12.12/dns-query"],
      "geosite:category-ads-all": "rcode://success"
    }
  };

  config["profile"] = { "store-selected": true, "store-fake-ip": true };

  // Android 省电：默认关 sniffer
  config["sniffer"] = {
    enable: MOBILE_LOW_POWER ? false : true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    "override-destination": true,
    sniff: {
      TLS: { ports: [443, 8443] },
      HTTP: { ports: [80, "8080-8880"], "override-destination": true },
      QUIC: { ports: [443] }
    },
    "skip-domain": ["Mijia Cloud", "+.oray.com"]
  };

  config["geodata-mode"] = true;
  config["geo-auto-update"] = true;
  config["geo-update-interval"] = 72;
  config["geox-url"] = {
    geoip:
      "https://fastgh.lainbo.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip-lite.dat",
    geosite:
      "https://fastgh.lainbo.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
    mmdb:
      "https://fastgh.lainbo.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country-lite.mmdb"
  };

  config["tun"] = {
    enable: true,
    stack: "mixed",
    "dns-hijack": ["any:53"],
    "auto-route": true,
    "auto-detect-interface": true,
    "strict-route": true
  };

  config["external-controller"] = "127.0.0.1:9090";
  config["secret"] = "123456";

  return config;
}

globalThis.main = main;
globalThis.transform = main;
globalThis.parse = main;