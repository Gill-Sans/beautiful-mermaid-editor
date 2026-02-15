import { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { THEMES, DEFAULTS, renderMermaid, renderMermaidAscii } from 'beautiful-mermaid'

const THEME_NAMES = Object.keys(THEMES) as (keyof typeof THEMES)[]
const MONO_THEME = { bg: DEFAULTS.bg, fg: DEFAULTS.fg }

const SAMPLE_DIAGRAMS: Record<string, string> = {
  Flowchart: `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> E[Check logs]
    E --> F[Fix the bug]
    F --> B
    C --> G[Ship it!]`,
  Sequence: `sequenceDiagram
    participant C as Client
    participant S as Server
    participant D as Database
    C->>S: POST /api/data
    S->>S: Validate request
    S->>D: INSERT query
    D-->>S: Success
    S-->>C: 201 Created
    C->>S: GET /api/data
    S->>D: SELECT query
    D-->>S: Results
    S-->>C: 200 OK`,
  State: `stateDiagram-v2
    [*] --> Idle
    Idle --> Fetching: request
    Fetching --> Success: resolve
    Fetching --> Error: reject
    Success --> Idle: reset
    Error --> Fetching: retry
    Error --> Idle: dismiss
    Success --> [*]`,
  Class: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }
    class Dog {
        +String breed
        +fetch() void
        +bark() void
    }
    class Cat {
        +bool indoor
        +purr() void
        +scratch() void
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
  ER: `erDiagram
    USER ||--o{ POST : creates
    USER ||--o{ COMMENT : writes
    POST ||--|{ COMMENT : has
    POST ||--o{ TAG : tagged
    USER {
        int id PK
        string name
        string email
    }
    POST {
        int id PK
        string title
        text content
        date created
    }`,
}

type OutputMode = 'svg' | 'ascii' | 'unicode'

function isLightTheme(bg: string): boolean {
  const c = bg.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

function getThemeColors(theme: string) {
  const t = THEMES[theme as keyof typeof THEMES] || MONO_THEME
  const isDark = !isLightTheme(t.bg)
  const accent = ('accent' in t ? t.accent : undefined) || (isDark ? '#7aa2f7' : '#0969da')
  return {
    ...t,
    isDark,
    accent,
    editorBg: isDark ? '#0f0f14' : '#fafafa',
    editorFg: isDark ? '#c8cfd8' : '#333',
    editorBorder: isDark ? '#2a2a35' : '#e0e0e0',
    uiBg: isDark ? '#16161e' : '#f5f5f5',
    uiFg: isDark ? '#9aa0b0' : '#666',
    uiFgActive: isDark ? '#e0e4f0' : '#111',
    headerBg: isDark ? '#12121a' : '#fff',
    surface: ('surface' in t ? t.surface : undefined) || (isDark ? '#2a2a3a' : '#f0f0f5'),
  }
}

export default function App() {
  const [code, setCode] = useState(() => {
    return localStorage.getItem('bm-editor-code') || SAMPLE_DIAGRAMS.Flowchart
  })
  const [output, setOutput] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<OutputMode>('svg')
  const [theme, setTheme] = useState('tokyo-night')
  const [status, setStatus] = useState<'ok' | 'error' | 'rendering'>('ok')
  const [leftWidth, setLeftWidth] = useState(42)
  const [transparent, setTransparent] = useState(false)
  const [showThemes, setShowThemes] = useState(false)
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const tc = getThemeColors(theme)
  const FONT = "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace"

  useEffect(() => {
    localStorage.setItem('bm-editor-code', code)
  }, [code])

  const render = useCallback(async (source: string) => {
    setStatus('rendering')
    setError(null)
    try {
      const themeColors = THEMES[theme as keyof typeof THEMES] || MONO_THEME
      if (mode === 'svg') {
        const svg = await renderMermaid(source, { ...themeColors, transparent })
        setOutput(svg)
      } else {
        const ascii = renderMermaidAscii(source, { useAscii: mode === 'ascii' })
        setOutput(ascii)
      }
      setStatus('ok')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [mode, theme, transparent])

  useEffect(() => {
    clearTimeout(renderTimeoutRef.current)
    renderTimeoutRef.current = setTimeout(() => render(code), 300)
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

  const copyOutput = () => { navigator.clipboard.writeText(output) }

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

  const modeLabels: Record<OutputMode, string> = { svg: 'SVG', unicode: 'Unicode', ascii: 'ASCII' }

  return (
    <div style={{
      height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column',
      background: tc.uiBg, color: tc.editorFg, fontFamily: FONT, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: `1px solid ${tc.editorBorder}`,
        background: tc.headerBg, flexShrink: 0, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tc.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
            <line x1="12" y1="22" x2="12" y2="15.5" />
            <polyline points="22 8.5 12 15.5 2 8.5" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: 14, color: tc.uiFgActive, letterSpacing: '-0.02em' }}>
            Mermaid Editor
          </span>
          <span style={{ fontSize: 11, color: tc.uiFg, opacity: 0.6, marginLeft: 2 }}>
            beautiful-mermaid
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Sample diagram buttons */}
          {Object.keys(SAMPLE_DIAGRAMS).map(name => (
            <button
              key={name}
              onClick={() => setCode(SAMPLE_DIAGRAMS[name])}
              style={{
                background: 'none', border: 'none', color: tc.uiFg, fontSize: 11,
                cursor: 'pointer', padding: '4px 8px', borderRadius: 4,
                transition: 'all 0.15s', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = tc.editorBorder; (e.target as HTMLElement).style.color = tc.uiFgActive }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'none'; (e.target as HTMLElement).style.color = tc.uiFg }}
            >
              {name}
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: tc.editorBorder, margin: '0 4px' }} />

          {/* Transparent toggle */}
          {mode === 'svg' && (
            <button
              onClick={() => setTransparent(!transparent)}
              style={{
                background: transparent ? tc.accent : 'none',
                border: `1px solid ${transparent ? tc.accent : tc.editorBorder}`,
                color: transparent ? '#fff' : tc.uiFg, fontSize: 10,
                cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
                fontFamily: 'inherit', fontWeight: transparent ? 600 : 400,
              }}
            >
              Transparent
            </button>
          )}

          {/* Theme dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowThemes(!showThemes)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: tc.isDark ? '#1e1e28' : '#eee',
                border: `1px solid ${tc.editorBorder}`, color: tc.uiFgActive,
                fontSize: 11, cursor: 'pointer', padding: '5px 10px',
                borderRadius: 6, fontFamily: 'inherit',
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg, ${tc.bg} 50%, ${tc.accent} 50%)`,
                border: `1px solid ${tc.editorBorder}`,
              }} />
              {theme}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={tc.uiFg} strokeWidth="1.5">
                <path d={showThemes ? 'M2 6L5 3L8 6' : 'M2 4L5 7L8 4'} />
              </svg>
            </button>

            {showThemes && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: tc.isDark ? '#1a1a24' : '#fff',
                border: `1px solid ${tc.editorBorder}`, borderRadius: 8,
                padding: 6, zIndex: 100, width: 220, maxHeight: 320, overflowY: 'auto',
                boxShadow: tc.isDark ? '0 12px 40px rgba(0,0,0,0.6)' : '0 12px 40px rgba(0,0,0,0.12)',
              }}>
                {THEME_NAMES.map(name => {
                  const th = THEMES[name]
                  const thAccent = 'accent' in th ? th.accent : th.fg
                  const thIsDark = !isLightTheme(th.bg)
                  return (
                    <button
                      key={name}
                      onClick={() => { setTheme(name); setShowThemes(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', padding: '7px 10px', border: 'none', borderRadius: 5,
                        background: name === theme ? (tc.isDark ? '#2a2a3a' : '#e8e8f0') : 'transparent',
                        color: name === theme ? tc.uiFgActive : tc.uiFg,
                        fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      }}
                    >
                      <span style={{
                        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                        background: `linear-gradient(135deg, ${th.bg} 50%, ${thAccent} 50%)`,
                        border: `1px solid ${tc.isDark ? '#333' : '#ddd'}`,
                      }} />
                      {name}
                      <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5 }}>
                        {thIsDark ? 'dark' : 'light'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main */}
      <div ref={containerRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Editor pane */}
        <div style={{
          width: `${leftWidth}%`, display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${tc.editorBorder}`, flexShrink: 0,
        }}>
          <div style={{
            padding: '8px 14px', fontSize: 10, color: tc.uiFg,
            textTransform: 'uppercase', letterSpacing: '0.08em',
            borderBottom: `1px solid ${tc.editorBorder}`, background: tc.headerBg,
          }}>
            Source
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Editor
              defaultLanguage="markdown"
              value={code}
              onChange={v => setCode(v || '')}
              theme={tc.isDark ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineHeight: 1.7 * 13,
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                fontFamily: FONT,
                fontLigatures: true,
                renderWhitespace: 'none',
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            width: 3, cursor: 'col-resize', flexShrink: 0,
            background: tc.editorBorder, transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.target as HTMLElement).style.background = tc.accent}
          onMouseLeave={e => { if (!isDragging.current) (e.target as HTMLElement).style.background = tc.editorBorder }}
        />

        {/* Preview pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 14px', borderBottom: `1px solid ${tc.editorBorder}`,
            background: tc.headerBg,
          }}>
            <div style={{ display: 'flex', gap: 0 }}>
              {(['svg', 'unicode', 'ascii'] as OutputMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    background: 'none', border: 'none', fontSize: 10,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: mode === m ? tc.uiFgActive : tc.uiFg,
                    cursor: 'pointer', padding: '4px 10px',
                    borderBottom: mode === m ? `2px solid ${tc.accent}` : '2px solid transparent',
                    fontFamily: 'inherit', transition: 'all 0.15s',
                  }}
                >
                  {modeLabels[m]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={copyOutput}
                disabled={!output}
                style={{
                  background: 'none', border: `1px solid ${tc.editorBorder}`,
                  color: tc.uiFg, fontSize: 10, cursor: output ? 'pointer' : 'default',
                  padding: '3px 8px', borderRadius: 4, fontFamily: 'inherit',
                  opacity: output ? 1 : 0.4,
                }}
              >
                Copy
              </button>
              <button
                onClick={downloadOutput}
                disabled={!output}
                style={{
                  background: tc.accent, border: 'none', color: '#fff', fontSize: 10,
                  cursor: output ? 'pointer' : 'default', padding: '3px 10px',
                  borderRadius: 4, fontFamily: 'inherit', fontWeight: 600,
                  opacity: output ? 1 : 0.4,
                }}
              >
                Download
              </button>
            </div>
          </div>

          <div style={{
            flex: 1, overflow: 'auto',
            background: mode === 'svg' ? tc.bg : tc.editorBg,
            display: 'flex', alignItems: mode !== 'svg' ? 'flex-start' : 'center',
            justifyContent: mode !== 'svg' ? 'flex-start' : 'center',
            padding: 24,
          }}>
            {error ? (
              <div style={{
                color: '#f87171', fontSize: 12, maxWidth: 400, textAlign: 'center',
                lineHeight: 1.6, padding: 20,
                background: tc.isDark ? 'rgba(248,113,113,0.06)' : 'rgba(248,113,113,0.08)',
                borderRadius: 8, border: '1px solid rgba(248,113,113,0.15)',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Parse Error</div>
                <div style={{ opacity: 0.8 }}>{error.split('\n').slice(0, 3).join('\n')}</div>
              </div>
            ) : mode === 'svg' ? (
              <div
                dangerouslySetInnerHTML={{ __html: output }}
                style={{ maxWidth: '100%', maxHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              />
            ) : (
              <pre style={{
                fontSize: 13, color: tc.editorFg, whiteSpace: 'pre', lineHeight: 1.4,
                fontFamily: FONT, margin: 0, padding: 16,
                background: tc.isDark ? '#12121a' : '#fff',
                borderRadius: 8, border: `1px solid ${tc.editorBorder}`,
                overflow: 'auto', maxWidth: '100%', maxHeight: '100%',
              }}>
                {output || 'No output yet'}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 14px', borderTop: `1px solid ${tc.editorBorder}`,
        background: tc.headerBg, fontSize: 10, color: tc.uiFg, flexShrink: 0,
      }}>
        <span>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            marginRight: 6, verticalAlign: 'middle',
            background: status === 'ok' ? '#22c55e' : status === 'error' ? '#f87171' : '#eab308',
          }} />
          {code.split('\n').length} lines
        </span>
        <span style={{ opacity: 0.5 }}>
          {tc.isDark ? 'dark' : 'light'} theme · {theme}
        </span>
      </div>

      {/* Click outside to close theme picker */}
      {showThemes && (
        <div onClick={() => setShowThemes(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
      )}
    </div>
  )
}
