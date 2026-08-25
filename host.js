// User History Rail — Host half
// =============================================================
// 动态 Cordis 宿主插件（持久化留档版）。
// 提供 `uhm/user-inputs` 私有 RPC：读取会话日志，返回当前会话中
// 用户发过的历史输入 + 紧随其后的可见回答。
//
// 运行方式：通过 cordis_define 的 code.host 传入本文件函数体。
// =============================================================
return {
  apply(ctx) {
    harness.handle('uhm/user-inputs', async (args) => {
      try {
        const sid = args && typeof args === 'object' && typeof args.sessionId === 'string' ? args.sessionId : ''
        if (!sid) return { items: [] }
        const sessionQuery = ctx.get('sessionQuery')
        if (sessionQuery === undefined) return { items: [], error: 'sessionQuery unavailable' }
        // 优先 readSurface（只读模型表面事件，量小）；回退 readSession（整段原始日志）。
        let events = []
        if (sessionQuery && typeof sessionQuery.readSurface === 'function') {
          const surf = await sessionQuery.readSurface(sid)
          events = surf && Array.isArray(surf.events) ? surf.events : []
        } else if (sessionQuery && typeof sessionQuery.readSession === 'function') {
          const snap = await sessionQuery.readSession(sid)
          events = snap && Array.isArray(snap.events) ? snap.events : []
        }
        const items = []
        const n = events.length
        for (let i = 0; i < n; i++) {
          const ev = events[i]
          // 只取用户直接输入 / steering（source.kind === 'user'），排除工具注入的上下文。
          if (!ev || ev.type !== 'user/message') continue
          const data = ev.data
          if (!data || !data.source || data.source.kind !== 'user') continue
          const text = extractText(data.content)
          if (!text) continue
          // 找紧随其后的第一条有可见输出的 assistant/message 作为回答。
          let answer = ''
          for (let j = i + 1; j < n; j++) {
            const ev2 = events[j]
            if (!ev2) continue
            if (ev2.type === 'user/message' && ev2.data && ev2.data.source && ev2.data.source.kind === 'user') break
            if (ev2.type !== 'assistant/message') continue
            const msg = ev2.data && ev2.data.message ? ev2.data.message : null
            answer = msg ? extractText(msg.content) : ''
            if (answer) break
          }
          items.push({
            seq: ev.seq,
            time: ev.time,
            text: text,
            answer: answer.length > 200 ? answer.slice(0, 200) : answer
          })
        }
        return { items: items.slice(-500) }
      } catch (err) {
        return { items: [], error: String((err && err.message) || err) }
      }
    })

    // 只提取 type === 'text' 的可见输出块，过滤 reasoning（think）等非可见块。
    function extractText(blocks) {
      if (!Array.isArray(blocks)) return ''
      let out = ''
      for (const block of blocks) {
        if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string' && block.text) {
          out += (out ? '\n' : '') + block.text
        }
      }
      return out.trim()
    }
  }
}
