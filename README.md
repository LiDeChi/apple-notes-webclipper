# Apple Notes Web Clipper (Markdown-first)

把网页 / X(Twitter) 保存到 Apple Notes：**正文尽量保留 Markdown 源文本**，图片尽量按原位置插入（作为 `<img src="file://...">`，由 Native Host 下载并缓存为本地文件，再让 Notes 嵌入）。

> 说明：Chrome 插件不能直接写入 Notes，需要本机 `Native Messaging Host`（macOS 上用 AppleScript 调用 Notes.app）。

## 功能（当前版本）

- 普通网页：
  - **阅读模式**（Reader / 正文提取）保存到 Notes
  - **仅保存选中内容** 保存到 Notes
- X(Twitter)：
  - `/status/` 页面：尽量按页面中已加载的内容保存 Thread（同一作者的推文）
  - 图片：尽量使用原图链接下载并嵌入到 Notes（你选择的“原图不压缩/不缩放”）
- Notes 文件夹：
  - 插件里可选择文件夹
  - 可勾选“记住这个文件夹（下次不再问）”

## 安装

### TL;DR（第一次使用照这个做）

```bash
cd apple-notes-webclipper
npm install
npm run build
```

然后：
1. `chrome://extensions` → Developer mode → Load unpacked → 选 `apple-notes-webclipper/dist/extension`
2. 复制扩展 **ID**
3. `./native_host/install_native_host.sh <你的扩展ID>`
4. 回到 `chrome://extensions` 给扩展点 “Reload”
5. 打开扩展 Options → 点「测试连接」；按 macOS 弹窗给 Chrome 授权控制“备忘录(Notes)”

### 1) 构建扩展

```bash
cd apple-notes-webclipper
npm run build
```

构建产物在 `dist/extension`。

### 2) 加载 Chrome 插件（unpacked）

1. 打开 `chrome://extensions`
2. 打开右上角「Developer mode」
3. 点「Load unpacked」选择 `apple-notes-webclipper/dist/extension`
4. 复制这个扩展的 **ID**（后面安装 Native Host 要用）

> 如果你要保存 `file://` 本地网页，需要在扩展详情里打开「Allow access to file URLs」。

### 3) 安装 Native Host（macOS）

```bash
cd apple-notes-webclipper
./native_host/install_native_host.sh <你的扩展ID>
```

然后在扩展 Options 页面点击「测试连接」。

> 如果遇到 `❌ 连接失败：Native host has exited.`：
> - 先确认已在 `chrome://extensions` 里 Reload 扩展（以及扩展 ID 没变）
> - 查看 Native Host 日志：`~/Library/Logs/AppleNotesWebClipper/native-host.log`
> - 用脚本快速自检 Native Host 是否能响应 ping：`bash tools/test_native_host_ping.sh`

> 如果遇到 `保存失败：Could not establish connection. Receiving end does not exist.`：
> - 说明插件无法读取当前标签页内容（比如在 `chrome://` 页面、Chrome Web Store、扩展页面等受限页面）
> - 如果是 `file://` 本地文件：在扩展详情里开启「Allow access to file URLs」并刷新该页面
> - 如果你刚安装/重载扩展：刷新当前网页标签页后再点保存

> 首次写入 Notes 时，macOS 可能会弹窗请求授权：
> - 「Google Chrome 想要控制『备忘录』」→ 允许
> - 若没弹窗：系统设置 → 隐私与安全性 → 自动化 → 打开 Chrome 对 Notes 的权限

## 使用

- 打开任意网页或 X(Twitter) 推文页面
- 点扩展图标
  - 「保存（阅读模式 / 正文）」：默认
  - 「保存（仅选中内容）」：先在页面上选中内容再点

## 重要限制（当前实现）

- 图片由本机 Native Host **按 URL 下载**后嵌入到 Notes（不会通过 Chrome 消息传大文件）；因此：
  - 需要登录/鉴权的站点图片可能下载失败
  - X(Twitter) 图片一般可正常下载（会尽量请求 `name=orig`）
- X Thread 保存范围取决于页面已加载的推文：想保存更多请先滚动加载后再点保存。

## 排版调试（遇到“排版乱七八糟”时）

为了让我能复现你的页面并调转换逻辑，你可以导出一次保存的调试数据：

1. Chrome 扩展 → Options
2. 「调试（排版乱时用）」里点击「下载 Debug JSON」
3. 把这个 JSON 发给我（越原始越好）

可选：
- 点击「生成 HTML 预览（Native Host）」会在本机临时目录生成一个预览 HTML 文件（用于快速对照）
- 也可以点「复制 Debug JSON」直接粘贴给我（内容会比较长）
- 你也可以在本地用脚本把 Debug JSON 渲染成 HTML：

```bash
cd apple-notes-webclipper
python3 tools/render_debug_payload.py /path/to/apple-notes-webclipper-debug-*.json
```

## 开发

```bash
npm run watch
```

## 分发（推荐：Chrome Web Store Unlisted + macOS 一键安装）

> 这个项目 **仅 macOS 可用**（因为目标是写入 Apple Notes）。

### 1) 打包并上传到 Chrome Web Store（Unlisted）

生成上传用 zip：

```bash
cd apple-notes-webclipper
npm run release:zip
```

产物在 `release/out/AppleNotesWebClipperExtension-<version>.zip`。

上传到 Chrome Web Store 后（建议选择 **Unlisted**），发布成功会得到固定的 **Extension ID**（形如 32 位小写字母）。

### 2) 生成给用户双击安装的 macOS pkg（Native Host）

Native Host 的白名单必须绑定上面的 Extension ID，因此 pkg 需要在拿到 ID 后生成：

```bash
cd apple-notes-webclipper
./release/build_macos_native_host_pkg.sh <你的Chrome扩展ID>
```

产物在 `release/out/AppleNotesWebClipperNativeHost-<version>.pkg`。

**代码签名和公证（推荐用于分发）：**

为了在 macOS 15+ 上无警告安装，建议对 pkg 进行签名和公证：

```bash
# 签名（需要 Developer ID 证书）
./release/build_macos_native_host_pkg.sh --sign <你的Chrome扩展ID>

# 签名 + 公证 + 装订（需要 Apple ID 和专用密码）
export APPLE_ID="your@email.com"
export APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
./release/build_macos_native_host_pkg.sh --sign --notarize --staple <你的Chrome扩展ID>
```

详细的签名/公证步骤和证书获取方法，请参考 [BUILD_MACOS.md](docs/BUILD_MACOS.md)。

### 3) 发给别人怎么装（最省心）

1. 给他们 Chrome Web Store 的安装链接（Unlisted 也有可分享链接）
2. 再给他们 `AppleNotesWebClipperNativeHost-*.pkg`，让他们双击安装
3. 首次使用保存时，按 macOS 弹窗授权 Chrome 控制 Notes（系统设置 → 隐私与安全性 → 自动化）

> 备注：如果你要更丝滑的"无需安全提示"，通常还需要对 pkg/二进制做代码签名并 notarize（Apple 流程）。代码签名和公证的详细步骤请参考 [BUILD_MACOS.md](docs/BUILD_MACOS.md)。

然后在 `chrome://extensions` 里点扩展的「Reload」。
