import { useState } from 'react'

export default function SideCalculator() {
  const [display, setDisplay] = useState('0')
  const [prev,    setPrev]    = useState(null)
  const [op,      setOp]      = useState(null)
  const [reset,   setReset]   = useState(false)

  const press = (val) => {
    if (reset) { setDisplay(String(val)); setReset(false); return }
    if (display === '0' && val !== '.') setDisplay(String(val))
    else if (val === '.' && display.includes('.')) return
    else setDisplay(display + val)
  }

  const operate = (nextOp) => {
    const cur = parseFloat(display)
    if (op && prev !== null) {
      const result = calc(prev, cur, op)
      setDisplay(fmt(result))
      setPrev(result)
    } else {
      setPrev(cur)
    }
    setOp(nextOp)
    setReset(true)
  }

  const calc = (a, b, o) => {
    if (o === '+') return a + b
    if (o === '-') return a - b
    if (o === '×') return a * b
    if (o === '÷') return b === 0 ? 0 : a / b
    return b
  }

  const fmt = (n) => {
    if (isNaN(n)) return '오류'
    const s = parseFloat(n.toFixed(8)).toString()
    return s.length > 12 ? parseFloat(n.toFixed(4)).toString() : s
  }

  const equal = () => {
    if (!op || prev === null) return
    const result = calc(prev, parseFloat(display), op)
    setDisplay(fmt(result))
    setPrev(null); setOp(null); setReset(true)
  }

  const clear = () => { setDisplay('0'); setPrev(null); setOp(null); setReset(false) }
  const sign  = () => setDisplay(fmt(parseFloat(display) * -1))
  const pct   = () => setDisplay(fmt(parseFloat(display) / 100))

  const BTN = [
    ['AC','±','%','÷'],
    ['7','8','9','×'],
    ['4','5','6','-'],
    ['1','2','3','+'],
    ['0','.',  '='],
  ]

  return (
    <div style={S.wrap}>
      <div style={S.display}>
        <div style={S.expr}>{op ? `${prev} ${op}` : ''}</div>
        <div style={{...S.num, fontSize: display.length > 9 ? 14 : display.length > 6 ? 17 : 20}}>
          {Number(display).toLocaleString('ko-KR', {maximumFractionDigits: 8})}
        </div>
      </div>
      {BTN.map((row, ri) => (
        <div key={ri} style={S.row}>
          {row.map((b) => {
            const isOp   = ['÷','×','-','+','='].includes(b)
            const isGray = ['AC','±','%'].includes(b)
            const isZero = b === '0'
            return (
              <button key={b}
                style={{
                  ...S.btn,
                  flex: isZero ? 2 : 1,
                  background: isOp ? (b===op?'#fff':'#f97316') : isGray ? '#475569' : '#1e293b',
                  color: isOp && b===op ? '#f97316' : '#fff',
                  textAlign: isZero ? 'left' : 'center',
                  paddingLeft: isZero ? 12 : 0,
                }}
                onClick={() => {
                  if (b === 'AC') clear()
                  else if (b === '±') sign()
                  else if (b === '%') pct()
                  else if (b === '=') equal()
                  else if (isOp) operate(b)
                  else press(b)
                }}>
                {b}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const S = {
  wrap:    {padding:'8px',borderTop:'1px solid #1e293b'},
  display: {background:'#0f172a',borderRadius:8,padding:'8px 10px',marginBottom:6,minHeight:52},
  expr:    {fontSize:10,color:'#475569',textAlign:'right',minHeight:14},
  num:     {color:'#e2e8f0',textAlign:'right',fontWeight:700,fontVariantNumeric:'tabular-nums'},
  row:     {display:'flex',gap:4,marginBottom:4},
  btn:     {border:'none',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:14,height:32,transition:'opacity 0.1s'},
}
