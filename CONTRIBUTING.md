# 参与修改

先运行README中的安装和测试命令。UI从`web/ui/`对应文件修改；纯规则放`core.js`或`domain/`，不要把新业务都放进初始化脚本。

提交前运行：

```sh
npm run configure
npm run format
npm run generate
npm run check:config
npm run check:generated
npm run lint
npm run check:public
npm test
```

涉及Android时，再执行干净Gradle构建和单元测试。Java使用`python tools/format-java.py`格式化，`--check`参数仅检查；需要Python 3.12及JDK 21，工具首次从官方公开地址下载并校验固定SHA256。JS/CSS/JSON/Markdown使用项目固定的Prettier版本。

请在改动说明中写清触发条件、改变后的行为及实际验证范围。浏览器模拟不能写成手机实测，本机模拟云端不能写成阿里云上线成功。

测试使用原创夹具，不依赖私人书籍、电脑用户名、Codex安装位置或真实账号。添加功能时覆盖失败和恢复路径，尤其是写入失败、取消操作、旧备份及同步期间的并发修改。

不要提交`node_modules`、SDK/JDK、签名私钥、真实环境变量、学习记录和商业图书。导入格式变化时保持旧备份可读，或提供明确的迁移步骤。

## 常见修改入口

- 存储：storage/records.js定义补丁；browser-store.js与LearningStorage.java实现事务。恢复/词库变更推进generation，旧标签必须刷新，不能删除该检查。
- 调度：domain/scheduler.js定义固定参数，domain/rating-contract.js定义协议。参数或协议变化须有版本与迁移。
- 备份：domain/backup-crypto.js负责密码封装，ui/backup-password.js只负责临时密码，ui/backup.js解包、验证与确认后再提交。密码不得进入runtime、日志或持久化。
- 离线：tools/build-offline.mjs生成静态清单，web/sw.js只管理外壳。API响应、用户词书、令牌和APK不能缓存。
- 复制：ui/clipboard.js维护输出格式与浏览器/原生适配，MainActivity提供原生剪贴板接口。

修改源码后先格式化，再运行npm run generate；生成文件位于web/vendor、web/rating-contract.js、cloud/rating-contract.cjs及web/offline-assets.js，不手改生成结果。README产品截图由node tools/capture-demo.cjs生成，只使用原创示例和虚构进度。

## 本地工作区与发行文件

开发时使用Git工作区，保留远端和分支信息，不要把发行快照当作唯一维护入口。
在工作区执行 `git config core.autocrlf false`；行尾由 `.gitattributes` 决定，普通文本为LF，Windows批处理为CRLF。
修改前后运行 `git status --short` 与 `git diff`；执行 `git fetch origin` 后，`git status -sb` 可显示与远端的领先或落后关系。
Git不会自动提醒未推送改动，需要主动执行上述检查。

`local-delivery/` 与 `SOURCE_SHA256.json` 是本地交付和核验资料，不提交到仓库。
已发布版本作为历史快照保留；后续构建使用新的版本码和Release标签。

## 工具脚本怎么读、改完怎么验证

| 入口                      | 用途                                     | 修改后的验证                                 |
| ------------------------- | ---------------------------------------- | -------------------------------------------- |
| `tools/configure.mjs`     | 从app.config.json生成前端配置            | npm run configure、npm run check:config      |
| `tools/build-android.py`  | 在临时目录构建，解决Windows中文路径问题  | 正式构建及原生单元测试；检查包名、版本和签名 |
| `tools/package-cloud.py`  | 按锁文件打包FC依赖，不部署服务器         | cloud/tests、检查ZIP无私人配置               |
| `tools/build-offline.mjs` | 生成静态资源哈希清单                     | npm run check:generated、离线浏览器测试      |
| `tools/check-public.mjs`  | 阻止私人词库、密钥及机器文件进入公开源码 | npm run check:public                         |
| `tools/test.mjs`          | 运行规则、HTTP和浏览器测试               | npm test；失败时查看首个失败用例             |

脚本从项目根目录执行。生成文件不要手改；先修改输入，再运行生成命令。
构建签名通过环境变量传入，不能把个人磁盘路径或密码写到工具脚本。
