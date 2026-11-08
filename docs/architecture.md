# 架构与修改入口

项目保留原生JavaScript与Java，没有引入前端框架。页面使用ES模块；业务规则、存储和平台接口分别维护。

| 位置                                | 职责                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| `web/core.js`                       | 词库和备份验证、学习队列、题目、收藏合并等纯规则；也可被Node测试加载 |
| `web/domain/learning.js`            | 7/18词复习节点，不读取页面                                           |
| `web/ui/runtime.js`                 | 当前页面、队列、选项和内存状态                                       |
| `web/ui/state.js`                   | 唯一的学习状态提交入口`persist`                                      |
| `web/ui/cards.js`                   | 词卡、词汇拓展、收藏与切卡                                           |
| `web/ui/learning.js`                | 学习安排、新词和学习中的拼写练习                                     |
| `web/ui/review.js`                  | 复习范围、题目、结果和学习日期                                       |
| `web/ui/library.js`                 | 词库列表与筛选                                                       |
| `web/ui/settings.js`                | 设置、资源入口及账号表单                                             |
| `web/ui/backup.js`                  | 导入、导出和内置示例更新                                             |
| `web/ui/navigation.js`              | 页面切换及渲染调度                                                   |
| `web/app.js`                        | 初始化及Android/同步回调注册                                         |
| `web/browser-store.js`              | IndexedDB分表事务及旧快照迁移                                        |
| `web/storage/records.js`            | 纯数据行布局、增量补丁、启动时重建；浏览器和原生共用                 |
| `web/sync.js`                       | 手动同步协议、分批传输及失败重试状态                                 |
| `web/update.js`                     | 可选更新清单检查与下载入口                                           |
| `android/.../LearningStorage.java`  | 原生SQLite行事务、旧AtomicFile读取和迁移                             |
| `android/.../SpeechController.java` | 系统TTS及口音选择                                                    |
| `android/.../AppUpdater.java`       | 下载验证及系统安装入口                                               |
| `cloud/server.cjs`、`store.cjs`     | HTTP接口与Tablestore存储适配                                         |

## 保存与失败处理

业务函数先构造新状态，再`await persist(next)`。`persist`验证并等待真实写入成功，才替换`runtime.state`。写入期间阻止重复操作和页面切换；失败保留旧状态并允许重试。

浏览器的`BrowserStore.save`返回Promise，不得当作立即成功的布尔值。Android桥接写入本身同步完成，也经同一个异步提交入口使用。新增页面时不要绕过此入口直接修改`runtime.state`或写数据库。

存储按books、learned、results、favorites、ratings、schedules及metadata分开。IndexedDB使用独立object store；原生SQLite用(store,id)复合主键保存相同JSON行。普通复习仅写入新增结果和小型元数据，不重写词书。`WordMemoRecords.patch(next, previous, replace)`是平台共用契约；传入状态应不可变，不能先修改旧对象再提交。

旧schema1快照在导入入口完整验证，旧复习事件只在迁移时分配稳定ID。新事务提交并核验后才移除旧快照；失败保留原数据。正常提交只验证变更行和当前安排，不再次遍历词书全文。恢复完整备份使用显式replace；更换书籍需要原有确认。用户手动导出的完整备份不受清理影响。原生更新器只清理专用APK缓存，不访问学习文件。

浏览器在versionchange时关闭旧连接，遇到blocked时提示关闭旧标签后刷新；不得删除数据库绕开升级阻塞。`tests/browser/storage.test.cjs`通过真实IndexedDB异常验证事务回滚、旧数据保留、ID稳定和单条事件提交。`LearningStorageTest`通过Robolectric运行SQLite事务测试，属于电脑模拟，并非实体安卓验证。CPU与序列化载荷基准命令为`node tools/benchmark-storage.mjs`，不代表手机磁盘耗时。

## 平台接口

`window.AndroidStore`只在Android WebView存在，提供`load/save`、导入导出、朗读和更新等方法。网页端使用IndexedDB及浏览器能力。原生返回操作通过`window.onNativeImport`、`window.onNativeStatus`、`window.onNativeBack`处理，不读取ES模块内部变量。

`WordMemo`是纯规则的浏览器入口；`WordMemoSync`和`WordMemoUpdate`分别负责可选同步和更新。页面之间通过明确的`import`共享函数；持久化状态仅从`state.js`提交。

## 兼容范围

旧1.4备份的`schemaVersion: 1`、`sjj-`词条ID和`source.sentence`仍可读取。本地存储键及后端环境变量保留历史`ielts75`前缀，避免无必要的数据迁移；它们不是访问个人服务器的配置。

当前是单活动词库、单所有者自部署后端。若要增加多用户服务或同时切换多本词库，应先设计账号/书籍隔离及迁移测试，不能只放宽一个注册判断。

## Fork及浏览器资源策略

`tools/check-config.mjs`导出的`checkConfig(config, repository)`可独立测试；CI使用GitHub提供的`GITHUB_REPOSITORY`，Fork保留原项目更新地址时失败。Fork可关闭更新，或同时改成自己的清单与Release地址，并使用自己的包名与签名。该检查防误配置，不能阻止维护者主动修改检查脚本。

`web/index.html`的meta CSP限制脚本同源，禁止eval、插件及表单外发。允许内联样式是为了现有动态主题与字号，不同时放开内联脚本。`img-src data: blob:`支持本地封面；`connect-src https:`支持用户自部署的HTTPS同步服务器及更新清单，并不将网络限制为某个固定云端。修改策略需验证备份导入导出、主题字号、云同步及安卓WebView；meta方式不具备全部响应头CSP能力。
