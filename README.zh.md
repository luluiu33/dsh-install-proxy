# dsh-install-proxy

给 **DSH 插件安装链路** 用的代理开关：一个设置页，填地址、点保存，立刻改写 `~/.npmrc` 与 `~/.gitconfig`，`pnpm` / `git` 子进程下一次启动就走代理。**不需要重启 DSH。**

## 它管什么、不管什么

| 管 | 不管 |
| --- | --- |
| 插件安装（pnpm add / pnpm install / npm） | DSH 自身的模型请求 |
| GitHub 插件（git ls-remote / git clone / codeload 下载） | `web_fetch`、网页搜索、MCP 连接 |
| | 系统级代理、Clash/TUN |

DSH 自身请求走 harness 内建的 `dsh-http-proxy` 层（配置在 `$DSH_HOME/.env` 或启动器环境变量，需要重启），本插件不碰它。

## 安装

```bash
# 在 DSH 里（插件管理器支持本地目录）
plugin_manager action=install_bundle target=/绝对路径/dsh-install-proxy
# 或者命令行
dsh plugin --profile web add /绝对路径/dsh-install-proxy
```

从 GitHub 安装（其他人可用）：

```
github:luluiu33/dsh-install-proxy#v0.1.0
```

或在命令行：

```bash
dsh plugin --profile web add github:luluiu33/dsh-install-proxy#v0.1.0
```

装完刷新网页，进入 **设置 → 安装代理**。

> 如果系统的 git 缺少 `git-remote-https`（fnOS 应用版 git 就有这个毛病），`github:` 方式会在**装之前**就报 `git: 'remote-https' is not a git command`——本插件管不到那么早。先修 git（`ln -sf /usr/bin/git "$DSH_HOME/.npm-global/bin/git"`），或改用本地目录 / tarball 安装。

## 界面

- **npm 源（registry）**：内置六个常用源，一键切换；也可选「自定义」手填。保存时只替换 `~/.npmrc` 里的**全局** `registry=` 行，`@scope:registry=` 等其它作用域行原样保留。旁边的 **测试源** 会用当前代理配置取一个已知包的元数据，返回 HTTP 状态与耗时。
- **启用代理**：总开关。关掉并保存会移除代理，恢复直连（源的选择保留）。
- **代理地址**：`http://user:password@192.168.1.10:7890`。密码在界面上打码显示为 `***`；只要不动输入框，就不会把打码值写回配置。
- **不走代理的地址（noproxy）**：默认 `localhost,127.0.0.1,.local`。
- **顺带修复 git 助手**：fnOS 应用版 git 没有 `git-remote-https`，会让 `github:` 类插件报 `git: 'remote-https' is not a git command`。勾上会在 `$DSH_HOME/.npm-global/bin/git` 建一个指向 `/usr/bin/git` 的符号链接（PATH 最前面，优先级高于应用版 git）。
- **保存并生效**：写文件 + 建链接，立即完成。
- **测试代理连通性**：用当前地址跑一次 `git ls-remote`（12 秒超时），返回耗时和 HEAD 提交。
- 面板下方三行状态显示当前**实际生效**的值，不是界面上的输入值。

## 保存后改了哪些文件

`~/.npmrc`（HOME 目录下；fnOS 等应用环境里 HOME 可能形如 `/vol1/@appshare/<应用名>`）：

```ini
registry=https://mirrors.tencent.com/npm/   # 由「npm 源」下拉框决定
proxy=http://user:pass@192.168.1.10:7890
https-proxy=http://user:pass@192.168.1.10:7890
noproxy=localhost,127.0.0.1,.local
```

切换源只替换 `registry=` 这一行，其它行（含 `@scope:registry=`）不动；文件权限 600。

**多个源共存**：`.npmrc` 支持按作用域分流，例如

```ini
registry=https://registry.npmmirror.com/
@company:registry=https://npm.company.internal/
//npm.company.internal/:_authToken=xxxx
```

面板只管全局 `registry=`；作用域行请手工维护，保存时不会被清掉。

`~/.gitconfig`：`http.proxy` / `https.proxy` 两项（关闭时 `--unset-all`）。

配置文件：`$DSH_HOME/install-proxy.json`（600）。

## 语义

- **fail-closed**：代理填了但连不上，pnpm / git 会直接报错（`ECONNREFUSED` / `Couldn't connect`），不会偷偷回退直连。
- **端口/协议**：只支持 `http://` 与 `https://` 代理（HTTP CONNECT 走 HTTPS 站点）；SOCKS 不在 `.npmrc` / `.gitconfig` 的支持范围内，请用 Clash 之类的本地 http 端口。
- **密码含特殊字符**：写成 URL 编码形式（`@` → `%40`，`:` → `%3A`）。

## 卸载与回滚

```bash
dsh plugin --profile web remove dsh-install-proxy
rm -f $DSH_HOME/install-proxy.json
```

再在面板里关掉开关保存一次（或手工删 `~/.npmrc` 三行与 `.gitconfig` 两项）即可恢复直连。git 助手符号链接可单独删：`rm -f $DSH_HOME/.npm-global/bin/git`。

## 安全

设置路由 `/_dsh/install-proxy` 只在同源页面里可用：Host 白名单（回环 + 本机网卡 + 主机名）、POST 必须带 `x-dsh-install-proxy: 1` 请求头、带 Origin 时校验同源、请求体上限 64 KB、GET 返回的密码永远打码。

## 反代 / 子路径部署

通过反代网关访问 DSH 时（例如 fnOS 网关把 DSH 挂在 `/app/fn-deepseek-harness` 下），面板会自动探测挂载前缀：先按根路径请求，404 时按页面路径从长到短试探前缀，命中后记住。无需手工配置；直连 `:port` 与走网关都能用。

## 兼容性

- DSH `>=0.2.0-rc.1 <0.3.0-0`（在 `0.2.2-rc.1` 上验证）。
- Node `>=20`。零运行时依赖，只用 `fs` / `os` / `path` / `child_process`。
