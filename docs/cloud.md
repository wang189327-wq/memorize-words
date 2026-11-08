# 可选的自部署同步

本地模式不需要账号或云端。启用云端后仍先自动保存本地，只有点击“同步进度”才传输学习和收藏记录；登录、启动和后台都不自动同步。

一套后端只允许注册一个所有者账号，供这个账号的多台设备使用。这里没有面向公众的账号管理、找回密码、组织权限或付费服务。

## 阿里云FC与Tablestore

1. 在自己的地域创建Tablestore表，表名可自定。主键`pk`和`sk`均为String；业务属性为`payload`和`revision`，由代码写入。
2. 创建Node.js 22 Web函数。上传`cloud/`源码及按锁文件安装的生产依赖，启动命令为`node server.cjs`，HTTP端口9000。
3. 给函数配置访问该表的角色及最小所需读写权限。`store.cjs`使用FC注入的临时凭据，不需要把长期AccessKey写进代码。
4. 按`cloud/environment.example.json`配置环境变量，替换全部占位符。签名密钥至少32字符，邀请码自行生成并私人保存。
5. `IELTS75_ALLOWED_ORIGINS`列出真实网页版HTTPS来源，以及安卓内置来源`https://appassets.androidplatform.net`。这是兼容原部署的变量名，不代表连接任何默认服务器。
6. 部署后访问`/health`，确认`ok`和`favoritesSync`为true、`booksStored`为false。在应用中填自己的HTTPS函数地址并用邀请码注册所有者账号。

表分区按账号和书籍隔离；学习记录与收藏使用不同排序键。无需把词卡正文、封面或PDF上传云端。

## 验收

设备A学习/收藏一个词并同步，B同步后应看到记录；B取消收藏并同步，A再次同步后星标熄灭。断网学习应能重开保留，联网手动同步再合并。

本机测试使用MemoryStore验证接口，不会接入真实阿里云。上线后仍需核对自己的角色权限、CORS、地域和账单。旧后端缺少收藏接口时，新客户端会提示升级并保留本地记录。

## 接口

- `POST /v1/register`、`/v1/login`：账号注册和登录。
- `POST /v1/refresh`、`/v1/logout`：设备会话。
- `GET/POST /v1/progress/:book`：学习日期和复习事件。
- `GET/POST /v1/favorites/:book`：收藏和取消标记。

使用Python 3.12及以上版本执行`python tools/package-cloud.py`，脚本在独立临时目录按根锁文件和修补依赖覆盖配置安装生产依赖，再生成`build/cloud/wordmemo-sync-1.4.0.zip`。不会包含图书、测试或环境密钥。不要在cloud目录单独安装，否则可能绕过根目录的依赖修补配置。
