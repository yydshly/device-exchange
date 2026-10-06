# iPad ↔ 电脑免安装互传：架构比较

核查日期：2026-10-06。以下是依据一手文档的设计判断，未做实机传输测试；速度、大小上限、成功率均不能当作已验证承诺。

## 对当前验证切片的结论

**“私有 HTTPS 网页、双方同时在线并保持前台、文件上限 25 MiB、WebRTC 直传、无 TURN、文件不上传服务器”的受限切片合理。** 它验证的是配对、双向传输、浏览器保存和直连可行性，不代表最终选定 WebRTC，也不代表已经解决跨网可达、后台继续、大文件或断点续传。

- 私有站点必须先确认两端均有访问权限；配对二维码不应绕过站点访问控制。
- 无 TURN 时直连失败是预期边界，应提示“当前网络无法建立直连”，不能假成功或静默上传。
- 可以使用服务器处理页面和信令；应准确表述“文件不上传服务器”，不要说“完全无服务器”。若用了 STUN，仍有外部网络服务与连接元数据。
- 25 MiB 是原型限制，不是浏览器技术上限；本次不能宣称 iPad 实机、跨网、后台或低内存已测。

## 交付方式和网络通路应分开选择

| 交付方式 | 收益 | 代价和边界 | 判断 |
|---|---|---|---|
| Web / 可选 PWA | 两端打开网址即可；同一界面覆盖 iPad、Windows、macOS | 文件访问受浏览器控制；页面可被暂停；添加到主屏幕不提供通用后台守护进程 | 免安装首选；首版应明确前台使用 |
| 两端原生 | 系统文件、分享扩展、发现与持久任务能力更完整 | 双端安装和维护；原生也不保证任意 TCP/WebRTC 会话长时间后台运行 | 高频大文件、深度文件管理或后台需求确定后考虑 |
| 混合 | Web UI + 原生传输/文件引擎可复用界面；电脑助手 + iPad Safari 保留 iPad 免安装 | 纯 WKWebView 套壳不自动解决后台；桌面助手仍要安装/启动；桥接有额外安全面 | 作为“可选增强模式”，不再称两端免安装 |

WebKit 明确后台 iOS 页面可能被挂起；原生 URLSession 后台任务支持 HTTP/HTTPS，后台上传必须来自文件，不能把这种能力套到任意 WebRTC/原生 TCP 会话。[页面后台](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/)、[原生后台传输](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background)

## 数据通路比较

| 通路 | 成立条件与优势 | 限制和成本 | 合适定位 |
|---|---|---|---|
| WebRTC 直传 + TURN | 标准浏览器可双向传二进制；直连成功时不需文件存储服务；同 LAN 可能充分利用本地链路 | 另建信令、ICE/NAT、防火墙诊断与 TURN；两端同时可执行；TURN 消耗转发流量；续传仍需应用协议 | 双方现场同步互传；当前无 TURN 切片只验证其中的直连路径 |
| HTTPS 端到端加密中转 | 客户端加密后上传；可设计分片、重试、到期删除；暂存支持非同时在线 | 带宽、存储、防滥用成本；iPad 页面解密/保存仍受限制；TLS 本身不是端到端加密 | 跨网络、可恢复、延后领取优先时，通常更易完成可靠产品 |
| LAN HTTP / WebSocket | 有本地服务器时路径直观；HTTP 标准下载、WebSocket 双向控制/数据 | 通常需要电脑助手；普通网页不能监听任意 TCP；跨源、混合内容、本地网络权限、证书均需处理；同 Wi-Fi 不保证设备互通 | 可选桌面助手模式；不是两台裸浏览器的通用直传替代 |
| 原生 TCP / TLS | 可控流控、文件流式写入与 LAN 发现；有更多性能调优空间 | 原生安装、平台维护、认证、权限；iPad 后台任意长连接仍受限制 | 高频大文件增强版，不是免安装首版的隐含依赖 |
| Bluetooth | 原生 BLE 可实现近距离发现与数据交换，无需同一 Wi-Fi | Safari/WebKit 未提供 Web Bluetooth；Web Bluetooth 主要面向 BLE 外设 GATT；原生跨平台协议和吞吐需实测 | 不作为主通路；原生版可探索发现/配对或少量数据 |

依据：

