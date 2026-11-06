# dsh-install-proxy

**English** | [简体中文](README.zh.md)

Proxy switch for the DSH plugin install chain. Fill in a proxy in Settings, save, and `pnpm` / `git` use it on their next run. No DSH restart needed.

It only covers plugin installation: pnpm/npm, `git clone`, GitHub tarballs. DSH's own model traffic and `web_fetch` go through the built-in `dsh-http-proxy` and are not affected.

## Install

Requires DSH 0.2.x (tested on 0.2.2-rc.1) and Node 20+.

```
dsh plugin --profile web add github:luluiu33/dsh-install-proxy#v0.1.0
```

Refresh the page, then open Settings → Install proxy.

On fnOS the app-bundled git is missing `git-remote-https`, so a `github:` install fails before this plugin can run. Fix it first:

```
ln -sf /usr/bin/git "$DSH_HOME/.npm-global/bin/git"
```

or install from a local checkout.

## Panel

- Proxy on/off and address (`http://user:pass@host:port`).
- npm registry: six common mirrors plus a custom URL. Only the global `registry=` line is replaced; scoped `@scope:registry=` lines are left alone.
- No-proxy list.
- Optional git helper fix: symlinks `/usr/bin/git` into `$DSH_HOME/.npm-global/bin`.
- Buttons to test the proxy (`git ls-remote`) and the registry.

Saving writes `proxy`, `https-proxy` and `noproxy` into `~/.npmrc`, and `http.proxy` / `https.proxy` into `~/.gitconfig`. Panel state lives in `$DSH_HOME/install-proxy.json`. Passwords are masked on screen and the mask is never written back.

If the proxy is unreachable, pnpm and git fail instead of silently going direct. Only `http://` and `https://` proxies work — for SOCKS, point this at a local Clash HTTP port.

When DSH sits behind a gateway on a sub-path (for example `/app/fn-deepseek-harness` on fnOS), the panel probes for the mount prefix automatically.

## Uninstall

Turn the proxy off in the panel first, then:

```
dsh plugin --profile web remove dsh-install-proxy
```

## License

MIT
