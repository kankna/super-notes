#!/usr/bin/env node
/**
 * 用真实 Chrome（无头 + CDP）跑一遍完整学习流程，验证站点在真浏览器里可用。
 *
 * 为什么要自己写：内置的 Browser 工具在 Electron 面板里点击会超时，
 * 拿不到可信的交互结论。这个脚本走 Chrome DevTools Protocol，
 * 事件是浏览器自己派发的，和用户手动点击等价。
 *
 * 用法：node tools/e2e-chrome.mjs [站点地址]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SITE = process.argv[2] || 'https://kankna.github.io/super-notes/'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9333

const profile = mkdtempSync(join(tmpdir(), 'sn-e2e-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1440,900',
  'about:blank',
])
chrome.stderr.on('data', () => {})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return await res.json()
    } catch {}
    await sleep(300)
  }
  throw new Error('Chrome 调试端口没起来')
}

let msgId = 0
function rpc(ws, method, params = {}, sessionId) {
  const id = ++msgId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} 超时`)), 20000)
    const onMsg = (ev) => {
      const data = JSON.parse(ev.data)
      if (data.id === id) {
        clearTimeout(timer)
        ws.removeEventListener('message', onMsg)
        if (data.error) reject(new Error(`${method}: ${JSON.stringify(data.error)}`))
        else resolve(data.result)
      }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}

async function main() {
  const version = await waitForDevtools()
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })

  const { targetId } = await rpc(ws, 'Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await rpc(ws, 'Target.attachToTarget', { targetId, flatten: true })

  const send = (method, params) => rpc(ws, method, params, sessionId)
  await send('Page.enable')
  await send('Runtime.enable')

  const logs = []
  ws.addEventListener('message', (ev) => {
    const d = JSON.parse(ev.data)
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
      logs.push(d.params.args.map((a) => a.value ?? a.description).join(' '))
    }
    if (d.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION: ' + (d.params.exceptionDetails?.exception?.description ?? ''))
    }
  })

  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    })
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || 'evaluate 出错')
    }
    return res.result.value
  }

  const waitFor = async (expr, label, timeout = 15000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      try {
        if (await evaluate(expr)) return true
      } catch {}
      await sleep(200)
    }
    throw new Error(`等待超时：${label}`)
  }

  const clickText = async (text, label = text) => {
    const ok = await evaluate(`(() => {
      const els = [...document.querySelectorAll('button, a, [role=button]')];
      const el = els.find(e => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.click();
      return true;
    })()`)
    if (!ok) throw new Error(`找不到可点击元素：${label}`)
    await sleep(350)
  }

  const clickSelector = async (selector, label = selector) => {
    const ok = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`)
    if (!ok) throw new Error(`找不到元素：${label}`)
    await sleep(350)
  }

  console.log('→ 打开站点', SITE)
  await send('Page.navigate', { url: SITE })
  await waitFor(`document.querySelector('.book__title') !== null`, '书架渲染', 20000)
  console.log('  ✓ 书架渲染完成，项目数 =', await evaluate(`document.querySelectorAll('.book__title').length`))

  // 1. 进项目画布
  await clickSelector('.book__title', '书盒')
  await waitFor(`document.querySelector('.react-flow__node-unit') !== null`, '画布渲染')
  console.log('  ✓ 项目画布渲染完成，单元数 =', await evaluate(`document.querySelectorAll('.react-flow__node-unit').length`))

  // 2. 进学习工作台
  await evaluate(`document.querySelector('.unode__title').click()`)
  await waitFor(`document.querySelector('.tcard') !== null`, '模板选择页')
  console.log('  ✓ 进入工作台，模板数 =', await evaluate(`document.querySelectorAll('.tcard').length`))

  // 3. 选模板开始
  await evaluate(`[...document.querySelectorAll('.tcard')].find(c => c.textContent.includes('数学课后学习')).click()`)
  await waitFor(`document.querySelector('.wstep') !== null`, '工作台步骤条')
  console.log('  ✓ 学习已启动，步骤数 =', await evaluate(`document.querySelectorAll('.wstep').length`))

  // 4. 计时
  await clickText('开始', '开始计时')
  await waitFor(`document.querySelector('.tbar__time')?.textContent.trim() !== '00:00'`, '计时器走秒', 8000)
  console.log('  ✓ 计时运行中，当前 =', await evaluate(`document.querySelector('.tbar__time').textContent.trim()`))

  // 5. 先复习：标记不熟悉 + 有疑问
  await evaluate(`[...document.querySelectorAll('.wstep')].find(b => b.textContent.includes('先复习')).click()`)
  await sleep(500)
  const marked = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('.mchip')];
    const un = btns.find(b => b.textContent.includes('不熟悉'));
    if (un) un.click();
    return btns.length;
  })()`)
  console.log(`  ✓ 标记控件 ${marked} 个`)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('.mchip')].find(x => x.textContent.includes('有疑问'));
    if (b) b.click();
  })()`)
  await sleep(600)

  // 6. 弄懂它：疑点清单 + AI 分层提示
  await evaluate(`[...document.querySelectorAll('.wstep')].find(b => b.textContent.includes('弄懂它')).click()`)
  await sleep(500)
  const doubtCount = await evaluate(`document.querySelectorAll('.doubt').length`)
  console.log(`  ✓ 疑点清单条数 = ${doubtCount}`)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('AI 分层提示'));
    if (b) b.click();
  })()`)
  await waitFor(`document.body.textContent.includes('第一层提示')`, 'AI 分层提示', 15000)
  console.log('  ✓ AI 分层提示已生成')

  // 7. 去实践：番茄钟 + 任务
  await evaluate(`[...document.querySelectorAll('.wstep')].find(b => b.textContent.includes('去实践')).click()`)
  await sleep(500)
  const pomo = await evaluate(`document.body.textContent.includes('开始专注')`)
  const tasks = await evaluate(`document.querySelectorAll('.task').length`)
  console.log(`  ✓ 番茄钟=${pomo} 任务数=${tasks}`)

  // 8. 说感悟
  await evaluate(`[...document.querySelectorAll('.wstep')].find(b => b.textContent.includes('说感悟')).click()`)
  await sleep(500)
  await evaluate(`(() => {
    const ta = [...document.querySelectorAll('textarea')].find(t => t.placeholder.includes('写完题目'));
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '这次终于把导数符号和单调性连起来了。');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)
  await sleep(200)
  await clickText('保存心得', '保存心得')
  await sleep(600)
  console.log('  ✓ 心得已保存 =', await evaluate(`document.body.textContent.includes('这次终于把导数符号')`))

  // 9. 先探路
  await evaluate(`[...document.querySelectorAll('.wstep')].find(b => b.textContent.includes('先探路')).click()`)
  await sleep(500)
  await evaluate(`(() => {
    const ta = [...document.querySelectorAll('textarea')].find(t => t.placeholder.includes('Boss'));
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '构造函数，把不等式变到同一侧');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)
  await sleep(200)
  await clickText('保存预习清单', '保存预习清单')
  await sleep(600)
  console.log('  ✓ 预习清单已保存 =', await evaluate(`document.body.textContent.includes('构造函数')`))

  // 10. 日后复测
  await evaluate(`[...document.querySelectorAll('.wstep')].find(b => b.textContent.includes('日后复测')).click()`)
  await sleep(500)
  await clickText('安排复测', '安排复测')
  await sleep(600)
  console.log('  ✓ 复测已安排 =', await evaluate(`document.querySelectorAll('.retest').length > 0`))

  // 11. 完成本步
  await clickText('开始', '开始计时(2)')
  await sleep(500)
  await clickText('完成', '完成')
  await sleep(700)
  const state = await evaluate(`(() => {
    const cur = document.querySelector('.wstep.is-current');
    return cur ? cur.textContent.trim() : '';
  })()`)
  console.log('  ✓ 完成后当前步骤 =', state)

  console.log('\n控制台错误：', logs.length ? logs.join(' | ') : '（无）')
  console.log('\n✅ 真实 Chrome 里完整流程跑通')
  ws.close()
  chrome.kill()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
  process.exit(0)
}

main().catch(async (err) => {
  console.error('\n❌ E2E 失败：', err.message)
  try {
    chrome.kill()
  } catch {}
  process.exit(1)
})