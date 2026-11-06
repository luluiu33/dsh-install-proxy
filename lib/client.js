// dsh-install-proxy — 浏览器 client-plugin（设置 → 安装代理）
//
// 面板只管「插件安装链路」：保存后服务端改写 ~/.npmrc 与 ~/.gitconfig，
// pnpm/git 子进程下一次启动即生效，无需重启 DSH。
// 不涉及 DSH 自身的 web_fetch / 模型请求（那属于 harness 的 dsh-http-proxy 层）。
//
// 没有构建步骤：直接手写 React.createElement，由宿主的 __ModuleLoader__ 装载。

window.__ModuleLoader__.load({
  id: 'dsh-install-proxy',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement

    var CSS = [
      '.dhp-section{display:flex;flex-direction:column;gap:14px;max-width:760px}',
      '.dhp-title{font-size:18px;font-weight:650;margin:0 0 2px;color:var(--dsw-alias-label-primary,#e6e8ee)}',
      '.dhp-intro{font-size:12.5px;line-height:1.65;color:var(--dsw-alias-label-tertiary,#8a90a0);margin:0}',
      '.dhp-panel{display:flex;flex-direction:column;gap:14px;border:1px solid var(--dsw-alias-border-l2,#2a2f3a);border-radius:12px;padding:16px;background:var(--dsw-alias-bg-layer-2,#1a1e26)}',
      '.dhp-row{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary,#e6e8ee)}',
      '.dhp-field{display:flex;flex-direction:column;gap:6px}',
      '.dhp-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#b4bac7)}',
      '.dhp-input{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#2a2f3a);border-radius:8px;padding:8px 10px;font-size:13px;background:var(--dsw-alias-bg-layer-1,#12151b);color:var(--dsw-alias-label-primary,#e6e8ee);font-family:inherit}',
      '.dhp-input:focus{outline:1px solid var(--dsw-alias-brand-primary,#4f8cff);border-color:transparent}',
      '.dhp-hint{font-size:11px;line-height:1.55;color:var(--dsw-alias-label-tertiary,#8a90a0)}',
      '.dhp-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.dhp-btn{border:1px solid var(--dsw-alias-border-l2,#2a2f3a);border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:500;cursor:pointer;background:var(--dsw-alias-bg-layer-1,#12151b);color:var(--dsw-alias-label-primary,#e6e8ee)}',
      '.dhp-btn.primary{background:var(--dsw-alias-brand-primary,#4f8cff);border-color:transparent;color:#fff}',
      '.dhp-btn:disabled{opacity:.55;cursor:default}',
      '.dhp-status{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--dsw-alias-border-l2,#2a2f3a);padding-top:12px;font-size:12px}',
      '.dhp-status-row{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}',
      '.dhp-status-key{min-width:148px;color:var(--dsw-alias-label-secondary,#b4bac7)}',
      '.dhp-ok{color:var(--dsw-alias-label-success,#2ecc71)}',
      '.dhp-bad{color:var(--dsw-alias-label-danger,#e74c3c)}',
      '.dhp-val{color:var(--dsw-alias-label-primary,#e6e8ee);word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.dhp-alert{border-radius:8px;padding:8px 12px;font-size:12px;line-height:1.5}',
      '.dhp-alert.ok{background:rgba(46,204,113,.12);color:var(--dsw-alias-label-success,#2ecc71)}',
      '.dhp-alert.err{background:rgba(231,76,60,.12);color:var(--dsw-alias-label-danger,#e74c3c)}',
      '.dhp-alert.info{background:var(--dsw-alias-bg-layer-1,#12151b);color:var(--dsw-alias-label-secondary,#b4bac7)}',
    ].join('')

    var HEADER = { 'x-dsh-install-proxy': '1' }

    // 常用 npm 源（2026-11 实测均可访问；延迟见「测试源」按钮）
    var REGISTRIES = [
      { label: '腾讯云 · mirrors.tencent.com（当前默认）', value: 'https://mirrors.tencent.com/npm/' },
      { label: 'npmmirror · 淘宝镜像', value: 'https://registry.npmmirror.com/' },
      { label: '腾讯云 · mirrors.cloud.tencent.com', value: 'https://mirrors.cloud.tencent.com/npm/' },
      { label: 'npm 官方 · registry.npmjs.org', value: 'https://registry.npmjs.org/' },
      { label: '华为云 · repo.huaweicloud.com', value: 'https://repo.huaweicloud.com/repository/npm/' },
      { label: '华为云 · mirrors.huaweicloud.com', value: 'https://mirrors.huaweicloud.com/repository/npm/' },
    ]
    var CUSTOM = '__custom__'

    var API_PATH = '/_dsh/install-proxy'
    // 反代网关（fnOS 等）可能把 dsh 挂在子路径下（如 /app/fn-deepseek-harness）。
    // 根路径失效时按页面路径从长到短依次探测前缀，成功一次后记住。
    var apiBase = null

    function prefixCandidates() {
      var out = ['']
      try {
        var segs = String(window.location.pathname || '/').split('/').filter(function (s) { return s !== '' })
        for (var i = segs.length; i >= 1; i -= 1) out.push('/' + segs.slice(0, i).join('/'))
      } catch (_) { }
      return out
    }

    function apiOnce(url, init) {
      return fetch(url, init).then(function (res) {
        if (res.status === 404) {
          var miss = new Error('HTTP 404')
          miss.status = 404
          throw miss
        }
        return res.json().catch(function () { return {} }).then(function (data) {
          if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status))
          return data
        })
      })
    }

    function api(method, body) {
      var init = { method: method, headers: HEADER }
      if (body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      var bases = apiBase === null ? prefixCandidates() : [apiBase]
      var rescanned = false
      var i = 0
      function step() {
        var base = bases[i]
        return apiOnce(base + API_PATH, init).then(function (data) {
          apiBase = base
          return data
        }, function (err) {
          if (err && err.status === 404) {
            if (i + 1 < bases.length) { i += 1; return step() }
            if (!rescanned && apiBase !== null) { rescanned = true; apiBase = null; bases = prefixCandidates(); i = 0; return step() }
          }
          throw err
        })
      }
      return step()
    }

    function StatusRow(props) {
      return h('div', { className: 'dhp-status-row' },
        h('span', { className: 'dhp-status-key' }, props.label),
        h('span', { className: props.ok ? 'dhp-ok' : 'dhp-bad' }, props.ok ? '✓ ' : '✗ '),
        h('span', { className: 'dhp-val' }, props.children || props.value || ''))
    }

    function InstallProxySection() {
      var state = React.useState({ loading: true, enabled: false, proxyUrl: '', noProxy: '', ensureGitHelper: true, registry: '', registryCustom: false })
      var form = state[0]
      var setForm = state[1]
      var effState = React.useState(null)
      var effective = effState[0]
      var setEffective = effState[1]
      var msgState = React.useState(null)
      var msg = msgState[0]
      var setMsg = msgState[1]
      var busyState = React.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var testState = React.useState(null)
      var test = testState[0]
      var setTest = testState[1]
      var testRegState = React.useState(null)
      var testRegistry = testRegState[0]
      var setTestRegistry = testRegState[1]

      var presetValues = REGISTRIES.map(function (item) { return item.value })
      function isPreset(value) { return presetValues.indexOf(value) !== -1 }

      function hydrate(data) {
        if (!data) return
        if (data.config) {
          var registry = data.config.registry || (data.effective && data.effective.registry) || ''
          setForm({
            loading: false,
            enabled: Boolean(data.config.enabled),
            proxyUrl: data.config.proxyUrl || '',
            noProxy: data.config.noProxy || '',
            ensureGitHelper: data.config.ensureGitHelper !== false,
            registry: registry,
            registryCustom: Boolean(registry) && !isPreset(registry),
          })
        }
        setEffective(data.effective || null)
      }

      React.useEffect(function () {
        api('GET').then(hydrate).catch(function (error) {
          setForm(function (prev) { return Object.assign({}, prev, { loading: false }) })
          setMsg({ kind: 'err', text: '读取配置失败：' + error.message })
        })
      }, [])

      function patch(key, value) {
        setForm(function (prev) { return Object.assign({}, prev, { loading: false, [key]: value }) })
      }

      function save() {
        setBusy(true)
        setMsg(null)
        setTest(null)
        api('POST', {
          enabled: form.enabled,
          proxyUrl: form.proxyUrl,
          noProxy: form.noProxy,
          ensureGitHelper: form.ensureGitHelper,
          registry: form.registry,
        }).then(function (data) {
          hydrate(data)
          var helper = data.applied && data.applied.helper
          if (helper && helper.ok === false) {
            setMsg({ kind: 'err', text: '已保存，但 git 助手修复失败：' + (helper.error || '未知错误') })
          } else {
            setMsg({ kind: 'ok', text: '已保存并立即生效：下次 pnpm 安装会使用这个源' + (form.enabled ? '与代理。' : '（代理已关闭，直连）。') })
          }
        }).catch(function (error) {
          setMsg({ kind: 'err', text: '保存失败：' + error.message })
        }).then(function () { setBusy(false) })
      }

      function runTest() {
        setBusy(true)
        setTest(null)
        setMsg(null)
        api('POST', { action: 'test', proxyUrl: form.proxyUrl }).then(function (data) {
          setTest(data.test || null)
        }).catch(function (error) {
          setMsg({ kind: 'err', text: '测试失败：' + error.message })
        }).then(function () { setBusy(false) })
      }

      function runTestRegistry() {
        setBusy(true)
        setTestRegistry(null)
        setMsg(null)
        api('POST', { action: 'test-registry', registry: form.registry, enabled: form.enabled }).then(function (data) {
          setTestRegistry(data.testRegistry || null)
        }).catch(function (error) {
          setMsg({ kind: 'err', text: '测试源失败：' + error.message })
        }).then(function () { setBusy(false) })
      }

      var helper = effective && effective.gitHelper
      return h('div', { className: 'dhp-section' },
        h('h2', { className: 'dhp-title' }, '安装代理（pnpm / git）'),
        h('p', { className: 'dhp-intro' },
          '这里只控制「安装插件」这条链路：保存后写入 ~/.npmrc 与 ~/.gitconfig，pnpm 与 git 子进程下次启动即生效，无需重启 DSH。',
          h('br'),
          'DSH 自身的网页抓取 / 模型请求不经过这里——那由 harness 的代理层负责。'),

        h('div', { className: 'dhp-panel' },
          h('label', { className: 'dhp-row' },
            h('input', {
              type: 'checkbox',
              checked: form.enabled,
              onChange: function (event) { patch('enabled', event.target.checked) },
            }),
            '启用代理'),

          h('div', { className: 'dhp-field' },
            h('span', { className: 'dhp-label' }, 'npm 源（registry）'),
            h('select', {
              className: 'dhp-input',
              value: form.registryCustom ? CUSTOM : form.registry,
              onChange: function (event) {
                var value = event.target.value
                if (value === CUSTOM) {
                  patch('registryCustom', true)
                } else {
                  setForm(function (prev) {
                    return Object.assign({}, prev, { loading: false, registry: value, registryCustom: false })
                  })
                }
              },
            },
              REGISTRIES.map(function (item) { return h('option', { key: item.value, value: item.value }, item.label) }),
              h('option', { value: CUSTOM }, '自定义…')),
            form.registryCustom
              ? h('input', {
                className: 'dhp-input',
                spellCheck: false,
                placeholder: 'https://mirror.example.com/npm/',
                value: form.registry,
                onChange: function (event) { patch('registry', event.target.value) },
              })
              : null,
            h('span', { className: 'dhp-hint' }, '写入 ~/.npmrc 的 registry= 行。只切全局默认源，@scope:registry= 等其它行保持原样；需要多个源共存就手工加作用域行。')),

          h('div', { className: 'dhp-field' },
            h('span', { className: 'dhp-label' }, '代理地址'),
            h('input', {
              className: 'dhp-input',
              spellCheck: false,
              placeholder: 'http://user:password@192.168.1.10:7890',
              value: form.proxyUrl,
              onChange: function (event) { patch('proxyUrl', event.target.value) },
            }),
            h('span', { className: 'dhp-hint' }, '支持 http:// 与 https://；带认证就写成 http://用户名:密码@主机:端口。密码在界面上会打码显示。')),

          h('div', { className: 'dhp-field' },
            h('span', { className: 'dhp-label' }, '不走代理的地址（noproxy）'),
            h('input', {
              className: 'dhp-input',
              spellCheck: false,
              value: form.noProxy,
              onChange: function (event) { patch('noProxy', event.target.value) },
            }),
            h('span', { className: 'dhp-hint' }, '逗号分隔，保持本机地址直连即可。')),

          h('label', { className: 'dhp-row' },
            h('input', {
              type: 'checkbox',
              checked: form.ensureGitHelper,
              onChange: function (event) { patch('ensureGitHelper', event.target.checked) },
            }),
            '顺带修复 git 助手（fnOS 应用版 git 缺 remote-https 时会失败）'),

          h('div', { className: 'dhp-actions' },
            h('button', { className: 'dhp-btn primary', disabled: busy, onClick: save }, busy ? '处理中…' : '保存并生效'),
            h('button', { className: 'dhp-btn', disabled: busy, onClick: runTest }, '测试代理'),
            h('button', { className: 'dhp-btn', disabled: busy, onClick: runTestRegistry }, '测试源')),

          msg ? h('div', { className: 'dhp-alert ' + msg.kind }, msg.text) : null,

          test ? h('div', { className: test.ok ? 'dhp-alert ok' : 'dhp-alert err' },
            test.ok
              ? ('代理连通：git ls-remote 成功，耗时 ' + test.ms + ' ms，HEAD ' + (test.head ? test.head.slice(0, 10) : '—'))
              : ('代理失败（' + test.ms + ' ms）：' + (test.error || 'unknown'))) : null,

          testRegistry ? h('div', { className: testRegistry.ok ? 'dhp-alert ok' : 'dhp-alert err' },
            testRegistry.ok
              ? ('源可用：' + testRegistry.registry + ' 返回 HTTP ' + testRegistry.status + '，耗时 ' + testRegistry.ms + ' ms')
              : ('源不可用：' + testRegistry.registry + ' → ' + (testRegistry.error || ('HTTP ' + testRegistry.status)) + '（' + testRegistry.ms + ' ms）')) : null,

          h('div', { className: 'dhp-status' },
            h(StatusRow, { label: 'npm 源', ok: Boolean(effective && effective.registry), value: (effective && effective.registry) || '未设置' }),
            h(StatusRow, { label: 'pnpm 代理（~/.npmrc）', ok: Boolean(effective && effective.pnpmProxy), value: (effective && effective.pnpmProxy) || '未设置' }),
            h(StatusRow, { label: 'git（~/.gitconfig）', ok: Boolean(effective && effective.gitProxy), value: (effective && effective.gitProxy) || '未设置' }),
            h(StatusRow, { label: 'git 助手', ok: Boolean(helper && helper.ok), value: helper ? ((helper.target || '') + ' → ' + helper.path) : '未知' })),
        ),

        h('p', { className: 'dhp-hint' },
          '配置文件：$DSH_HOME/install-proxy.json；关掉开关并保存会移除 .npmrc 里的 proxy 三行与 .gitconfig 里的 http.proxy，恢复直连。'),
      )
    }

    var inject = ['slots']

    function apply(ctx) {
      if (typeof document !== 'undefined') {
        try {
          var tagId = 'dsh-install-proxy/styles.css'
          if (!document.getElementById(tagId)) {
            var style = document.createElement('style')
            style.id = tagId
            style.setAttribute('data-plugin-css', '')
            style.textContent = CSS
            ;(document.head || document.documentElement).appendChild(style)
          }
        } catch (error) {}
      }
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register({
          name: 'settings.section',
          id: 'install-proxy',
          order: 41,
          label: function () { return '安装代理' },
          inject: function () { return {} },
        }, InstallProxySection)
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
