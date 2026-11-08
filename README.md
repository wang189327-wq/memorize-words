# Memorize Words / 词记

本地保存词库与学习记录的单词学习工具，提供Android应用和浏览器版。可选自部署云端，只在用户点击“同步进度”时同步学习记录和收藏。

这是从“雅思7.5”整理出的MIT开源工程，正式版本为1.1 / versionCode 2。沿用应用ID `cn.ielts75.app`，可恢复旧格式完整备份；不包含私人图书、学习记录或签名私钥。首次打开载入6张原创示例词卡。旧版版本码较高时，应先导出完整备份，再卸载、安装并恢复。

仓库：[memorize-words](https://github.com/wang189327-wq/memorize-words)；[在线使用](https://wang189327-wq.github.io/memorize-words/)；[下载安装包](https://github.com/wang189327-wq/memorize-words/releases/tag/v1.1-code2)。

| 新词学习                                   | 到期与手动复习                          | 本地备份                              |
| ------------------------------------------ | --------------------------------------- | ------------------------------------- |
| ![原创示例学习页面](docs/images/learn.png) | ![到期复习选择](docs/images/review.png) | ![备份设置](docs/images/settings.png) |

## 功能

- 新词学习：按数量或分组选择，按词库顺序学习；7词、18词和结束时拼写复习。
- 单词复习：词义回忆、中文回忆拼写、句子填空、词形转换，可组合选择。
- 今日到期：FSRS按明确的四档反馈安排复习；同词多题每轮只计一次，保留手动选词。
- 当日单词复制：独立选择是否添加序号、是否包含释义，按书本顺序一行一个词。
- 网页离线：首次联网完成缓存后可断网重开；更新失败保留旧缓存，学习数据留在IndexedDB。
- 收藏：单击星标，随机抽取收藏词，或输入起止单词按词库顺序复习。
- 单词库：英文搜索、分组筛选、左右切换词卡。
- 设置：字号、背景色、明文或可选密码加密备份导出与恢复、可选手动云同步。
- Android：调用系统离线语音；缺少英音或美音时明确提示，不用另一个口音代替。
- 更新：主项目已配置自己的发布渠道，支持应用内下载、校验、系统确认安装和成功更新后清理APK缓存。

当前只维护一本活动词库。切换到另一词库前，请导出需要保留的完整备份。软件不识别PDF、图片或EPUB，也不提供OCR。

## 本地运行

需要Node.js 22或更新版本。

```sh
npm ci
npm run configure
npm start
```

打开`http://localhost:8080`。浏览器使用IndexedDB，建议保持同一网址访问；换浏览器、隐私模式或清理站点数据不会保留原数据。

自己的词库可在“设置→词库资源→导入本地词库”添加。格式见[数据说明](docs/data-format.md)，完整原创示例见[web/deck.json](web/deck.json)。

## 检查与测试

```sh
npx playwright install chromium
npm run format:check
npm run lint
npm run check:config
npm run check:generated
npm run check:public
npm test
```

`npm test`运行核心规则、HTTP后端和真实IndexedDB浏览器测试。它不连接真实阿里云、不安装手机软件，也不会生成测试截图。GitHub Actions配置见[CI工作流](.github/workflows/ci.yml)。

## Android构建

需要JDK 21、Android SDK Platform 35和Build Tools 35.0.0。先执行`npm ci`，将`JAVA_HOME`与`ANDROID_HOME`设置为本机工具位置。

Windows：

```powershell
.\gradlew.bat clean assembleDebug testDebugUnitTest
```

macOS/Linux：

```sh
chmod +x gradlew
./gradlew clean assembleDebug testDebugUnitTest
```

输出位于`android/app/build/outputs/apk/debug/app-debug.apk`。这是调试签名包；正式发布需使用维护者自己的签名。详细步骤和Windows路径注意事项见[构建说明](docs/build.md)。

若Windows中文目录导致测试类无法加载，可用Python 3.12+执行`python tools/build-android.py`，在独立临时目录构建后输出至`build/android`。

## 配置与部署

应用名称、包名、版本和更新渠道统一从[app.config.json](app.config.json)读取。更改后运行`npm run configure`。Fork须关闭更新检查，或填写自己的应用ID、发布地址并使用自己的签名。

- [架构与修改入口](docs/architecture.md)
- [自部署同步后端](docs/cloud.md)：一套后端只注册一个所有者账号，供该账号的多台设备使用。
- [发布及更新](docs/releasing.md)：使用自己的仓库与签名，不覆盖已发布的版本。
- [贡献指南](CONTRIBUTING.md)
- [安全与数据边界](SECURITY.md)

项目代码及原创示例使用[MIT许可证](LICENSE)。第三方工具保留各自许可证，见[第三方说明](THIRD_PARTY_NOTICES.md)。

## 迁移与限制

1.0/code1可用同签名1.1/code2覆盖升级。历史已有1.1标签，本轮使用v1.1-code2保留旧发布。应用ID仍为cn.ielts75.app，与个人版不能并存；旧code25等较高版本码须先导出备份，再卸载重装并恢复。

新版能读旧schema1备份，新导出使用schema2封装，旧程序不承诺读取新备份。明文文件上限30MiB、加密原文上限20MiB；密码遗失无法找回。首次未完成缓存的网页不能离线启动，朗读仍依赖设备声音。评分同步需1.5后端，旧后端会提示评分尚未同步，保留本地日志。

无需云同步时选择仅本地使用；多设备按部署文档配置自己的服务器，不存在项目提供的公共账号服务。
