import { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { THEMES, DEFAULTS, renderMermaid, renderMermaidAscii } from 'beautiful-mermaid'

const THEME_NAMES = Object.keys(THEMES)
const MONO_THEME = { bg: DEFAULTS.bg, fg: DEFAULTS.fg }

const DEFAULT_DIAGRAM = `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> E[Check logs]
    E --> F[Fix issue]
    F --> B
    C --> G[Ship it!]`

type OutputMode = 'svg' | 'ascii' | 'unicode'

export default function App() {
  const [code, setCode] = useState(() => {
    return localStorage.getItem('bm-editor-code') || DEFAULT_DIAGRAM
  })
  const [output, setOutput] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<OutputMode>('svg')
  const [theme, setTheme] = useState('tokyo-night')
  const [status, setStatus] = useState<'ok' | 'error' | 'rendering'>('ok')
  const [leftWidth, setLeftWidth] = useState(50)
  const [transparent, setTransparent] = useState(false)
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Save code to localStorage
  useEffect(() => {
    localStorage.setItem('bm-editor-code', code)
  }, [code])

  const render = useCallback(async (source: string) => {
    setStatus('rendering')
    setError(null)

    try {
      const themeColors = THEMES[theme as keyof typeof THEMES] || MONO_THEME

      if (mode === 'svg') {
        const svg = await renderMermaid(source, {
          ...themeColors,
          transparent,
        })
        setOutput(svg)
      } else {
        const ascii = renderMermaidAscii(source, {
          useAscii: mode === 'ascii',
        })
        setOutput(ascii)
      }
      setStatus('ok')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStatus('error')
    }
  }, [mode, theme, transparent])

  // Debounced rendering
  useEffect(() => {
    clearTimeout(renderTimeoutRef.current)
    renderTimeoutRef.current = setTimeout(() => {
      render(code)
    }, 300)
    return () => clearTimeout(renderTimeoutRef.current)
  }, [code, render])

  // Resize handling
  const handleMouseDown = useCallback(() => {
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setLeftWidth(Math.max(20, Math.min(80, pct)))
    }
    const handleMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const copyOutput = () => {
    navigator.clipboard.writeText(output)
  }

  const downloadOutput = () => {
    const ext = mode === 'svg' ? 'svg' : 'txt'
    const mimeType = mode === 'svg' ? 'image/svg+xml' : 'text/plain'
    const blob = new Blob([output], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diagram.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const currentTheme = THEMES[theme as keyof typeof THEMES] || MONO_THEME
  const isLight = isLightColor(currentTheme.bg)

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">Beautiful Mermaid Editor</span>
        <div className="header-controls">
          <label>Output:</label>
          <select value={mode} onChange={e => setMode(e.target.value as OutputMode)}>
            <option value="svg">SVG</option>
            <option value="unicode">Unicode</option>
            <option value="ascii">ASCII</option>
          </select>

          {mode === 'svg' && (
            <>
              <label>Theme:</label>
              <select value={theme} onChange={e => setTheme(e.target.value)}>
                {THEME_NAMES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <button
                className={transparent ? 'active' : ''}
                onClick={() => setTransparent(!transparent)}
              >
                Transparent
              </button>
            </>
          )}
        </div>
      </header>

      <div className="main" ref={containerRef}>
        <div className="editor-pane" style={{ width: `${leftWidth}%` }}>
          <div className="pane-header">
            <span>Editor</span>
          </div>
          <div className="editor-container">
            <Editor
              defaultLanguage="markdown"
              value={code}
              onChange={v => setCode(v || '')}
              theme={isLight ? 'light' : 'vs-dark'}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                padding: { top: 12 },
                fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                fontLigatures: true,
                renderWhitespace: 'none',
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        <div className="resize-handle" onMouseDown={handleMouseDown} />

        <div className="preview-pane" style={{ width: `${100 - leftWidth}%` }}>
          <div className="pane-header">
            <span>Preview {mode !== 'svg' ? `(${mode})` : ''}</span>
            <div className="pane-actions">
              <button onClick={copyOutput} title="Copy to clipboard">Copy</button>
              <button onClick={downloadOutput} title="Download">Download</button>
            </div>
          </div>
          <div className={`preview-container ${mode !== 'svg' ? 'ascii' : ''}`}>
            {error ? (
              <div className="error-message">{error}</div>
            ) : mode === 'svg' ? (
              <div dangerouslySetInnerHTML={{ __html: output }} />
            ) : (
              <pre>{output}</pre>
            )}
          </div>
        </div>
      </div>

      <div className="status-bar">
        <span>
          <span className={`status-indicator ${status}`} />
          {status === 'rendering' ? 'Rendering...' : status === 'error' ? 'Error' : 'Ready'}
        </span>
        <span>beautiful-mermaid</span>
      </div>
    </div>
  )
}

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}
