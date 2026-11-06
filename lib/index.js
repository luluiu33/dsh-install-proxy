// dsh-install-proxy — 服务端（Node 半边）
//
// 目标：给「插件安装链路」用的代理提供一个图形界面。
//   - 保存后写 ~/.npmrc 的 proxy / https-proxy / noproxy 三行 → pnpm 子进程立即生效；
//   - 写 ~/.gitconfig 的 http.proxy / https.proxy → git ls-remote / clone 立即生效；
//   - 顺带确保 PATH 最前面有一个能用的 git（fnOS 应用版 git 缺 remote-https 助手时用系统 git 顶上）。
// 注意：本插件只管安装链路（pnpm/git 子进程）。DSH 自身请求（web_fetch / 模型 / 搜索）
// 走的是 harness 的 dsh-http-proxy 层，不受这里影响——那是 dsh-net-proxy 之类的范围。
//
// 配置落在 $DSH_HOME/install-proxy.json；浏览器设置页经同源路由 /_dsh/install-proxy 读写。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

export const name = 'install-proxy'
export const inject = []

const HEADER = 'x-dsh-install-proxy'
const MASK = '***'
const MAX_BODY = 64 * 1024
const SYSTEM_GIT = '/usr/bin/git'
const GITHUB_PROBE = 'https://github.com/aa2246740/dsh-better-display.git'

const DEFAULTS = {
  enabled: false,
  proxyUrl: '',
  noProxy: 'localhost,127.0.0.1,.local',
  ensureGitHelper: true,
  registry: '',
}

const PROXY_LINE = /^(proxy|https-proxy|noproxy)\s*=/i
const REGISTRY_LINE = /^registry\s*=/i

function homeDir() {
  return process.env.HOME || os.homedir()
}

function dshHome() {
  return process.env.DSH_HOME || path.join(homeDir(), '.dsh')
}

export const paths = {
  config: () => path.join(dshHome(), 'install-proxy.json'),
  npmrc: () => path.join(homeDir(), '.npmrc'),
  gitconfig: () => path.join(homeDir(), '.gitconfig'),
  gitShim: () => path.join(dshHome(), '.npm-global', 'bin', 'git'),
}

// ── 配置读写 ────────────────────────────────────────────────────────────────

export function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(paths.config(), 'utf8'))
    return { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeConfig(cfg) {
  const file = paths.config()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

// ── URL 处理 ────────────────────────────────────────────────────────────────

export function maskUrl(raw) {
  try {
    const u = new URL(raw)
    if (u.password) {
      u.password = MASK
      return u.toString().replace(/\/$/, '')
    }
    return raw
  } catch {
    return raw
  }
}

export function normalizeUrl(raw) {
  const s = String(raw == null ? '' : raw).trim()
  if (!s) return { ok: true, value: '' }
  let u
  try {
    u = new URL(s)
  } catch {
    return { ok: false, error: '不是合法 URL，应形如 http://user:pass@192.168.1.10:7890' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: '只支持 http:// 或 https:// 代理' }
  }
  if (!u.hostname) return { ok: false, error: '缺少主机地址' }
  return { ok: true, value: u.toString().replace(/\/$/, '') }
}

export function normalizeRegistry(raw) {
  const s = String(raw == null ? '' : raw).trim()
  if (!s) return { ok: true, value: '' }
  let u
  try {
    u = new URL(s)
  } catch {
    return { ok: false, error: '源地址不是合法 URL，应形如 https://registry.npmmirror.com/' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: '源只支持 http:// 或 https://' }
  }
  if (!u.hostname) return { ok: false, error: '源缺少主机地址' }
  const value = u.toString()
  return { ok: true, value: value.endsWith('/') ? value : `${value}/` }
}

// ── 写 .npmrc ───────────────────────────────────────────────────────────────

function stripProxyLines(text) {
  const lines = String(text || '').split(/\r?\n/).filter(line => !PROXY_LINE.test(line.trim()))
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  return lines
}

export function applyNpmrc(cfg) {
  const file = paths.npmrc()
  let before = ''
  try {
    before = fs.readFileSync(file, 'utf8')
  } catch {}
  const lines = stripProxyLines(before)
  // 切源：只替换/插入全局 registry= 行，@scope:registry= 等其它行原样保留
  if (cfg.registry) {
    const index = lines.findIndex(line => REGISTRY_LINE.test(line.trim()))
    const line = `registry=${cfg.registry}`
    if (index === -1) lines.unshift(line)
    else lines[index] = line
  }
  if (cfg.enabled && cfg.proxyUrl) {
    lines.push(`proxy=${cfg.proxyUrl}`, `https-proxy=${cfg.proxyUrl}`, `noproxy=${cfg.noProxy || ''}`)
  }
  const next = lines.length ? `${lines.join('\n')}\n` : ''
  const changed = next !== before
  if (changed) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, next, { mode: 0o600 })
  }
  return { path: file, changed }
}

