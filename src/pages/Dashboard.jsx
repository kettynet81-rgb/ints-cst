import { useState, useMemo } from 'react'
import { ITEMS } from '../data/items'

export default function Dashboard({ transactions, stockMap }) {
  const [simQty, setSimQty] = useState('')
  const sim = Number(simQty)

  const itemStats = useMemo(() => ITEMS.map(item => {
    const stock      = stockMap[item.code] || 0
    const assemblable = Math.floor(stock / item.needPerSet)
    const required   = sim > 0 ? item.needPerSet * sim : 0
    const shortage   = sim > 0 ? Math.max(0, required - stock) : 0
    const status     = stock === 0 ? 'empty' : assemblable < 50 ? 'low' : 'ok'
    const simStatus  = sim > 0 ? (shortage > 0 ? 'short' : 'ok') : null
    return { ...item, stock, assemblable, required, shortage, status, simStatus }
  }), [stockMap, sim])

  const minSet      = Math.min(...itemStats.map(i => i.assemblable))
  const emptyCount  = itemStats.filter(i => i.status === 'empty').length
  const lowCount    = itemStats.filter(i => i.status === 'low').length
  const shortCount  = itemStats.filter(i => i.simStatus === 'short').length

  return (
    <div style={S.wrap}>

      {/* 요약 바 */}
      <div style={S.summaryBar}>
        <SumItem label="조립가능 SET" value={`${minSet.toLocaleString()} SET`} color="#1e40af" />
        <div style={S.sumDiv}/>
        <SumItem label="재고없음" value={`${emptyCount}품목`} color="#dc2626" />
        <div style={S.sumDiv}/>
        <SumItem label="발주필요 (50SET↓)" value={`${lowCount}품목`} color="#d97706" />
        <div style={S.sumDiv}/>
        <SumItem label="전체 품목" value={`${ITEMS.length}개`} color="#374151" />

        {/* SET 시뮬레이터 */}
        <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:10}}>
          <span style={{fontSize:12, color:'#64748b', whiteSpace:'nowrap'}}>조립 시뮬레이션</span>
          <div style={S.simInputWrap}>
            <input
              type="number" min="1" value={simQty}
              onChange={e => setSimQty(e.target.value)}
              placeholder="SET 수"
              style={S.simInput}
            />
            <span style={{fontSize:12, color:'#64748b', marginLeft:4}}>SET</span>
          </div>
          {sim > 0 && (
            <>
              {shortCount === 0
                ? <span style={S.simOk}>✔ 전 품목 충족</span>
                : <span style={S.simNg}>✘ {shortCount}품목 부족</span>}
              <button style={S.simClear} onClick={() => setSimQty('')}>✕</button>
            </>
          )}
        </div>
      </div>

      {/* 재고 테이블 */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <div>
            <div style={S.cardTitle}>부품 재고 현황</div>
            <div style={S.cardSub}>C-CST 원부자재 A1 ~ A29</div>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            {sim > 0
              ? <>
                  <LegendDot color="#dc2626" label="부족"/>
                  <LegendDot color="#16a34a" label="충족"/>
                </>
              : <>
                  <LegendDot color="#dc2626" label="재고없음"/>
                  <LegendDot color="#d97706" label="발주필요"/>
                  <LegendDot color="#16a34a" label="정상"/>
                </>}
          </div>
        </div>

        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{...S.th, textAlign:'center', width:60}}>코드</th>
                <th style={{...S.th, textAlign:'left'}}>품목명</th>
                <th style={{...S.th, textAlign:'center', width:70}}>필요</th>
                <th style={{...S.th, textAlign:'right', width:90}}>현재고</th>
                {sim > 0 ? (
                  <>
                    <th style={{...S.th, textAlign:'right', width:110, background:'#1e3a5c'}}>필요 ({sim}SET)</th>
                    <th style={{...S.th, textAlign:'right', width:100, background:'#1e3a5c'}}>부족수량</th>
                    <th style={{...S.th, textAlign:'center', width:80, background:'#1e3a5c'}}>충족여부</th>
                  </>
                ) : (
                  <>
                    <th style={{...S.th, textAlign:'center', width:90}}>조립가능</th>
                    <th style={{...S.th, textAlign:'center', width:80}}>상태</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {itemStats.map((item, i) => {
                let rowBg
                if (sim > 0) {
                  rowBg = item.simStatus === 'short' ? '#fff5f5' : i%2===0 ? '#f0fdf4' : '#f8fffa'
                } else {
                  rowBg = item.status==='empty' ? '#fff5f5' : item.status==='low' ? '#fffdf0' : i%2===0 ? '#f8fafc' : '#fff'
                }

                return (
                  <tr key={item.code} style={{background:rowBg}}>
                    <td style={{...S.td, textAlign:'center'}}>
                      <span style={S.codeTag}>{item.code}</span>
                    </td>
                    <td style={{...S.td}}>{item.name}</td>
                    <td style={{...S.td, textAlign:'center', color:'#94a3b8'}}>{item.needPerSet}</td>
                    <td style={{...S.td, textAlign:'right', fontWeight:700, fontVariantNumeric:'tabular-nums', fontSize:14}}>
                      {item.stock.toLocaleString()}
                    </td>

                    {sim > 0 ? (
                      <>
                        <td style={{...S.td, textAlign:'right', fontVariantNumeric:'tabular-nums', color:'#374151'}}>
                          {item.required.toLocaleString()}
                        </td>
                        <td style={{...S.td, textAlign:'right', fontWeight:700, fontVariantNumeric:'tabular-nums',
                          color: item.shortage > 0 ? '#dc2626' : '#94a3b8'}}>
                          {item.shortage > 0 ? `-${item.shortage.toLocaleString()}` : '—'}
                        </td>
                        <td style={{...S.td, textAlign:'center'}}>
                          {item.shortage > 0
                            ? <Badge c="#dc2626" bg="#fee2e2" t="부족"/>
                            : <Badge c="#16a34a" bg="#dcfce7" t="충족"/>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{...S.td, textAlign:'right', fontWeight:800, fontSize:14,
                          color: item.status==='empty'?'#dc2626': item.status==='low'?'#d97706':'#16a34a',
                          fontVariantNumeric:'tabular-nums'}}>
                          {item.assemblable.toLocaleString()}
                        </td>
                        <td style={{...S.td, textAlign:'center'}}>
                          {item.status==='empty' && <Badge c="#dc2626" bg="#fee2e2" t="재고없음"/>}
                          {item.status==='low'   && <Badge c="#d97706" bg="#fef3c7" t="발주필요"/>}
                          {item.status==='ok'    && <Badge c="#16a34a" bg="#dcfce7" t="정상"/>}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>

            {/* 시뮬레이션 결과 - 부족 품목만 요약 */}
            {sim > 0 && shortCount > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={7} style={{padding:'12px 16px', background:'#fff5f5', borderTop:'2px solid #fecaca'}}>
                    <span style={{fontSize:12, fontWeight:700, color:'#dc2626'}}>
                      ⚠ {sim}SET 조립 불가 — 부족 품목 {shortCount}개:
                    </span>
                    <span style={{fontSize:12, color:'#991b1b', marginLeft:8}}>
                      {itemStats.filter(i=>i.shortage>0).map(i=>`${i.code}(${i.shortage.toLocaleString()}개 부족)`).join(' · ')}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
            {sim > 0 && shortCount === 0 && (
              <tfoot>
                <tr>
                  <td colSpan={7} style={{padding:'12px 16px', background:'#f0fdf4', borderTop:'2px solid #bbf7d0'}}>
                    <span style={{fontSize:12, fontWeight:700, color:'#16a34a'}}>
                      ✔ {sim}SET 조립 가능 — 전 품목 재고 충족
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

function SumItem({ label, value, color }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:1,padding:'0 16px'}}>
      <span style={{fontSize:10,color:'#94a3b8',fontWeight:600,letterSpacing:0.3}}>{label}</span>
      <span style={{fontSize:15,fontWeight:800,color}}>{value}</span>
    </div>
  )
}
function Badge({ c, bg, t }) {
  return <span style={{background:bg,color:c,padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700,whiteSpace:'nowrap',display:'inline-block'}}>{t}</span>
}
function LegendDot({ color, label }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#64748b'}}>
      <div style={{width:7,height:7,borderRadius:'50%',background:color}}/>
      {label}
    </div>
  )
}

const S = {
  wrap: {display:'flex',flexDirection:'column',gap:8,height:'100%'},

  summaryBar: {background:'#fff',borderRadius:8,border:'1px solid #e2e8f0',padding:'8px 16px',display:'flex',alignItems:'center'},
  sumDiv:     {width:1,height:32,background:'#e2e8f0',flexShrink:0},

  simInputWrap: {display:'flex',alignItems:'center',gap:4},
  simInput: {width:70,padding:'4px 8px',border:'2px solid #3b82f6',borderRadius:6,fontSize:13,fontWeight:700,textAlign:'center',fontFamily:'inherit',outline:'none',color:'#1e293b'},
  simOk:    {fontSize:12,fontWeight:700,color:'#16a34a',background:'#dcfce7',padding:'4px 12px',borderRadius:20},
  simNg:    {fontSize:12,fontWeight:700,color:'#dc2626',background:'#fee2e2',padding:'4px 12px',borderRadius:20},
  simClear: {background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:16,padding:'0 4px'},

  card:     {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden'},
  cardHead: {padding:'8px 14px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0},
  cardTitle:{fontSize:14,fontWeight:700,color:'#0f172a'},
  cardSub:  {fontSize:11,color:'#94a3b8',marginTop:2},

  tableWrap:{overflowY:'auto',flex:1},
  table:    {width:'100%',borderCollapse:'collapse',tableLayout:'fixed'},
  th:       {background:'#1e293b',color:'#94a3b8',padding:'9px 12px',fontSize:11,fontWeight:700,position:'sticky',top:0,letterSpacing:0.5,whiteSpace:'nowrap'},
  td:       {padding:'8px 12px',fontSize:13,color:'#1e293b',borderBottom:'1px solid #f1f5f9'},
  codeTag:  {background:'#eff6ff',color:'#1e40af',padding:'1px 7px',borderRadius:4,fontSize:11,fontWeight:800},
}
