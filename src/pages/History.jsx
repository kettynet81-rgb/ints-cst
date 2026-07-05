import { useState, useMemo } from 'react'

export default function History({ transactions }) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('전체')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]   = useState('')

  const filtered = useMemo(() => {
    return [...transactions].filter(t => t.type === '입고' || t.type === '출고')
      .sort((a,b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date)
        return (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)
      })
      .filter(t => {
        const q = search.toLowerCase()
        const matchSearch = !q ||
          t.itemCode.toLowerCase().includes(q) ||
          t.itemName.toLowerCase().includes(q) ||
          (t.memo||'').toLowerCase().includes(q)
        const matchType = typeFilter === '전체' || t.type === typeFilter
        return matchSearch && matchType
      })
  }, [transactions, search, typeFilter])

  const totalIn  = filtered.filter(t=>t.type==='입고').reduce((s,t)=>s+t.quantity,0)
  const totalOut = filtered.filter(t=>t.type==='출고').reduce((s,t)=>s+t.quantity,0)

  return (
    <div style={S.wrap}>
      <div style={S.topBar}>
        <div>
          <div style={S.pageTitle}>입출고 이력</div>
          <div style={S.pageDate}>전체 {transactions.length}건</div>
        </div>
      </div>

      {/* 검색/필터 */}
      <div style={S.toolbar}>
        {/* 날짜 범위 */}
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <input type="text" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
            placeholder="시작일 (7/1)"
            style={{...S.dateInp}} />
          <span style={{color:'#94a3b8',fontSize:12}}>~</span>
          <input type="text" value={dateTo} onChange={e=>setDateTo(e.target.value)}
            placeholder="종료일 (7/31)"
            style={{...S.dateInp}} />
          {(dateFrom||dateTo) && (
            <button onClick={()=>{setDateFrom('');setDateTo('')}}
              style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:14}}>✕</button>
          )}
        </div>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>🔍</span>
          <input style={S.searchInput} placeholder="품목코드·품목명·메모 검색"
            value={search} onChange={e=>setSearch(e.target.value)} />
          {search && <button style={S.clearBtn} onClick={()=>setSearch('')}>✕</button>}
        </div>
        <div style={S.filterGroup}>
          {['전체','입고','출고'].map(t => (
            <button key={t} style={typeFilter===t ? S.filterActive : S.filterBtn}
              onClick={()=>setTypeFilter(t)}>{t}</button>
          ))}
        </div>
        <div style={S.summary}>
          <span style={S.sumIn}>입고 {totalIn.toLocaleString()} EA</span>
          <span style={S.sumOut}>출고 {totalOut.toLocaleString()} EA</span>
          <span style={S.sumTotal}>{filtered.length}건</span>
        </div>
      </div>

      {/* 테이블 */}
      <div style={S.card}>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {['No','날짜','구분','코드','품목명','수량','메모'].map(h => (
                  <th key={h} style={h==='품목명' ? {...S.th,textAlign:'left',minWidth:200} : S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={S.empty}>검색 결과가 없습니다</td></tr>
              )}
              {filtered.map((tx, i) => (
                <tr key={i} style={i%2===0 ? S.trEven : S.trOdd}>
                  <td style={{...S.td,textAlign:'center',color:'#94a3b8',fontSize:11}}>{filtered.length-i}</td>
                  <td style={{...S.td,textAlign:'center',color:'#475569',whiteSpace:'nowrap'}}>{tx.date}</td>
                  <td style={{...S.td,textAlign:'center'}}>
                    <span style={tx.type==='입고' ? S.tagIn : S.tagOut}>{tx.type}</span>
                  </td>
                  <td style={{...S.td,textAlign:'center',fontWeight:700,color:'#1e40af'}}>{tx.itemCode}</td>
                  <td style={S.td}>{tx.itemName}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:700}}>{tx.quantity.toLocaleString()}</td>
                  <td style={{...S.td,color:'#64748b',fontSize:12}}>{tx.memo||''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const S = {
  wrap: { padding:28 },
  topBar: { marginBottom:20 },
  pageTitle: { fontSize:22,fontWeight:700,color:'#0f172a' },
  pageDate: { fontSize:13,color:'#64748b',marginTop:3 },
  toolbar: { display:'flex',gap:12,alignItems:'center',marginBottom:16,flexWrap:'wrap' },
  searchWrap: { flex:1,minWidth:220,display:'flex',alignItems:'center',background:'#fff',border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',gap:8,boxShadow:'0 1px 3px rgba(0,0,0,0.06)' },
  searchIcon: { fontSize:14,color:'#94a3b8' },
  searchInput: { flex:1,border:'none',outline:'none',padding:'10px 0',fontSize:14,fontFamily:'inherit',background:'transparent' },
  clearBtn: { background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:14,padding:'0 2px' },
  filterGroup: { display:'flex',gap:4 },
  filterBtn: { padding:'8px 16px',border:'1.5px solid #e2e8f0',borderRadius:6,background:'#fff',color:'#475569',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:13 },
  filterActive: { padding:'8px 16px',border:'1.5px solid #1e40af',borderRadius:6,background:'#1e40af',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13 },
  summary: { display:'flex',gap:10,alignItems:'center',marginLeft:'auto' },
  sumIn: { fontSize:13,fontWeight:600,color:'#1d4ed8',background:'#dbeafe',padding:'4px 12px',borderRadius:20 },
  sumOut: { fontSize:13,fontWeight:600,color:'#ea580c',background:'#ffedd5',padding:'4px 12px',borderRadius:20 },
  sumTotal: { fontSize:13,fontWeight:600,color:'#475569' },
  card: { background:'#fff',borderRadius:10,boxShadow:'0 1px 4px rgba(0,0,0,0.08)',overflow:'hidden' },
  tableWrap: { overflowX:'auto' },
  table: { width:'100%',borderCollapse:'collapse' },
  th: { background:'#1e293b',color:'#fff',padding:'11px 14px',fontSize:12,fontWeight:600,textAlign:'center',whiteSpace:'nowrap' },
  trEven: { background:'#f8fafc' },
  trOdd:  { background:'#fff' },
  td: { padding:'10px 14px',fontSize:13,color:'#1e293b',borderBottom:'1px solid #f1f5f9' },
  tagIn: { background:'#dbeafe',color:'#1d4ed8',padding:'2px 10px',borderRadius:12,fontSize:11,fontWeight:700 },
  tagOut: { background:'#ffedd5',color:'#ea580c',padding:'2px 10px',borderRadius:12,fontSize:11,fontWeight:700 },
  empty: { padding:48,textAlign:'center',color:'#94a3b8',fontSize:14 },
}
