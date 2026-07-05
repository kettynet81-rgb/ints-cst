import { useState, useMemo } from 'react'
import { ITEMS } from '../data/items'

export default function PrintModal({ transactions, stockMap, onClose }) {
  const [type,     setType]     = useState('stock')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [baseQty,  setBaseQty]  = useState('112')

  const base = Number(baseQty) || 0

  const pd = (v) => {
    const y = new Date().getFullYear()
    v = (v||'').trim().replace(/\./g,'/')
    const s = v.match(/^(\d{1,2})\/(\d{1,2})$/)
    if (s) return `${y}-${s[1].padStart(2,'0')}-${s[2].padStart(2,'0')}`
    const m = v.match(/^(\d{2})(\d{2})$/)
    if (m) return `${y}-${m[1]}-${m[2]}`
    return v
  }

  const from = pd(dateFrom)
  const to   = pd(dateTo)

  const stockData = useMemo(() => ITEMS.map(item => {
    const stock = stockMap[item.code] || 0
    const assemblable = Math.floor(stock / item.needPerSet)
    const surplus = stock - item.needPerSet * base
    const status = stock === 0 ? '재고없음' : assemblable < 50 ? '발주필요' : '정상'
    return { ...item, stock, assemblable, surplus, status }
  }), [stockMap, base])

  const historyData = useMemo(() => transactions
    .filter(t => t.type==='입고'||t.type==='출고')
    .filter(t => !dateFrom || t.date >= from)
    .filter(t => !dateTo   || t.date <= to)
    .sort((a,b) => b.date.localeCompare(a.date))
  , [transactions, from, to])

  const shipData = useMemo(() => transactions
    .filter(t => t.type==='출하계획' && t.isHeader)
    .filter(t => !dateFrom || t.date >= from)
    .filter(t => !dateTo   || t.date <= to)
    .sort((a,b) => a.date.localeCompare(b.date))
  , [transactions, from, to])

  const doPrint = () => {
    const now = new Date().toLocaleDateString('ko-KR')
    let rows = ''
    let headers = ''
    let title = ''

    if (type === 'stock') {
      title = `부품 재고 현황 (기준 ${base}SET) — ${now}`
      headers = `<tr><th>코드</th><th>품목명</th><th>필요수량</th><th>현재고</th><th>조립가능</th><th>과부족(${base}SET)</th><th>상태</th></tr>`
      rows = stockData.map(d => `
        <tr class="${d.status==='재고없음'?'bg-red':d.status==='발주필요'?'bg-yellow':''}">
          <td class="c">${d.code}</td>
          <td>${d.name}</td>
          <td class="c">${d.needPerSet}</td>
          <td class="r b">${d.stock.toLocaleString()}</td>
          <td class="r ${d.assemblable<50?'t-red':''}">${d.assemblable.toLocaleString()}</td>
          <td class="r ${d.surplus<0?'t-red':'t-green'}">${d.surplus>=0?'+':''}${d.surplus.toLocaleString()}</td>
          <td class="c ${d.status==='재고없음'?'t-red':d.status==='발주필요'?'t-orange':'t-green'}">${d.status}</td>
        </tr>`).join('')

    } else if (type === 'history') {
      title = `입출고 이력 (${dateFrom||'전체'} ~ ${dateTo||'전체'}) — ${now} · ${historyData.length}건`
      headers = `<tr><th>날짜</th><th>구분</th><th>코드</th><th>품목명</th><th>수량(EA)</th><th>메모</th></tr>`
      rows = historyData.map(t => `
        <tr>
          <td class="c">${t.date}</td>
          <td class="c ${t.type==='입고'?'t-blue':'t-red'}">${t.type}</td>
          <td class="c b">${t.itemCode}</td>
          <td>${t.itemName}</td>
          <td class="r b">${t.quantity.toLocaleString()}</td>
          <td class="gray">${t.memo||''}</td>
        </tr>`).join('')

    } else {
      title = `출하 계획 (${dateFrom||'전체'} ~ ${dateTo||'전체'}) — ${now} · ${shipData.length}건`
      headers = `<tr><th>출하일</th><th>SET 수량</th><th>상태</th><th>메모</th></tr>`
      rows = shipData.map(t => `
        <tr>
          <td class="c b">${t.date}</td>
          <td class="r" style="font-size:15px"><b>${(t.setQty||0).toLocaleString()} SET</b></td>
          <td class="c ${t.status==='confirmed'?'t-green':'t-blue'}">${t.status==='confirmed'?'확정':'계획'}</td>
          <td class="gray">${t.memo||''}</td>
        </tr>`).join('')
    }

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>INTS CST 재고관리</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'맑은 고딕',sans-serif;font-size:12px;padding:16px;color:#111}
.hd{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #1e293b}
.logo{font-size:20px;font-weight:900;color:#1e40af;letter-spacing:1px}
.co{font-size:10px;color:#666}
h2{font-size:14px;font-weight:800;color:#1e293b}
table{width:100%;border-collapse:collapse}
th{background:#1e293b;color:#fff;padding:6px 8px;text-align:center;font-size:11px;font-weight:700}
td{padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px}
tr:nth-child(even){background:#f8fafc}
.bg-red{background:#fff5f5!important}
.bg-yellow{background:#fffdf0!important}
.c{text-align:center}.r{text-align:right}.b{font-weight:700}
.t-red{color:#dc2626;font-weight:700}
.t-green{color:#16a34a;font-weight:700}
.t-blue{color:#1e40af;font-weight:700}
.t-orange{color:#d97706;font-weight:700}
.gray{color:#666}
@media print{@page{margin:10mm}}
</style>
<style>
.print-bar{position:fixed;top:0;left:0;right:0;background:#1e293b;padding:10px 20px;display:flex;gap:10px;align-items:center;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
.btn-print{padding:8px 22px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit}
.btn-close{padding:8px 16px;background:#475569;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-family:inherit}
.tip{font-size:12px;color:#94a3b8}
body{padding-top:54px}
@media print{.print-bar{display:none}body{padding-top:0}}
</style>
</head><body>
<div class="print-bar">
  <button class="btn-print" onclick="window.print()">🖨 인쇄</button>
  <button class="btn-close" onclick="window.close()">✕ 닫기</button>
  <span class="tip">인쇄 버튼을 누르면 프린터 설정 창이 열립니다</span>
</div>
<div class="hd">
  <div><div class="logo">INTS</div><div class="co">㈜아이엔티에스 · C-CST 재고관리</div></div>
  <h2>${title}</h2>
</div>
<table><thead>${headers}</thead><tbody>${rows}</tbody></table>
</body></html>`

    const w = window.open('', '_blank', 'width=1050,height=780')
    if (!w) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.'); return }
    w.document.write(html)
    w.document.close()
    w.focus()
  }

  const cnt = type==='history' ? historyData.length : type==='shipment' ? shipData.length : null

  return (
    <div style={S.ov}>
      <div style={S.modal}>
        <div style={S.hd}>
          <div style={{fontSize:16,fontWeight:700,color:'#0f172a'}}>🖨 인쇄 설정</div>
          <button style={{background:'none',border:'none',fontSize:16,color:'#94a3b8',cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          <div style={S.sec}>
            <div style={S.lbl}>인쇄 항목</div>
            <div style={{display:'flex',gap:8}}>
              {[['stock','📊 재고 현황'],['history','📋 입출고 이력'],['shipment','📦 출하 계획']].map(([id,label])=>(
                <button key={id} style={type===id?S.tActive:S.tBtn} onClick={()=>setType(id)}>{label}</button>
              ))}
            </div>
          </div>
          {type==='stock' && (
            <div style={S.sec}>
              <div style={S.lbl}>기준 SET (과부족 계산용)</div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="number" value={baseQty} onChange={e=>setBaseQty(e.target.value)}
                  style={{...S.inp,width:100}} />
                <span style={{fontSize:13,color:'#64748b'}}>SET</span>
              </div>
            </div>
          )}
          {(type==='history'||type==='shipment') && (
            <div style={S.sec}>
              <div style={S.lbl}>날짜 범위</div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="text" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  placeholder="예: 2026-07-01 또는 7/1" style={{...S.inp,width:180}}/>
                <span style={{color:'#94a3b8'}}>~</span>
                <input type="text" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  placeholder="예: 2026-07-31 또는 7/31" style={{...S.inp,width:180}}/>
              </div>
              {cnt !== null && <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>{cnt}건 해당</div>}
            </div>
          )}
        </div>
        <div style={S.ft}>
          <button style={S.cancel} onClick={onClose}>취소</button>
          <button style={S.print} onClick={doPrint}>🖨 인쇄 미리보기</button>
        </div>
      </div>
    </div>
  )
}

const S = {
  ov:     {position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000},
  modal:  {background:'#fff',borderRadius:12,width:520,boxShadow:'0 20px 60px rgba(0,0,0,0.25)',overflow:'hidden'},
  hd:     {padding:'16px 22px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'},
  body:   {padding:'20px 22px',display:'flex',flexDirection:'column',gap:18},
  ft:     {padding:'14px 22px',borderTop:'1px solid #f1f5f9',display:'flex',justifyContent:'flex-end',gap:8},
  sec:    {display:'flex',flexDirection:'column',gap:8},
  lbl:    {fontSize:11,fontWeight:700,color:'#64748b',letterSpacing:0.5,textTransform:'uppercase'},
  inp:    {padding:'8px 11px',border:'1.5px solid #e2e8f0',borderRadius:7,fontSize:13,fontFamily:'inherit',outline:'none',color:'#1e293b'},
  tBtn:   {padding:'8px 16px',border:'1.5px solid #e2e8f0',borderRadius:7,background:'#fff',color:'#475569',cursor:'pointer',fontFamily:'inherit',fontSize:13},
  tActive:{padding:'8px 16px',border:'1.5px solid #1e40af',borderRadius:7,background:'#eff6ff',color:'#1e40af',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13},
  cancel: {padding:'9px 20px',border:'1.5px solid #e2e8f0',borderRadius:7,background:'#fff',color:'#475569',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:13},
  print:  {padding:'9px 24px',border:'none',borderRadius:7,background:'#1e40af',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13},
}
