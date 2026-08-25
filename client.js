// User History Rail — Client half
// =============================================================
// 动态 Cordis 浏览器插件（持久化留档版）。
// 注册点：
//   - shell.overlay：右侧常驻栅栏列（每个历史输入一根刻度），
//     悬停变长变黑并弹出"时间 + 输入 + 回答"预览，点击跳转。
//   - conversation.chat.turnTail：每个已完成回合的不可见锚点，
//     记录 user/steering 消息 seq + 聊天节点 key，供点击跳转定位。
//
// 运行方式：通过 cordis_define 的 code.client 传入本文件函数体。
// =============================================================
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    // seq -> { el, key }：锚点元素 + 该 user/steering 消息的聊天节点 key。
    const registry = new Map()
    let cache = null // { sessionId, updatedAt, items, error }

    function setAnchor(seq, el, key) {
      if (el) registry.set(seq, { el: el, key: key })
      else registry.delete(seq)
    }

    // 点击跳转：先找到滚动容器，再按聊天节点 key 定位到目标消息元素。
    function jumpToSeq(seq) {
      const entry = registry.get(seq)
      if (!entry) return
      const el = entry.el
      let target = null
      if (el && entry.key) {
        const safeKey = String(entry.key).replace(/["\\]/g, '')
        let scroller = el.parentElement
        while (scroller) {
          if (scroller.scrollHeight > scroller.clientHeight) break
          scroller = scroller.parentElement
        }
        if (scroller) {
          try { target = scroller.querySelector('[data-chat-anchor-key="' + safeKey + '"]') } catch (e) { target = null }
        }
      }
      const final = target || el
      if (!final) return
      try { final.scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch (e) {
        try { final.scrollIntoView(true) } catch (e2) {}
      }
    }

    function formatTime(ms) {
      try {
        return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      } catch (e) {
        return String(ms)
      }
    }

    // ---- 锚点标记：每个完成的回合一根不可见 div，对应回合内每个 user/steering 节点 ----
    function Anchor(props) {
      const snapshot = props.useSession ? props.useSession(function (s) { return s }) : undefined
      const turn = props.turn
      const turnNo = turn && typeof turn.turn === 'number' ? turn.turn : null
      let rows = []
      if (snapshot && snapshot.chat && snapshot.chat.locations && snapshot.chat.nodes && turnNo !== null) {
        let keys = []
        try { keys = snapshot.chat.locations.getTurn(turnNo) || [] } catch (e) { keys = [] }
        for (const key of keys) {
          let node = null
          try { node = snapshot.chat.nodes.get(key) } catch (e) { node = null }
          if (node && (node.kind === 'user' || node.kind === 'steering') && typeof node.anchorSeq === 'number') {
            rows.push({ seq: node.anchorSeq, key: key })
          }
        }
      }
      if (rows.length === 0) return null
      return React.createElement('div', { className: 'uhm-anchors', 'aria-hidden': true },
        rows.map(function (row) {
          return React.createElement('div', {
            key: row.seq,
            'data-uhm-seq': row.seq,
            className: 'uhm-anchor',
            ref: function (el) { setAnchor(row.seq, el, row.key) }
          })
        })
      )
    }

    // ---- 右侧常驻栅栏列 ----
    function Rail(props) {
      const useSessions = props.useSessions
      const current = useSessions ? useSessions(function (s) { return s.current }) : undefined
      const updatedAt = useSessions ? useSessions(function (s) {
        return s.current && s.byId[s.current] ? s.byId[s.current].updatedAt : undefined
      }) : undefined
      const [hoverSeq, setHoverSeq] = React.useState(null)
      const [state, setState] = React.useState({ loading: false, items: null, error: null })

      // 会话切换 / 新消息时拉取（带缓存）。
      React.useEffect(function () {
        if (!current) {
          setState({ loading: false, items: null, error: null })
          return
        }
        const cached = cache
        if (cached && cached.sessionId === current && cached.updatedAt === updatedAt) {
          setState({ loading: false, items: cached.items, error: cached.error })
          return
        }
        let cancelled = false
        setState({ loading: true, items: null, error: null })
        host.call('uhm/user-inputs', { sessionId: current }).then(function (res) {
          if (cancelled) return
          const r = res && typeof res === 'object' ? res : {}
          const next = {
            sessionId: current,
            updatedAt: updatedAt,
            items: Array.isArray(r.items) ? r.items : [],
            error: typeof r.error === 'string' ? r.error : null
          }
          cache = next
          setState({ loading: false, items: next.items, error: next.error })
        }).catch(function (err) {
          if (cancelled) return
          setState({ loading: false, items: [], error: String((err && err.message) || err) })
        })
        return function () { cancelled = true }
      }, [current, updatedAt])

      const items = state.items || []
      const hoveredItem = items.length === 0 ? null : items.find(function (it) { return it.seq === hoverSeq }) || null

      const preview = hoveredItem
        ? React.createElement('div', { className: 'uhm-tip' },
            React.createElement('div', { className: 'uhm-tip-time' }, formatTime(hoveredItem.time)),
            React.createElement('div', { className: 'uhm-tip-text' }, hoveredItem.text),
            hoveredItem.answer
              ? React.createElement('div', { className: 'uhm-tip-answer' }, hoveredItem.answer)
              : null
          )
        : null

      // 每个刻度是一个固定尺寸的透明命中区（26x10），栅栏条(12px→悬停24px)居中。
      // 命中区比加长后的栅栏还宽，鼠标移到边缘仍保持选中。
      const ticks = items.map(function (item) {
        const active = item.seq === hoverSeq
        return React.createElement('div', {
          key: item.seq,
          className: active ? 'uhm-tick uhm-tick-active' : 'uhm-tick',
          onClick: function () { jumpToSeq(item.seq); setHoverSeq(null) }
        },
          React.createElement('div', { className: 'uhm-tick-bar' })
        )
      })

      // onMouseMove 按指针纵向位置实时选中最近的刻度，保证在列间滑动时切换顺滑。
      const onStripMove = function (e) {
        const strip = e.currentTarget
        const rect = strip.getBoundingClientRect()
        const y = e.clientY - rect.top
        let index = Math.floor(y / (rect.height / items.length))
        if (index < 0) index = 0
        if (index >= items.length) index = items.length - 1
        const it = items[index]
        if (it && it.seq !== hoverSeq) setHoverSeq(it.seq)
      }
      const clearHover = function () { setHoverSeq(null) }

      return React.createElement('div', {
        className: 'uhm-wrap',
        onMouseLeave: clearHover
      },
        preview,
        state.error
          ? React.createElement('div', { className: 'uhm-note uhm-note-error', title: state.error }, '!')
          : React.createElement('div', { className: 'uhm-strip', onMouseMove: onStripMove }, ticks)
      )
    }

    styles.insert([
      '@keyframes uhmFade{from{opacity:0}to{opacity:1}}',
      '.uhm-anchors{height:0;overflow:hidden}.uhm-anchor{width:0;height:0}',
      '.uhm-wrap{position:fixed;right:20px;top:50%;transform:translateY(-50%);z-index:1200;display:flex;align-items:center;pointer-events:auto}',
      '.uhm-strip{display:flex;flex-direction:column;align-items:center;gap:6px;max-height:60vh;overflow-y:auto}',
      '.uhm-tick{flex:none;width:26px;height:10px;display:flex;align-items:center;justify-content:center;cursor:pointer}',
      '.uhm-tick-bar{width:12px;height:2px;border-radius:1px;background:rgba(127,127,127,.55);transition:width .08s ease,background .08s ease}',
      '.uhm-tick:hover .uhm-tick-bar,.uhm-tick-active .uhm-tick-bar{width:24px;background:var(--dsw-alias-label-primary,#111)}',
      '.uhm-note{flex:none;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary,#888);padding:2px}',
      '.uhm-note-error{color:var(--dsw-alias-state-error-primary,#d33)}',
      '.uhm-tip{position:absolute;right:calc(100% + 12px);top:50%;transform:translateY(-50%);width:280px;max-height:70vh;overflow:auto;box-sizing:border-box;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#222);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35));border-radius:10px;box-shadow:0 4px 22px rgba(0,0,0,.16);padding:10px 12px;font-size:13px;line-height:1.5;animation:uhmFade .12s ease}',
      '.uhm-tip-time{font-size:11px;color:var(--dsw-alias-label-secondary,#888);margin-bottom:4px;font-variant-numeric:tabular-nums}',
      '.uhm-tip-text{white-space:pre-line;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;margin-bottom:4px}',
      '.uhm-tip-answer{white-space:pre-line;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;color:var(--dsw-alias-label-secondary,#777);border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));padding-top:4px}'
    ].join('\n'))

    slots.inject('shell.overlay', function () {
      return slots.register(
        { name: 'shell.overlay', id: 'user-history-rail', order: 200 },
        function (props) { return React.createElement(Rail, props) }
      )
    })
    slots.inject('conversation.chat.turnTail', function () {
      return slots.register(
        {
          name: 'conversation.chat.turnTail',
          select: function (owner) { return owner && owner.turn ? true : null }
        },
        function (props) { return React.createElement(Anchor, props) }
      )
    })
  }
}