// ── git 操作 ────────────────────────────────────────────────────────────────

function git(args, options = {}) {
  return new Promise(resolve => {
    execFile('git', args, { timeout: 15000, env: { ...process.env }, ...options }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        error: err ? String((err && err.message) || err) : '',
      })
    })
  })
}

export async function applyGit(cfg) {
  const keys = ['http.proxy', 'https.proxy']
  const results = []
  if (cfg.enabled && cfg.proxyUrl) {
    for (const key of keys) {
      results.push({ key, ...(await git(['config', '--global', '--replace-all', key, cfg.proxyUrl])) })
    }
  } else {
    for (const key of keys) {
      // 未设置时 --unset-all 会返回非零，属于正常
      results.push({ key, ...(await git(['config', '--global', '--unset-all', key])) })
    }
  }
  return { path: paths.gitconfig(), results }
}

export function ensureGitHelper() {
  const shim = paths.gitShim()
  try {
    const st = fs.lstatSync(shim)
    const target = st.isSymbolicLink() ? fs.readlinkSync(shim) : ''
    if (target === SYSTEM_GIT) return { ok: true, path: shim, target, note: '已就绪' }
  } catch {}
  if (!fs.existsSync(SYSTEM_GIT)) {
    return { ok: false, path: shim, target: SYSTEM_GIT, error: `${SYSTEM_GIT} 不存在` }
  }
  try {
    fs.mkdirSync(path.dirname(shim), { recursive: true })
    try {
      fs.rmSync(shim, { force: true })
    } catch {}
    fs.symlinkSync(SYSTEM_GIT, shim)
    return { ok: true, path: shim, target: SYSTEM_GIT, created: true }
  } catch (error) {
    return { ok: false, path: shim, target: SYSTEM_GIT, error: String((error && error.message) || error) }
  }
}

// ── 生效状态 ────────────────────────────────────────────────────────────────

async function readEffective() {
  let pnpmProxy = null
  let registry = null
  try {
    for (const line of fs.readFileSync(paths.npmrc(), 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (/^proxy\s*=/i.test(trimmed)) pnpmProxy = trimmed.slice(trimmed.indexOf('=') + 1).trim()
      if (/^registry\s*=/i.test(trimmed)) registry = trimmed.slice(trimmed.indexOf('=') + 1).trim()
    }
  } catch {}
  const gitProxy = await git(['config', '--global', '--get', 'http.proxy'])
  const shim = paths.gitShim()
  let helper = { path: shim, ok: false, target: null }
  try {
    const st = fs.lstatSync(shim)
    helper = {
      path: shim,
      ok: st.isSymbolicLink() && fs.readlinkSync(shim) === SYSTEM_GIT,
      target: st.isSymbolicLink() ? fs.readlinkSync(shim) : 'not-a-symlink',
    }
  } catch {}
  return {
    pnpmProxy: pnpmProxy ? maskUrl(pnpmProxy) : null,
    registry,
    gitProxy: gitProxy.ok && gitProxy.stdout ? maskUrl(gitProxy.stdout) : null,
    gitHelper: helper,
  }
}

export async function status() {
  const cfg = readConfig()
  return { config: { ...cfg, proxyUrl: maskUrl(cfg.proxyUrl) }, effective: await readEffective() }
}

// ── 应用 ────────────────────────────────────────────────────────────────────

export async function applyConfig(cfg) {
  const npmrc = applyNpmrc(cfg)
  const gitCfg = await applyGit(cfg)
  const helper = cfg.ensureGitHelper ? ensureGitHelper() : { ok: true, skipped: true }
  writeConfig(cfg)
  return { npmrc, git: gitCfg, helper }
}

export function probeProxy(candidate) {
  return new Promise(resolve => {
    const startedAt = Date.now()
    const env = {
      ...process.env,
      http_proxy: candidate,
      https_proxy: candidate,
      HTTP_PROXY: candidate,
      HTTPS_PROXY: candidate,
      GIT_TERMINAL_PROMPT: '0',
      LC_ALL: 'C',
    }
    execFile('git', ['-c', 'credential.helper=', 'ls-remote', '--', GITHUB_PROBE, 'HEAD'], { env, timeout: 12000 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        ms: Date.now() - startedAt,
        head: String(stdout || '').trim().split(/\s+/)[0] || '',
        error: err ? String(String(stderr || '').trim() || (err && err.message) || err) : '',
      })
    })
  })
}

