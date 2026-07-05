import { downloadStockExcel } from '../utils/excel'
import { useState, useMemo } from 'react'
import { ITEMS } from '../data/items'

export default function Dashboard({ transactions, stockMap }) {
  const [simQty,  setSimQty]  = useState('')
  const [hoverRow, setHoverRow] = useState(null)
  const todayStr = new Date().toISOString().slice(0,10).replace(/-/g,'')
  const [baseQty,  setBaseQty]  = useState('112')
  const [lowQty,   setLowQty]   = useState('80')

  const sim  = Number(simQty)
  const base = Number(baseQty) || 0
  const low  = Number(lowQty)  || 80

  const itemStats = useMemo(() => ITEMS.map(item => {
    const stock      = stockMap[item.code] || 0
    const assemblable = Math.floor(stock / item.needPerSet)
    const surplus    = stock - item.needPerSet * base
    const status     = stock === 0 ? 'empty' : assemblable < low ? 'low' : 'ok'
    const required   = sim > 0 ? item.needPerSet * sim : 0
    const shortage   = sim > 0 ? Math.max(0, required - stock) : 0
    const simStatus  = sim > 0 ? (shortage > 0 ? 'short' : 'ok') : null
    return { ...item, stock, assemblable, status, surplus, required, shortage, simStatus }
  }), [stockMap, base, sim, low])

  const minSet     = Math.min(...itemStats.map(i => i.assemblable))
  const emptyCount = itemStats.filter(i => i.status === 'empty').length
  const lowCount   = itemStats.filter(i => i.status === 'low').length
  const shortCount = itemStats.filter(i => i.simStatus === 'short').length

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,height:'100%'}}>

      {/* 요약 바 */}
      <div style={{background:'#fff',borderRadius:8,border:'1px solid #e2e8f0',padding:'8px 20px',display:'flex',alignItems:'center',gap:0,flexShrink:0}}>
        <SumItem label="조립가능 SET" value={`${minSet.toLocaleString()} SET`} color="#1e40af"/>
        <div style={S.div}/>
        <SumItem label="재고없음" value={`${emptyCount}품목`} color="#dc2626"/>
        <div style={S.div}/>
        <SumItem label={`발주필요 (${lowQty}SET↓)`} value={`${lowCount}품목`} color="#d97706"/>
      </div>

      {/* 테이블 카드 */}
      <div style={{background:'#fff',borderRadius:8,border:'1px solid #e2e8f0',display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden'}}>

        {/* 카드 헤더 */}
        <div style={{padding:'10px 16px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>부품 재고 현황</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>C-CST 원부자재 A1 ~ A29</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>

            <button onClick={()=>downloadStockExcel(itemStats, base, todayStr)}
              style={{padding:'4px 12px',background:'#16a34a',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:12}}>
              ⬇ 엑셀
            </button>
            <div style={S.div}/>
            {/* 발주기준 */}
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{fontSize:11,color:'#94a3b8'}}>발주기준</span>
              <input type="number" min="1" value={lowQty} onChange={e=>setLowQty(e.target.value)}
                style={{width:50,padding:'3px 6px',border:'1.5px solid #fde68a',borderRadius:5,fontSize:13,fontWeight:700,textAlign:'center',fontFamily:'inherit',outline:'none'}}/>
              <span style={{fontSize:11,color:'#94a3b8'}}>SET</span>
            </div>
            <div style={S.div}/>
            {/* 기준 SET */}
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{fontSize:11,color:'#94a3b8'}}>기준 SET</span>
              <input type="number" min="1" value={baseQty} onChange={e=>setBaseQty(e.target.value)}
                style={{width:58,padding:'3px 6px',border:'1.5px solid #e2e8f0',borderRadius:5,fontSize:13,fontWeight:700,textAlign:'center',fontFamily:'inherit',outline:'none'}}/>
            </div>
            <div style={S.div}/>
            {/* 시뮬레이션 */}
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{fontSize:11,color:'#94a3b8'}}>조립 시뮬레이션</span>
              <input type="number" min="1" value={simQty} onChange={e=>setSimQty(e.target.value)}
                placeholder="SET"
                style={{width:58,padding:'3px 6px',border:'1.5px solid #3b82f6',borderRadius:5,fontSize:13,fontWeight:700,textAlign:'center',fontFamily:'inherit',outline:'none'}}/>
              {sim > 0 && (
                <>
                  {shortCount===0
                    ? <span style={{fontSize:11,fontWeight:700,color:'#16a34a',background:'#dcfce7',padding:'2px 8px',borderRadius:10}}>✔ 충족</span>
                    : <span style={{fontSize:11,fontWeight:700,color:'#dc2626',background:'#fee2e2',padding:'2px 8px',borderRadius:10}}>✘ {shortCount}품목</span>}
                  <button onClick={()=>setSimQty('')} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:13}}>✕</button>
                </>
              )}
            </div>
            <div style={S.div}/>
            {/* 범례 */}
            {sim > 0
              ? <><Dot color="#dc2626" label="부족"/><Dot color="#16a34a" label="충족"/></>
              : <><Dot color="#dc2626" label="재고없음"/><Dot color="#d97706" label="발주필요"/><Dot color="#16a34a" label="정상"/></>}
          </div>
        </div>

        {/* 테이블 */}
        <div style={{overflowY:'auto',overflowX:'hidden',flex:1}}>
          <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed'}}>
            <colgroup>
              <col style={{width:'5%'}}/>
              <col/>
              <col style={{width:'5%'}}/>
              <col style={{width:'8%'}}/>
              <col style={{width:'8%'}}/>
              <col style={{width:'7%'}}/>
              <col style={{width:'9%'}}/>
            </colgroup>

            <thead>
              <tr>
                <th style={sim>0?{...S.th,textAlign:'center'}:{...S.th,textAlign:'center'}}>코드</th>
                <th style={{...S.th,textAlign:'left'}}>품목명</th>
                <th style={{...S.th,textAlign:'center'}}>필요</th>
                <th style={{...S.th,textAlign:'right'}}>현재고</th>
                {sim > 0 ? (
                  <>
                    <th style={{...S.th,textAlign:'right',background:'#243b55'}}>필요({sim}SET)</th>
                    <th style={{...S.th,textAlign:'right',background:'#243b55'}}>부족</th>
                    <th style={{...S.th,textAlign:'center',background:'#243b55'}}>충족여부</th>
                  </>
                ) : (
                  <>
                    <th style={{...S.th,textAlign:'right'}}>조립가능</th>
                    <th style={{...S.th,textAlign:'center'}}>상태</th>
                    <th style={{...S.th,textAlign:'right',background:'#243b55'}}>과부족({base}SET)</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {itemStats.map((item,i) => {
                let bg
                if (sim > 0) bg = item.simStatus==='short'?'#fff5f5':i%2===0?'#f0fdf4':'#f8fffa'
                else bg = item.status==='empty'?'#fff5f5':item.status==='low'?'#fffdf0':i%2===0?'#f8fafc':'#fff'

                return (
                  <tr key={item.code}
                    style={{background: hoverRow===item.code ? '#dbeafe' : bg, transition:'background 0.1s'}}
                    onMouseEnter={()=>setHoverRow(item.code)}
                    onMouseLeave={()=>setHoverRow(null)}>
                    <td style={{...S.td,textAlign:'center'}}>
                      <span style={{background:'#eff6ff',color:'#1e40af',padding:'1px 7px',borderRadius:4,fontSize:11,fontWeight:800}}>{item.code}</span>
                    </td>
                    <td style={{...S.td,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:190}}>{item.name}</td>
                    <td style={{...S.td,textAlign:'center',color:'#94a3b8'}}>{item.needPerSet}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:700}}>{item.stock.toLocaleString()}</td>
                    {sim > 0 ? (
                      <>
                        <td style={{...S.td,textAlign:'right',color:'#374151'}}>{item.required.toLocaleString()}</td>
                        <td style={{...S.td,textAlign:'right',fontWeight:700,color:item.shortage>0?'#dc2626':'#94a3b8'}}>
                          {item.shortage>0?`-${item.shortage.toLocaleString()}`:'—'}
                        </td>
                        <td style={{...S.td,textAlign:'center'}}>
                          {item.shortage>0
                            ? <Badge c="#dc2626" bg="#fee2e2" t="부족"/>
                            : <Badge c="#16a34a" bg="#dcfce7" t="충족"/>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{...S.td,textAlign:'right',fontWeight:800,
                          color:item.status==='empty'?'#dc2626':item.status==='low'?'#d97706':'#16a34a'}}>
                          {item.assemblable.toLocaleString()}
                        </td>
                        <td style={{...S.td,textAlign:'center'}}>
                          {item.status==='empty'&&<Badge c="#dc2626" bg="#fee2e2" t="재고없음"/>}
                          {item.status==='low'  &&<Badge c="#d97706" bg="#fef3c7" t="발주필요"/>}
                          {item.status==='ok'   &&<Badge c="#16a34a" bg="#dcfce7" t="정상"/>}
                        </td>
                        <td style={{...S.td,textAlign:'right',fontWeight:700,
                          color:item.surplus>=0?'#16a34a':'#dc2626'}}>
                          {base>0?(item.surplus>=0?`+${item.surplus.toLocaleString()}`:item.surplus.toLocaleString()):'—'}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
            {sim>0 && shortCount>0 && (
              <tfoot>
                <tr>
                  <td colSpan={7} style={{padding:'10px 14px',background:'#fff5f5',borderTop:'2px solid #fecaca',fontSize:12}}>
                    <span style={{fontWeight:700,color:'#dc2626'}}>⚠ {sim}SET 조립 불가 — </span>
                    <span style={{color:'#991b1b'}}>{itemStats.filter(i=>i.shortage>0).map(i=>`${i.code}(${i.shortage.toLocaleString()}부족)`).join(' · ')}</span>
                  </td>
                </tr>
              </tfoot>
            )}
            {sim>0 && shortCount===0 && (
              <tfoot>
                <tr>
                  <td colSpan={7} style={{padding:'10px 14px',background:'#f0fdf4',borderTop:'2px solid #bbf7d0',fontSize:12,fontWeight:700,color:'#16a34a'}}>
                    ✔ {sim}SET 조립 가능 — 전 품목 충족
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

function SumItem({label,value,color}) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:1,padding:'0 16px'}}>
      <span style={{fontSize:10,color:'#94a3b8',fontWeight:600,letterSpacing:0.3}}>{label}</span>
      <span style={{fontSize:15,fontWeight:800,color}}>{value}</span>
    </div>
  )
}
function Badge({c,bg,t}) {
  return <span style={{background:bg,color:c,padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700,whiteSpace:'nowrap'}}>{t}</span>
}
function Dot({color,label}) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#64748b'}}>
      <div style={{width:7,height:7,borderRadius:'50%',background:color}}/>
      {label}
    </div>
  )
}

const S = {
  div: {width:1,height:20,background:'#e2e8f0',flexShrink:0},
  th:  {background:'#1e293b',color:'#e2e8f0',padding:'8px 10px',fontSize:10,fontWeight:700,position:'sticky',top:0,letterSpacing:0.5,whiteSpace:'nowrap'},
  td:  {padding:'8px 10px',fontSize:12,color:'#1e293b',borderBottom:'1px solid #f1f5f9',verticalAlign:'middle'},
}
