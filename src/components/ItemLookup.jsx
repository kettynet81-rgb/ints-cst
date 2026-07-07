import { useState } from 'react'
import { ITEMS } from '../data/items'

export default function ItemLookup({ onSelect }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = ITEMS.filter(i =>
    !search || i.code.toLowerCase().includes(search.toLowerCase()) || i.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <button type="button" onClick={()=>setOpen(true)} title="품목 조회"
        style={{padding:'5px 8px',background:'#f1f5f9',border:'1px solid #d1d5db',borderRadius:5,
          cursor:'pointer',fontSize:12,color:'#475569',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0}}>
        📋 품목
      </button>

      {open && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>{setOpen(false);setSearch('')}}>
          <div style={{background:'#fff',borderRadius:10,width:380,maxHeight:'70vh',display:'flex',flexDirection:'column',
            boxShadow:'0 20px 60px rgba(0,0,0,0.2)',overflow:'hidden'}}
            onClick={e=>e.stopPropagation()}>
            {/* 헤더 */}
            <div style={{padding:'12px 16px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:8,background:'#1e293b'}}>
              <span style={{fontWeight:700,fontSize:14,color:'#fff',flex:1}}>품목 코드 조회</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="코드/품목명 검색..."
                autoFocus
                style={{padding:'5px 8px',border:'none',borderRadius:5,fontSize:12,outline:'none',
                  background:'#334155',color:'#fff',width:140}}/>
              <button onClick={()=>{setOpen(false);setSearch('')}}
                style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:16,padding:'0 2px'}}>✕</button>
            </div>
            {/* 목록 */}
            <div style={{overflowY:'auto',flex:1}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{position:'sticky',top:0,background:'#f8fafc'}}>
                    <th style={{padding:'6px 12px',textAlign:'left',color:'#64748b',fontWeight:600,borderBottom:'1px solid #e5e7eb',width:70}}>코드</th>
                    <th style={{padding:'6px 12px',textAlign:'left',color:'#64748b',fontWeight:600,borderBottom:'1px solid #e5e7eb'}}>품목명</th>
                    <th style={{padding:'6px 12px',textAlign:'center',color:'#64748b',fontWeight:600,borderBottom:'1px solid #e5e7eb',width:50}}>필요</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, i) => (
                    <tr key={item.code}
                      onClick={()=>{ onSelect&&onSelect(item.code); setOpen(false); setSearch('') }}
                      style={{background:i%2===0?'#fff':'#f8fafc',cursor:onSelect?'pointer':'default'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#eff6ff'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#f8fafc'}>
                      <td style={{padding:'7px 12px',fontWeight:700,color:'#1e40af'}}>{item.code}</td>
                      <td style={{padding:'7px 12px',color:'#111827'}}>{item.name}</td>
                      <td style={{padding:'7px 12px',textAlign:'center',color:'#64748b'}}>{item.needPerSet}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {onSelect && (
              <div style={{padding:'8px 12px',borderTop:'1px solid #f1f5f9',fontSize:11,color:'#94a3b8',textAlign:'center'}}>
                클릭하면 코드가 자동 입력됩니다
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
