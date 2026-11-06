# dsh-install-proxy

A settings page for the **DSH plugin install chain**: switch a proxy on/off and pick an npm registry, then `pnpm` and `git` child processes use it immediately. No DSH restart required.

[中文说明](README.zh.md)

## What it manages — and what it does not

| Manages | Does not manage |
| --- | --- |
| Plugin install/upgrade (`pnpm add` / `pnpm install` / `npm`) | DSH model requests |
| GitHub plugins (`git ls-remote` / `git clone` / codeload tarballs) | `web_fetch`, web search, MCP connections |
| | System-wide proxy, Clash/TUN |

DSH's own HTTP traffic goes through the built-in `dsh-http-proxy` layer (configured via `$DSH_HOME/.env` or launcher environment variables, requires a restart). This plugin does not touch it.

## Requirements

- DSH `>=0.2.0-rc.1 <0.3.0-0` (verified on `0.2.2-rc.1`), web profile.
- Node `>=20` on the host running DSH.
- Zero runtime dependencies (`fs` / `os` / `path` / `child_process` only).

## Install

Plugin manager (the `target` is an install spec):

```bash
dsh plugin --profile web add github:luluiu33/dsh-install-proxy#v0.1.0
```

or from a local checkout:

```bash
dsh plugin --profile web add /absolute/path/to/dsh-install-proxy
```

Then refresh the web UI and open **Settings → Install proxy**.

> On hosts whose git lacks `git-remote-https` (the fnOS app-bundled git does), a `github:` install fails **before** this plugin can help, with `git: 'remote-https' is not a git command`. Fix git first (`ln -sf /usr/bin/git "$DSH_HOME/.npm-global/bin/git"`) or install from a local directory / tarball.

## Using the panel

- **npm registry** — six built-in mirrors plus a custom URL. Saving only replaces the global `registry=` line in `~/.npmrc`; scoped `@scope:registry=` lines are preserved. **Test registry** fetches package metadata through the current proxy settings and reports status + latency.
- **Enable proxy** — master switch. Turning it off removes the proxy lines (the registry choice is kept).
- **Proxy URL** — `http://user:password@192.168.1.10:7890`. Passwords are masked as `***`; leaving the field untouched never writes the mask back.
- **No-proxy list** — defaults to `localhost,127.0.0.1,.local`.
- **Fix git helper** — creates `$DSH_HOME/.npm-global/bin/git` as a symlink to `/usr/bin/git`, so `git-remote-https` exists again (fnOS app git bug).
- **Save & apply** — writes the files and creates the symlink immediately.
- **Test proxy** — runs `git ls-remote` through the configured address (12 s timeout) and reports latency + HEAD commit.
- The three status lines at the bottom show what is **actually effective** on disk, not the form values.

## Files written

`~/.npmrc`:

```ini
registry=https://mirrors.tencent.com/npm/
proxy=http://user:pass@192.168.1.10:7890
https-proxy=http://user:pass@192.168.1.10:7890
noproxy=localhost,127.0.0.1,.local
```

Only the global `registry=` line is touched when switching mirrors; the file is kept at mode `600`.

Multiple registries coexist through scopes — the panel leaves these alone:

```ini
registry=https://registry.npmmirror.com/
@company:registry=https://npm.company.internal/
//npm.company.internal/:_authToken=xxxx
```

`~/.gitconfig`: the `http.proxy` / `https.proxy` entries (unset when the proxy is disabled).

Plugin state: `$DSH_HOME/install-proxy.json` (mode `600`).

## Behavior

- **Fail closed**: if the proxy is configured but unreachable, pnpm / git fail with `ECONNREFUSED` / `Couldn't connect` — they never silently fall back to a direct connection.
- **HTTP only**: `http://` and `https://` proxies (HTTPS sites go through CONNECT). SOCKS is not supported by `.npmrc` / `.gitconfig`; point the plugin at a local Clash HTTP port instead.
- **Special characters in passwords** must be URL-encoded (`@` → `%40`, `:` → `%3A`).

## Behind a reverse proxy / sub-path

When DSH is served under a sub-path by a gateway (for example the fnOS gateway mounts it at `/app/fn-deepseek-harness`), the panel auto-detects the mount prefix: it probes the root path first, then path prefixes from longest to shortest, and remembers the one that works. No configuration needed; direct-port access keeps working.

## Security

The `/_dsh/install-proxy` route is only usable from the same origin page: Host allowlist (loopback + local interfaces + host name), POST requires the `x-dsh-install-proxy: 1` header, Origin is checked when present, request body is capped at 64 KB, and GET never returns an unmasked password.

## Uninstall / rollback

```bash
dsh plugin --profile web remove dsh-install-proxy
rm -f "$DSH_HOME/install-proxy.json"
```

Disable the proxy in the panel once before uninstalling (or delete the three `~/.npmrc` lines and the two `.gitconfig` entries manually) to restore direct connections. The git symlink can be removed separately: `rm -f "$DSH_HOME/.npm-global/bin/git"`.

## Development

No build step: plain ESM server module (`lib/index.js`) and a hand-written `React.createElement` client bundle (`lib/client.js`).

```bash
node --check lib/index.js && node --check lib/client.js
```

To reload after editing: `remove_bundle` then `install_bundle` again (server code and the revved client bundle are not hot-reloaded).

## License

MIT