// 测一个 npm 源：用 curl 取一个已知包（dsh-progress-rules）的元数据，
// 只看 HTTP 状态与耗时；走不走代理取决于当前开关，和实际安装保持一致。
export function probeRegistry(registry, proxyUrl, useProxy, packageName = 'dsh-progress-rules') {
  return new Promise(resolve => {
    const startedAt = Date.now()
    const url = `${String(registry || '').replace(/\/+$/, '')}/${packageName}`
    const args = ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '10']
    if (useProxy && proxyUrl) args.push('-x', proxyUrl)
    args.push(url)
    execFile('curl', args, { timeout: 12000 }, (err, stdout, stderr) => {
      const status = String(stdout || '').trim()
      resolve({
        ok: !err && status.startsWith('2'),
        status,
        ms: Date.now() - startedAt,
        registry: String(registry || ''),
        error: err ? String(String(stderr || '').trim() || (err && err.message) || err) : (status.startsWith('2') ? '' : `HTTP ${status}`),
      })
    })
  })
}

// ── HTTP 路由 ───────────────────────────────────────────────────────────────

function allowedHosts() {
  const names = new Set(['127.0.0.1', 'localhost', '::1'])
  try {
    if (os.hostname()) names.add(os.hostname().toLowerCase())
  } catch {}
  try {
    for (const list of Object.values(os.networkInterfaces() || {})) {
      for (const item of list || []) {
        if (item && typeof item.address === 'string') names.add(item.address.toLowerCase())
      }
    }
  } catch {}
  return [...names].filter(Boolean)
}

