import { useState, useMemo, useEffect } from 'react'
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore'
import { downloadHistoryExcel } from '../utils/excel'
import { db } from '../firebase'

const parseDate = (v) => {
  const year = new Date().getFullYear()
  v = (v||'').trim().replace(/\./g, '/')
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (slash) return `${year}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`
  const mmdd = v.match(/^(\d{2})(\d{2})$/)
  if (mmdd) return `${year}-${mmdd[1]}-${mmdd[2]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return v
}

export default function History({ transactions }) {
  const [tab, setTab]           = useState('history')
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('전체')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [logs, setLogs]         = useState([])
  const [sortField, setSortField] = useState('date')
  const [sortDir,   setSortDir]   = useState('desc')

  // 수정 로그 실시간 로딩 (항상 구독)
  useEffect(() => {
    const q = query(collection(db, 'logs'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d==='desc'?'asc':'desc')
    else { setSortField(field); setSortDir('desc') }
  }
  const sortIcon = (field) => sortField===field ? (sortDir==='desc'?'↓':'↑') : '↕'

  const from = parseDate(dateFrom)
  const to   = parseDate(dateTo)

  const filtered = useMemo(() => {
    return [...transactions]
      .filter(t => t.type === '입고' || t.type === '출고')
      .sort((a,b) => {
        let va, vb
        if (sortField==='date') { va=a.date; vb=b.date }
        else if (sortField==='type') { va=a.type; vb=b.type }
        else if (sortField==='itemCode') { va=a.itemCode||''; vb=b.itemCode||'' }
        else if (sortField==='quantity') { va=a.quantity||0; vb=b.quantity||0 }
        else { va=a.date; vb=b.date }
        if (typeof va==='number') return sortDir==='desc'?vb-va:va-vb
        return sortDir==='desc'?vb.localeCompare(va):va.localeCompare(vb)
      })
      .filter(t => {
        const q = search.toLowerCase()
        const code = (t.itemCode||'').toLowerCase()
        const isCodeQuery = /^a\d+(-\d+)?$/i.test(q)
        const codeMatch = isCodeQuery
          ? (code === q || code.startsWith(q + '-'))
          : code.includes(q)
        const matchSearch = !q ||
          codeMatch ||
          (t.itemName||'').toLowerCase().includes(q) ||
          (t.memo||'').toLowerCase().includes(q)
        const matchType = typeFilter === '전체' || t.type === typeFilter
        const matchFrom = !dateFrom || t.date >= from
        const matchTo   = !dateTo   || t.date <= to
        return matchSearch && matchType && matchFrom && matchTo
      })
  }, [transactions, search, typeFilter, from, to])

  const totalIn  = filtered.filter(t=>t.type==='입고').reduce((s,t)=>s+t.quantity,0)
  const totalOut = filtered.filter(t=>t.type==='출고').reduce((s,t)=>s+t.quantity,0)

  return (
    <div style={S.wrap}>
      {/* 서브 탭 */}
      <div style={S.tabBar}>
        <button style={tab==='history'?S.tabActive:S.tab} onClick={()=>setTab('history')}>📋 입출고 이력</button>
        <button style={tab==='logs'?S.tabActive:S.tab} onClick={()=>setTab('logs')}>🔍 수정 로그</button>
      </div>

      {/* 입출고 이력 탭 */}
      {tab === 'history' && (
        <>
          <div style={S.toolbar}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <input type="text" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                placeholder="시작일 (7/1)" style={S.dateInp}/>
              <span style={{color:'#94a3b8',fontSize:12}}>~</span>
              <input type="text" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                placeholder="종료일 (7/31)" style={S.dateInp}/>
              {(dateFrom||dateTo) && (
                <button onClick={()=>{setDateFrom('');setDateTo('')}}
                  style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:14}}>✕</button>
              )}
            </div>
            <div style={S.searchWrap}>
              <span style={{fontSize:13,color:'#94a3b8'}}>🔍</span>
              <input style={S.searchInput} placeholder="품목코드·품목명·메모 검색"
                value={search} onChange={e=>setSearch(e.target.value)}/>
              {search && <button style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer'}} onClick={()=>setSearch('')}>✕</button>}
            </div>
            <div style={{display:'flex',gap:4}}>
              {['전체','입고','출고'].map(t => (
                <button key={t} style={typeFilter===t?S.filterActive:S.filterBtn}
                  onClick={()=>setTypeFilter(t)}>{t}</button>
              ))}
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginLeft:'auto'}}>
              <span style={{fontSize:12,fontWeight:600,color:'#1d4ed8',background:'#dbeafe',padding:'3px 10px',borderRadius:20}}>입고 {totalIn.toLocaleString()} EA</span>
              <span style={{fontSize:12,fontWeight:600,color:'#ea580c',background:'#ffedd5',padding:'3px 10px',borderRadius:20}}>출고 {totalOut.toLocaleString()} EA</span>
              <span style={{fontSize:12,color:'#475569'}}>{filtered.length}건</span>
              <button onClick={()=>downloadHistoryExcel(filtered, new Date().toISOString().slice(0,10).replace(/-/g,''))}
                style={{padding:'4px 12px',background:'#16a34a',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:12}}>
                ⬇ 엑셀
              </button>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {['No','날짜','구분','코드','품목명','수량','메모'].map((h,i) => (
                      <th key={i} style={{...S.th, textAlign:i===4?'left':i===5?'right':'center'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length===0 && (
                    <tr><td colSpan={7} style={{padding:40,textAlign:'center',color:'#94a3b8',fontSize:14}}>검색 결과가 없습니다</td></tr>
                  )}
                  {filtered.map((tx,i) => (
                    <tr key={tx.id||i} style={{background:i%2===0?'#f8fafc':'#fff'}}>
                      <td style={{...S.td,textAlign:'center',color:'#94a3b8',fontSize:11}}>{filtered.length-i}</td>
                      <td style={{...S.td,textAlign:'center',color:'#475569',whiteSpace:'nowrap'}}>{tx.date}</td>
                      <td style={{...S.td,textAlign:'center'}}>
                        {tx.type==='입고'  && <span style={S.tagIn}>입고</span>}
                        {tx.type==='출고'  && <span style={S.tagOut}>출고</span>}
                        {tx.type==='출하계획' && <span style={S.tagShip}>출하</span>}
                      </td>
                      <td style={{...S.td,textAlign:'center',fontWeight:700,color:'#1e40af'}}>{tx.itemCode||'SET'}</td>
                      <td style={S.td}>{tx.itemName||`CST ${tx.setQty}SET 출하`}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700}}>
                        {tx.type==='출하계획' ? `${tx.setQty} SET` : `${(tx.quantity||0).toLocaleString()} EA`}
                      </td>
                      <td style={{...S.td,color:'#64748b',fontSize:12}}>{tx.memo||''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 수정 로그 탭 */}
      {tab === 'logs' && (
        <div style={S.card}>
          <div style={{padding:'10px 16px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>수정 로그</span>
            <span style={{fontSize:11,color:'#94a3b8'}}>최근 200건</span>
          </div>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['시각','작업자','작업','코드','변경 전','변경 후'].map((h,i) => (
                    <th key={i} style={{...S.th,textAlign:'left'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length===0 && (
                  <tr><td colSpan={6} style={{padding:40,textAlign:'center',color:'#94a3b8',fontSize:14}}>수정 로그가 없습니다</td></tr>
                )}
                {logs.map((log,i) => {
                  const ts = log.createdAt?.seconds
                    ? new Date(log.createdAt.seconds*1000).toLocaleString('ko-KR')
                    : ''
                  const parse = v => { try { return typeof v==='string' ? JSON.parse(v) : v } catch{ return v } }
                  const before = parse(log.before)
                  const after  = parse(log.after)
                  const code   = after?.itemCode || before?.itemCode || '-'
                  const target = log.target ? `[${log.target}] ` : ''
                  const ACTION_STYLE = {
                    '입력':   {bg:'#dcfce7',color:'#16a34a'},
                    '수정':   {bg:'#fef3c7',color:'#d97706'},
                    '삭제':   {bg:'#fee2e2',color:'#dc2626'},
                    '출하확정':{bg:'#dbeafe',color:'#1d4ed8'},
                    '확정취소':{bg:'#f3e8ff',color:'#7c3aed'},
                  }
                  const as = ACTION_STYLE[log.action] || {bg:'#f1f5f9',color:'#475569'}
                  const fmtData = d => {
                    if (!d) return '-'
                    if (d.setQty) return `${d.date||''} / ${d.setQty}SET${d.memo?' / '+d.memo:''}`
                    return `${d.date||''} / ${Number(d.quantity||0).toLocaleString()}EA${d.memo?' / '+d.memo:''}`
                  }
                  return (
                    <tr key={log.id} style={{background:i%2===0?'#f8fafc':'#fff'}}>
                      <td style={{...S.td,fontSize:11,color:'#475569',whiteSpace:'nowrap'}}>{ts}</td>
                      <td style={{...S.td,fontWeight:600}}>{log.user||'-'}</td>
                      <td style={{...S.td,textAlign:'center'}}>
                        <span style={{background:as.bg,color:as.color,padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>
                          {log.action}
                        </span>
                        {log.target && <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{log.target}</div>}
                      </td>
                      <td style={{...S.td,fontWeight:700,color:'#1e40af'}}>{code}</td>
                      <td style={{...S.td,fontSize:11,color:'#64748b'}}>{fmtData(before)}</td>
                      <td style={{...S.td,fontSize:11,color:log.action==='삭제'?'#dc2626':'#16a34a',fontWeight:500}}>
                        {log.action==='삭제'?'삭제됨':fmtData(after)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  wrap:    {display:'flex',flexDirection:'column',gap:12,height:'100%'},
  tabBar:  {display:'flex',gap:4,background:'#fff',borderRadius:8,border:'1px solid #e2e8f0',padding:4,width:'fit-content',flexShrink:0},
  tab:     {padding:'7px 18px',background:'none',border:'none',color:'#64748b',cursor:'pointer',borderRadius:6,fontFamily:'inherit',fontWeight:500,fontSize:13},
  tabActive:{padding:'7px 18px',background:'#0f172a',border:'none',color:'#fff',cursor:'pointer',borderRadius:6,fontFamily:'inherit',fontWeight:700,fontSize:13},
  toolbar: {display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',flexShrink:0},
  dateInp: {padding:'7px 10px',border:'1.5px solid #e2e8f0',borderRadius:7,fontSize:13,fontFamily:'inherit',outline:'none',width:110,color:'#1e293b'},
  searchWrap:{flex:1,minWidth:200,display:'flex',alignItems:'center',background:'#fff',border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',gap:8},
  searchInput:{flex:1,border:'none',outline:'none',padding:'8px 0',fontSize:13,fontFamily:'inherit',background:'transparent'},
  filterBtn:  {padding:'7px 14px',border:'1.5px solid #e2e8f0',borderRadius:6,background:'#fff',color:'#475569',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:12},
  filterActive:{padding:'7px 14px',border:'1.5px solid #1e40af',borderRadius:6,background:'#1e40af',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:12},
  card:    {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden'},
  tableWrap:{overflowY:'auto',flex:1},
  table:   {width:'100%',borderCollapse:'collapse'},
  th:      {background:'#1e293b',color:'#94a3b8',padding:'9px 12px',fontSize:11,fontWeight:700,position:'sticky',top:0,whiteSpace:'nowrap'},
  td:      {padding:'8px 12px',fontSize:13,color:'#1e293b',borderBottom:'1px solid #f1f5f9',verticalAlign:'middle'},
  tagIn:   {background:'#dbeafe',color:'#1d4ed8',padding:'2px 9px',borderRadius:4,fontSize:11,fontWeight:700},
  tagOut:  {background:'#ffedd5',color:'#ea580c',padding:'2px 9px',borderRadius:4,fontSize:11,fontWeight:700},
  tagShip: {background:'#dcfce7',color:'#16a34a',padding:'2px 9px',borderRadius:4,fontSize:11,fontWeight:700},
}
