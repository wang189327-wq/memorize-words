# 发布与更新

主项目使用GitHub Release及Pages的`version-reset-1.json`作为1.0重置后的独立更新渠道。旧的code25渠道不再作为本分支入口。Fork后必须使用自己的应用ID、发布仓库和签名，不沿用原维护者的服务器。

1. 在`app.config.json`设置版本，例如`1.1`和更大的`versionCode`；更新版本名和内部码，不反复替换同一个正式版本。
2. 如需应用内更新，开启`updates.enabled`，填写自己的HTTPS `manifestUrl`及以`/`结尾的`releaseBase`。执行`npm run configure`。
3. 运行格式、静态检查、全部测试与`check:public`，再执行干净安卓构建。正式包使用自己的固定签名。
4. 创建对应不可变的Git标签和GitHub Release，先上传APK。不要把私人词库放进公开安装包。
5. `node tools/make-update-manifest.mjs APK路径 HTTPS下载地址`生成带SHA256的清单。只有APK已能下载且哈希一致后，才发布清单到自己的更新网址。
6. 从旧版本手动检查更新，核对安装提示、数据保留，以及更新成功后首次启动的APK缓存清理。

生成器发现同名版本清单内容改变会拒绝覆盖，要求递增版本。不要在发布脚本中读取其他人的系统Git凭据；使用自己显式配置的发布凭据或GitHub Actions受限权限。

Android由应用下载到专用缓存，校验SHA256、包名、目标版本及签名，再打开系统安装确认页。安装取消时保留缓存，安装成功后首次打开才清理缓存；学习文件和浏览器原先下载的APK不在此清理范围内。

网页是`web/`静态文件。部署前执行`npm run configure`，配置HTTPS及合适的内容安全策略，后端允许来源也要包含网页版网址。网页不具备Android原生安装缓存管理能力。

1.0是经用户确认的版本码重置（code1），不是code25的覆盖升级。code25用户须先备份、卸载重装并恢复；后续此分支递增为code2、code3。GitHub保留旧标签和发布记录，便于追溯。