function hostnameOf(hostHeader) {
  const raw = String(hostHeader || '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.startsWith('[')) {
    const close = raw.indexOf(']')
    return close === -1 ? raw : raw.slice(1, close)
  }
  const first = raw.indexOf(':')
  if (first !== -1 && first === raw.lastIndexOf(':') && /^\d+$/.test(raw.slice(first + 1))) return raw.slice(0, first)
  return raw
}

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

export function createHandler(logger = console) {
  return async function handler(req, res) {
    try {
      const allowed = allowedHosts()
      const host = hostnameOf(req.headers.host)
      if (host && !allowed.includes(host)) {
        sendJson(res, 403, { error: 'Host 不被允许' })
        return
      }
      if (req.method === 'GET') {
        sendJson(res, 200, await status())
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method not allowed' })
        return
      }
      if (String(req.headers[HEADER] || '') !== '1') {
        sendJson(res, 403, { error: '缺少 X-DSH-Install-Proxy 请求头' })
        return
      }
      const origin = req.headers.origin
      if (origin) {
        try {
          if (new URL(origin).host !== String(req.headers.host || '')) {
            sendJson(res, 403, { error: '跨源写入被拒绝' })
            return
          }
        } catch {
          sendJson(res, 403, { error: 'Origin 非法' })
          return
        }
      }
      const body = await readBody(req)
      if (body && body.action === 'test') {
        const normalized = normalizeUrl(body.proxyUrl)
        if (!normalized.ok) {
          sendJson(res, 400, { error: normalized.error })
          return
        }
        const target = normalized.value || readConfig().proxyUrl
        if (!target) {
          sendJson(res, 400, { error: '先填一个代理地址再测试' })
          return
        }
        sendJson(res, 200, { test: await probeProxy(target) })
        return
      }
      if (body && body.action === 'test-registry') {
        const normalized = normalizeRegistry(body.registry)
        if (!normalized.ok) {
          sendJson(res, 400, { error: normalized.error })
          return
        }
        const cfg = readConfig()
        const target = normalized.value || cfg.registry
        if (!target) {
          sendJson(res, 400, { error: '先选一个源再测试' })
          return
        }
        const useProxy = body.enabled === undefined ? cfg.enabled : Boolean(body.enabled)
        sendJson(res, 200, { testRegistry: await probeRegistry(target, cfg.proxyUrl, useProxy) })
        return
      }

      const current = readConfig()
      const next = { ...current }
      if (body && Object.prototype.hasOwnProperty.call(body, 'enabled')) next.enabled = Boolean(body.enabled)
      if (body && typeof body.noProxy === 'string') next.noProxy = body.noProxy.trim()
      if (body && Object.prototype.hasOwnProperty.call(body, 'ensureGitHelper')) next.ensureGitHelper = Boolean(body.ensureGitHelper)
      if (body && typeof body.proxyUrl === 'string') {
        const submitted = body.proxyUrl.trim()
        if (submitted.includes(MASK)) {
          // 页面回传的是打码后的地址，视为「不修改」
        } else {
          const normalized = normalizeUrl(submitted)
          if (!normalized.ok) {
            sendJson(res, 400, { error: normalized.error })
            return
          }
          next.proxyUrl = normalized.value
        }
      }
      if (body && Object.prototype.hasOwnProperty.call(body, 'registry')) {
        const normalized = normalizeRegistry(body.registry)
        if (!normalized.ok) {
          sendJson(res, 400, { error: normalized.error })
          return
        }
        next.registry = normalized.value
      }
      if (next.enabled && !next.proxyUrl) {
        sendJson(res, 400, { error: '启用代理前请先填写代理地址' })
        return
      }
      const applied = await applyConfig(next)
      if (!applied.helper.ok && next.ensureGitHelper) {
        logger.warn?.(`[install-proxy] git 助手修复失败: ${applied.helper.error || 'unknown'}`)
      }
      sendJson(res, 200, { ...(await status()), applied: { npmrc: applied.npmrc.changed, git: applied.git.results.map(r => ({ key: r.key, ok: r.ok })), helper: applied.helper } })
    } catch (error) {
      logger.error?.(`[install-proxy] ${(error && error.stack) || error}`)
      sendJson(res, 500, { error: String((error && error.message) || error) })
    }
  }
}

// ── 插件入口 ────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const logger = (ctx && ctx.logger && typeof ctx.logger.error === 'function') ? ctx.logger : console
  const info = typeof logger.info === 'function' ? logger.info.bind(logger) : logger.error.bind(logger)

  // 启动时按已保存的配置重放一次，保证文件与配置一致（例如手工改过文件、或换了 HOME）
  const saved = readConfig()
  if (saved.enabled && saved.proxyUrl) {
    applyConfig(saved).then(result => {
      info(`[install-proxy] 已重放代理配置 → ${paths.npmrc()} / ${paths.gitconfig()}（git 助手: ${result.helper.ok ? 'ok' : '失败'}）`)
    }).catch(error => {
      logger.error?.(`[install-proxy] 重放失败: ${(error && error.stack) || error}`)
    })
  }

  if (ctx && typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], function (webCtx) {
      webCtx.effect(function () {
        const disposers = []
        disposers.push(webCtx.webServer.register({
          kind: 'exact',
          path: '/_dsh/install-proxy',
          handler: createHandler(logger),
        }))
        info('[install-proxy] 设置路由: /_dsh/install-proxy')
        return () => {
          for (const dispose of disposers) {
            try {
              dispose && dispose()
            } catch {}
          }
        }
      }, 'install-proxy: web settings route')
    })
  }
}
