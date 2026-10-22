import { useMemo } from 'react'
import MarkdownIt from 'markdown-it'
import katexPlugin from 'markdown-it-katex'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

md.use(katexPlugin, {
  throwOnError: false,
  errorColor: '#d9644c',
  strict: false,
})

/** 渲染 Markdown + LaTeX。公式保留源码语义，渲染失败时显示红色提示而不是崩掉。 */
export function useMarkdown(source: string): string {
  return useMemo(() => {
    try {
      const html = md.render(source ?? '')
      return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] })
    } catch {
      return `<p>内容渲染失败：${(source ?? '').slice(0, 200)}</p>`
    }
  }, [source])
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMarkdown(source)
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
