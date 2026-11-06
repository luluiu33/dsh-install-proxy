# dsh-install-proxy

DSH 插件安装链路的代理开关。在设置页填好代理地址保存，`pnpm` / `git` 下次运行就走代理，不用重启 DSH。

只管插件安装：pnpm/npm、`git clone`、GitHub tarball。DSH 自己的模型请求和 `web_fetch` 走内核的 `dsh-http-proxy`，这里不碰。

## 安装

需要 DSH 0.2.x（验证于 0.2.2-rc.1）和 Node 20+。

```
dsh plugin --profile web add github:luluiu33/dsh-install-proxy#v0.1.0
```

刷新页面，打开 设置 → 安装代理。

fnOS 的应用版 git 缺 `git-remote-https`，用 `github:` 方式装会先失败。先修一下：

```
ln -sf /usr/bin/git "$DSH_HOME/.npm-global/bin/git"
```

或者直接用本地目录安装。

## 面板

- 代理开关和地址（`http://user:pass@host:port`）。
- npm 源：六个常用源加一个自定义。保存只替换全局 `registry=` 行，`@scope:registry=` 不动。
- 不走代理的地址列表。
- 可选的 git 助手修复：把 `/usr/bin/git` 软链到 `$DSH_HOME/.npm-global/bin`。
- 测试代理（`git ls-remote`）和测试源两个按钮。

保存会写 `~/.npmrc` 的 `proxy`、`https-proxy`、`noproxy`，以及 `~/.gitconfig` 的 `http.proxy` / `https.proxy`。面板配置在 `$DSH_HOME/install-proxy.json`。密码在界面上打码，打码值不会被写回。

代理填了但连不上时，pnpm 和 git 直接报错，不会偷偷直连。只支持 `http://` 和 `https://` 代理，SOCKS 请指向本机 Clash 的 HTTP 端口。

DSH 被反代挂在子路径下时（比如 fnOS 的 `/app/fn-deepseek-harness`），面板会自动探测挂载前缀。

## 卸载

先在面板里关掉代理保存，然后：

```
dsh plugin --profile web remove dsh-install-proxy
```

## License

MIT
