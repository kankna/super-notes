#!/usr/bin/env node
/**
 * 通过 GitHub Git Data API 推送代码。
 *
 * 为什么要自己写：当前网络环境里 github.com:443 被屏蔽，git push 走 HTTPS 会超时，
 * 但 api.github.com 可达。Git Data API 走的是 api.github.com，因此用它完成
 * blob → tree → commit → ref 这一整套推送，仓库内容和普通 git push 完全一致。
 *
 * 用法：
 *   node tools/push-via-api.mjs                # 推送当前分支（默认 main）
 *   node tools/push-via-api.mjs --branch dev
 *
 * 依赖 gh CLI 已登录（token 从 `gh auth token` 读取，不落盘）。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const branchIdx = args.indexOf('--branch')
const BRANCH = branchIdx >= 0 ? args[branchIdx + 1] : 'main'
const REPO = process.env.GH_REPO || 'kankna/super-notes'
const API = `https://api.github.com/repos/${REPO}`

const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()

async function api(path, method = 'GET', body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'super-notes-push-script',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 800)}`)
  }
  return text ? JSON.parse(text) : null
}

/** 网络偶发失败时重试几次，避免整次推送白跑 */
async function withRetry(fn, tries = 4) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const retryable = !String(err).includes('→ 4') && !String(err).includes('→ 422')
      if (!retryable) throw err
      await sleep(1500 * (i + 1))
    }
  }
  throw lastErr
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function git(argsList) {
  return execFileSync('git', argsList, { encoding: 'utf8' }).trim()
}

// -z 用 NUL 分隔，避免中文文件名被 git 转义成 "…\344…" 形式
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
console.log(`准备推送 ${files.length} 个文件到 ${REPO}@${BRANCH}`)

const treeEntries = []
for (const path of files) {
  const abs = join(process.cwd(), path)
  const size = statSync(abs).size
  if (size > 40 * 1024 * 1024) throw new Error(`文件过大，跳过：${path}`)
  const content = readFileSync(abs).toString('base64')
  const blob = await withRetry(() => api('/git/blobs', 'POST', { content, encoding: 'base64' }))
  treeEntries.push({ path, mode: '100644', type: 'blob', sha: blob.sha })
  process.stdout.write(`  blob ${path} (${(size / 1024).toFixed(1)} KB)\n`)
}

const tree = await withRetry(() => api('/git/trees', 'POST', { tree: treeEntries }))
console.log(`tree ${tree.sha}`)

let parents = []
try {
  const ref = await withRetry(() => api(`/git/ref/heads/${BRANCH}`))
  parents = [ref.object.sha]
  console.log(`已有分支 HEAD ${parents[0]}`)
} catch {
  console.log('远端尚无该分支，将创建首次提交')
}

const message = git(['log', '-1', '--pretty=%s']) || 'update'
const commit = await withRetry(() =>
  api('/git/commits', 'POST', {
    message,
    tree: tree.sha,
    parents,
  }),
)
console.log(`commit ${commit.sha}`)

try {
  await withRetry(() => api(`/git/refs/heads/${BRANCH}`, 'POST', { ref: `refs/heads/${BRANCH}`, sha: commit.sha }))
} catch {
  await withRetry(() => api(`/git/refs/heads/${BRANCH}`, 'PATCH', { sha: commit.sha, force: false }))
}

console.log(`\n✅ 已推送：https://github.com/${REPO}/tree/${BRANCH}`)