- WebRTC 不包含信令服务；ICE 使用 STUN/TURN。DataChannel 使用 SCTP over DTLS，规范明确消息大小与缓冲限制，需分片和背压。[WebRTC 官方入门](https://webrtc.org/getting-started/peer-connections)、[W3C WebRTC](https://www.w3.org/TR/webrtc/)、[RFC 8831](https://www.rfc-editor.org/rfc/rfc8831.html)
- HTTP Range 是可选下载能力，不自动提供断点上传；分片上传、幂等、清单和校验仍需设计。Web Crypto 提供客户端认证加密基础，不代替完整安全协议。[RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests)、[WebKit Web Crypto](https://webkit.org/blog/7790/update-on-web-cryptography/)
- 常规网页没有任意 TCP/UDP；Chrome Direct Sockets 是 Isolated Web Apps 能力，不是 Safari/PWA 的通用替代。[Chrome Direct Sockets](https://developer.chrome.com/docs/iwa/direct-sockets)
- **2026 年浏览器变化**：Chrome 147 已把本地 WebSocket 纳入 Local Network Access 权限；Chrome 154 新增 WebSocket targetAddressSpace。不能把 2025 年“WebSocket 尚未纳入”旧说明当作现状，或把 Chrome 的 HTTP 例外当作所有浏览器行为。[Chrome 147](https://developer.chrome.com/release-notes/147)、[Chrome 154](https://developer.chrome.com/release-notes/154)
- 原生 LAN/Bonjour 有隐私声明和权限要求；Apple Multipeer Connectivity 切后台会断开会话，且不是 Windows/Linux 通用协议。[Apple 本地网络隐私](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)、[Multipeer Connectivity](https://developer.apple.com/documentation/multipeerconnectivity)
- WebKit 仍列 Web Bluetooth 为未实现能力；Apple 有原生 BLE central/peripheral 数据交换示例，并要求应用处理流控。[WebKit 隐私策略](https://webkit.org/tracking-prevention/)、[Web Bluetooth 规范](https://bluetooth.spec.whatwg.org/)、[Apple BLE 示例](https://developer.apple.com/documentation/corebluetooth/transferring-data-between-bluetooth-low-energy-devices)

## 真正需要先验证的门槛

1. **iPad 真正保存文件**：OPFS 是站点私有存储，不是用户“文件”App 的目录；写完 OPFS 不能标记“已保存”。Safari 不应依赖 Chromium 的 showSaveFilePicker。完整验证“接收 → 校验/解密 → 导出 → 文件 App 打开”；注意配额、低空间和站点数据回收。[OPFS](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/)、[WebKit 本地文件系统立场](https://github.com/WebKit/standards-positions/issues/28)、[存储策略](https://webkit.org/blog/14403/updates-to-storage-policy/)
2. **生命周期**：浏览器普通 HTTP 下载、页面 JS 加解密、WebRTC、原生 URLSession 是不同执行路径，不能互相推导锁屏能力。原型明示前台，生产版再测试网络切换、页面恢复、源文件重选和持久续传。[页面后台](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/)、[URLSession 后台](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background)
3. **路线可观测性**：记录选中的 ICE candidate pair、直连/中转状态、传输失败阶段；不要根据“同 Wi-Fi”猜测数据路径。当前没有 TURN，只能得到直连样本，不能推导完整产品覆盖率。

## 最小测试矩阵

以下全部是待测项目。主路径用相同文件与网络条件比较；没有设备或授权的测试保持“未测”。

| 维度 | 场景 | 验收/记录 |
|---|---|---|
| 双端权限 | 私有站点分别在电脑与 iPad 登录；二维码/手输码 | 两端可访问；配对不越权；站点权限错误与配对错误区分 |
| 浏览器 | 目标最低 iPadOS 与当前稳定版；较低内存 iPad；Safari 标签/PWA；Windows Chrome/Edge；macOS Safari/Chrome | 双向实机；准确版本；页面终止/内存峰值；最终文件可打开 |
| 网络 | 同路由器；访客网络/客户端隔离；电脑有线+iPad Wi-Fi；跨网；热点；UDP 阻断；VPN；IPv4/IPv6 | 配对与首字节耗时、完成率、吞吐、实际路径；无 TURN 时失败提示准确 |
| 原型文件 | 0 字节；中文/emoji/同名；照片/PDF；1 MiB、25 MiB；25 MiB+1 字节；多文件 | 上限两端一致；字节数/完整性相符；发送完成不能冒充对方已保存 |
| 后续大文件 | 100 MB、1 GB及拟承诺上限；100 个小文件；低空间 | 明确不属于当前切片已验证范围；内存不能随总文件大小无界增长 |
| iPad 文件来源 | 本机文件、未下载 iCloud 文件、照片选择；本机/iCloud 保存；取消选择/保存 | 区分云端取文件准备时间和网络传输；取消可安全重试 |
| 生命周期 | 切标签/切 App/锁屏；低电量；断网、换网、刷新、进程终止 | 不假成功；可恢复则说明操作，不可恢复则明确失败；不得产生静默损坏 |
| 配对与错误 | 错码、过期码、重复加入、抢码、链接转发、取消接收；发送中断 | 短时一次性会话、尝试限制、对方确认、明确错误；不能串房间 |
| 若未来启用中转 | 强制 TURN UDP/TCP/TLS；HTTPS 暂存；过期删除、取消清理、越权对象访问 | 中转类型和成本可观测；密文/密钥分离；保留时间可验证 |

Safari 27 发布说明含 RTCDataChannel SCTP 缓冲检查修复，因此必须记录真实设备版本，不能以一次桌面测试替代 iPad 验证。[Safari 27](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)

## 后续技术决策

- 若目标是即开即用、跨网、允许密文暂存：优先比较 HTTPS E2EE 中转，WebRTC 作为降低时延和流量成本的优化。
- 若目标是双方同时在线、优先本地直传：WebRTC + TURN 是候选；TURN 仍是服务器转发，须准确披露。严格“仅直传”模式应禁止兜底并诚实失败。
- 若目标是无互联网首次使用、自动发现、可靠后台大文件：讨论原生/电脑助手，不能靠 PWA 名称许诺。
- 双路径应共享文件清单、分片、校验与任务状态；不要在首版同时堆叠多条未验证通路。先以连接完成率、保存成功率、恢复行为与带宽成本选路线，不能只按峰值速度决策。

安全底线：短码不能直接充当弱加密密码；二维码可携带高熵一次性秘密；手输码需要限流、过期及双方确认，敏感场景用成熟认证密钥交换。DTLS 或 TLS 不自动验证“对方就是我的另一台设备”。端到端加密也不防被篡改网页或恶意终端，不等于没有元数据。避免“无限大小、后台永不中断、同 Wi-Fi 必直连、完全无服务器、绝对安全”等未证实口径。[WebRTC 安全架构](https://www.rfc-editor.org/rfc/rfc8827.html)
