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
