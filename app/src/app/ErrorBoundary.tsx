import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: string
}

/**
 * 顶层错误边界。
 * 没有它的话，任意一个渲染异常都会留下一个空白页，
 * 用户既看不到发生了什么，也没法继续用。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('页面渲染出错', error, info)
    this.setState({ info: (info.componentStack ?? '').slice(0, 1200) })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="app">
        <div className="boot">
          <div className="boot__mark">出错了</div>
          <div className="errbox">
            <div className="errbox__msg">{this.state.error.message}</div>
            {this.state.info && <pre className="errbox__stack">{this.state.info}</pre>}
            <div className="row-btns" style={{ justifyContent: 'center' }}>
              <button className="btn btn--primary" onClick={() => location.reload()}>
                重新加载
              </button>
              <button className="btn" onClick={() => (location.hash = '#/')}>
                回到书架
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
