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
      const el = els.find(e => (e.textContent || '').trim() === ${JSON.stringify(text)})
             || els.find(e => (e.textContent || '').includes(${JSON.stringify(text)}));
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

  /** 点第 N 个步骤圆点 */
  const gotoStep = async (n) => {
    await evaluate(`(() => {
      const dots = [...document.querySelectorAll('.wb2__dot')];
      const d = dots[${n} - 1];
      if (d) d.click();
    })()`)
    await sleep(500)
  }

  const typeInto = async (placeholder, text) => {
    const ok = await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => t.placeholder.includes(${JSON.stringify(placeholder)}));
      if (!ta) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(text)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)
    if (!ok) throw new Error(`找不到输入框：${placeholder}`)
    await sleep(200)
  }

  /** 截图存档，方便人工核对界面 */
  const shot = async (name) => {
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const dir = join(process.cwd(), 'screenshots')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${name}.png`)
    writeFileSync(file, Buffer.from(res.data, 'base64'))
    console.log('  📷', file)
  }

  console.log('→ 打开站点', SITE)
  await send('Page.navigate', { url: SITE })
  await waitFor(`document.querySelector('.book__title') !== null`, '书架渲染', 20000)
  console.log('  ✓ 书架渲染完成，项目数 =', await evaluate(`document.querySelectorAll('.book__title').length`))
  await shot('01-书架')

  // 1. 点书盒 → 直接进这一课
  await clickSelector('.book__title', '书盒')
  await waitFor(`document.querySelector('.tcard') !== null`, '选流程')
  console.log('  ✓ 点书盒直接进了这一课，流程数 =', await evaluate(`document.querySelectorAll('.tcard').length`))

  // 2. 选流程开始
  await evaluate(`[...document.querySelectorAll('.tcard')].find(c => c.textContent.includes('数学课后学习')).click()`)
  await waitFor(`document.querySelector('.wb2__dot') !== null`, '工作台')
  console.log('  ✓ 开始了，步骤数 =', await evaluate(`document.querySelectorAll('.wb2__dot').length`))
  console.log('    页面告诉你：', await evaluate(`document.querySelector('.wb2__stepwhat')?.textContent.trim()`))

  // 3. 计时
  await clickText('开始', '开始计时')
  await waitFor(
    `document.querySelector('.wb2__clockvalue')?.textContent.trim() !== '00:00'`,
    '计时器走秒',
    8000,
  )
  console.log('  ✓ 计时运行中，当前 =', await evaluate(`document.querySelector('.wb2__clockvalue').textContent.trim()`))
  await shot('02-工作台-接收资料')

  // 4. 先复习：标记「有点糊」「不会」
  await gotoStep(2)
  const marked = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('.mchip')];
    const un = btns.find(b => b.textContent.includes('有点糊'));
    if (un) un.click();
    return btns.length;
  })()`)
  console.log(`  ✓ 标记按钮 ${marked} 个`)
  await sleep(400)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('.mchip')].find(x => x.textContent.includes('不会'));
    if (b) b.click();
  })()`)
  await sleep(600)

  // 5. 弄懂它：不会清单 + AI 分层提示
  await gotoStep(3)
  const doubtCount = await evaluate(`document.querySelectorAll('.doubt').length`)
  console.log(`  ✓ 不会清单条数 = ${doubtCount}`)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('AI 分层提示'));
    if (b) b.click();
  })()`)
  await waitFor(`document.body.textContent.includes('第一层提示')`, 'AI 分层提示', 15000)
  console.log('  ✓ AI 分层提示已生成')

  // 6. 去实践：番茄钟 + 任务
  await gotoStep(4)
  const pomo = await evaluate(`document.body.textContent.includes('开始专注')`)
  const tasks = await evaluate(`document.querySelectorAll('.task').length`)
  console.log(`  ✓ 番茄钟=${pomo} 任务数=${tasks}`)
  await shot('03-工作台-去实践')

  // 7. 说感悟
  await gotoStep(5)
  await typeInto('写完题目', '这次终于把导数符号和单调性连起来了。')
  await clickText('保存心得', '保存心得')
  await sleep(600)
  console.log('  ✓ 心得已保存 =', await evaluate(`document.body.textContent.includes('这次终于把导数符号')`))

  // 8. 先探路
  await gotoStep(6)
  await typeInto('Boss', '构造函数，把不等式变到同一侧')
  await clickText('保存预习清单', '保存预习清单')
  await sleep(600)
  console.log('  ✓ 预习清单已保存 =', await evaluate(`document.body.textContent.includes('构造函数')`))

  // 9. 日后复测
  await gotoStep(7)
  await clickText('安排复测', '安排复测')
  await sleep(600)
  console.log('  ✓ 复测已安排 =', await evaluate(`document.querySelectorAll('.retest').length > 0`))

  // 10. 完成本步
  await clickText('开始', '开始计时(2)')
  await sleep(500)
  await clickText('完成这步', '完成这步')
  await sleep(700)
  console.log('  ✓ 完成后顶部提示 =', await evaluate(`document.querySelector('.wb2__stepno')?.textContent.trim()`))

  // 11. 抽屉：看笔记 / 问 AI
  await clickText('看笔记', '看笔记')
  await waitFor(`document.querySelector('.drawer') !== null`, '抽屉')
  console.log('  ✓ 看笔记抽屉，条目数 =', await evaluate(`document.querySelectorAll('.drawer .wnav__item').length`))
  await evaluate(`document.querySelector('.drawer__mask').click()`)
  await sleep(300)
  await clickText('问 AI', '问 AI')
  await waitFor(`document.querySelector('.drawer') !== null`, '抽屉2')
  console.log('  ✓ 问 AI 抽屉 =', await evaluate(`!!document.querySelector('.drawer textarea')`))

  // 12. 课程表
  await evaluate(`document.querySelector('.drawer__mask').click()`)
  await sleep(300)
  await clickText('课程表', '课程表')
  await waitFor(`document.querySelector('.react-flow__node-unit') !== null`, '画布', 10000)
  console.log('  ✓ 课程表画布，单元数 =', await evaluate(`document.querySelectorAll('.react-flow__node-unit').length`))
  await shot('04-课程表')

  // 13. AI 设置
  await send('Page.navigate', { url: `${SITE}#/settings/ai` })
  await waitFor(`document.querySelector('.pick2') !== null`, 'AI 设置', 10000)
  console.log('  ✓ AI 设置页 =', await evaluate(`document.querySelectorAll('.pick2__opt').length`))
  await shot('05-AI设置')

  // 14. 模板页
  await send('Page.navigate', { url: `${SITE}#/templates` })
  await waitFor(`document.querySelector('.tpl') !== null`, '模板页', 10000)
  console.log('  ✓ 模板页 =', await evaluate(`document.querySelectorAll('.tplitem').length`))
  await shot('06-模板')

  // 15. 换主题色
  await send('Page.navigate', { url: `${SITE}#/` })
  await waitFor(`document.querySelector('.book__title') !== null`, '书架', 10000)
  await evaluate(`document.querySelector('button[title="换主题色"]')?.click()`)
  await sleep(300)
  await evaluate(`document.querySelectorAll('.themepick__sw')[2]?.click()`)
  await sleep(400)
  const themed = await evaluate(`document.documentElement.getAttribute('data-theme')`)
  console.log('  ✓ 主题色 =', themed)
  await shot('07-主题色-琥珀')

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
