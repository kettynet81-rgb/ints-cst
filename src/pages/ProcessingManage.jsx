import { useState, useMemo, useEffect } from 'react'
import { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
         query, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ITEMS } from '../data/items'
import { writeLog } from '../utils/logger'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function ProcessingManage({ stockMap }) {
  const { userData } = useAuth()
  const [processing, setProcessing] = useState({})
  const [logs, setLogs] = useState([])
  const [form, setForm] = useState({ date: today(), itemCode:'', planQty:'', actualQty:'', memo:'' })
  const [saving, setSaving] = useState(false)

  // 자사/외주 설정 로드
  useEffect(() => {
    return onSnapshot(doc(db,'settings','processing'), snap => {
      if (snap.exists()) setProcessing(snap.data())
    })
  }, [])

  // 가공 로그 로드
  useEffect(() => {
    const q = query(collection(db,'processing'), orderBy('date','desc'))
    return onSnapshot(q, snap => setLogs(snap.docs.map(d=>({id:d.id,...d.data()}))))
  }, [])

  // 자사 품목만
  const selfItems = useMemo(() =>
    ITEMS.filter(i => processing[i.code] === '자사')
  , [processing])

  const setF = (k,v) => setForm(f=>({...f,[k]:v}))

  const save = async () => {
    if (!form.itemCode || !form.date) return
    if (!form.planQty && !form.actualQty) return
    setSaving(true)
    const item = ITEMS.find(i=>i.code===form.itemCode)
    const data = {
      date: form.date,
      itemCode: form.itemCode,
      itemName: item?.name || '',
      planQty: Number(form.planQty)||0,
      actualQty: Number(form.actualQty)||0,
      memo: form.memo.trim(),
      createdAt: serverTimestamp(),
    }
    await addDoc(collection(db,'processing'), data)
    await writeLog({ action:'입력', target:'가공현황', after:data, user:userData?.name||'' })
    setForm(f=>({...f, itemCode:'', planQty:'', actualQty:'', memo:''}))
    setSaving(false)
  }

  const deleteLog = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return
    await deleteDoc(doc(db,'processing',id))
  }

  // 오늘 날짜 기준 그룹
  const todayStr = today()
  const todayLogs = logs.filter(l => l.date === todayStr)
  const todayPlan   = todayLogs.reduce((s,l)=>s+(l.planQty||0),0)
  const todayActual = todayLogs.reduce((s,l)=>s+(l.actualQty||0),0)

  const foundItem = ITEMS.find(i=>i.code===form.itemCode)

  return (
    <div style={S.wrap}>
      {/* 헤더 */}
      <div style={S.topBar}>
        <div>
          <div style={S.pageTitle}>🔩 가공 현황</div>
          <div style={S.sub}>자사 가공품 생산계획 및 실적 관리</div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <div style={S.summaryBox}>
            <div style={{fontSize:11,color:'#6b7280'}}>오늘 계획</div>
            <div style={{fontSize:18,fontWeight:700,color:'#1e40af'}}>{todayPlan.toLocaleString()} EA</div>
          </div>
          <div style={S.summaryBox}>
            <div style={{fontSize:11,color:'#6b7280'}}>오늘 실적</div>
            <div style={{fontSize:18,fontWeight:700,color:'#16a34a'}}>{todayActual.toLocaleString()} EA</div>
          </div>
        </div>
      </div>

      {/* 자사 품목 재고현황 */}
      {selfItems.length > 0 && (
        <div style={S.stockCard}>
          <div style={S.sectionTitle}>📦 자사 가공품 현재고</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}>
            {selfItems.map(item => {
              const stock = stockMap[item.code] || 0
              const isLow = stock < 50
              return (
                <div key={item.code} style={{
                  background: stock===0?'#fff5f5':isLow?'#fffbeb':'#f0fdf4',
                  border:`1px solid ${stock===0?'#fca5a5':isLow?'#fde68a':'#bbf7d0'}`,
                  borderRadius:8, padding:'8px 14px', minWidth:140,
                }}>
                  <div style={{fontWeight:700,color:'#1e40af',fontSize:12}}>{item.code}</div>
                  <div style={{fontSize:11,color:'#374151',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160}}>{item.name}</div>
                  <div style={{fontWeight:700,fontSize:18,marginTop:4,color:stock===0?'#dc2626':isLow?'#d97706':'#111827'}}>
                    {stock.toLocaleString()} EA
                  </div>
                  <div style={{fontSize:10,color:stock===0?'#dc2626':isLow?'#d97706':'#16a34a',fontWeight:600}}>
                    {stock===0?'재고없음':isLow?'부족주의':'정상'}
                  </div>
                </div>
              )
            })}
          </div>
          {selfItems.length === 0 && (
            <div style={{color:'#9ca3af',fontSize:12,padding:'12px 0'}}>
              사용자 관리 → 자사/외주 설정에서 자사 품목을 선택해주세요
            </div>
          )}
        </div>
      )}

      {/* 입력 폼 */}
      <div style={S.formCard}>
        <div style={S.sectionTitle}>생산 계획/실적 입력</div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:8,alignItems:'flex-end'}}>
          <div style={S.field}>
            <label style={S.label}>날짜</label>
            <input type="date" value={form.date} onChange={e=>setF('date',e.target.value)} style={S.inp}/>
          </div>
          <div style={S.field}>
            <label style={S.label}>품목</label>
            <select value={form.itemCode} onChange={e=>setF('itemCode',e.target.value)} style={{...S.inp,width:160}}>
              <option value="">-- 선택 --</option>
              {selfItems.map(i=><option key={i.code} value={i.code}>{i.code} {i.name}</option>)}
            </select>
          </div>
          <div style={S.field}>
            <label style={S.label}>계획 수량 (EA)</label>
            <input type="number" value={form.planQty} onChange={e=>setF('planQty',e.target.value)}
              placeholder="0" style={{...S.inp,width:100}} onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          <div style={S.field}>
            <label style={S.label}>실적 수량 (EA)</label>
            <input type="number" value={form.actualQty} onChange={e=>setF('actualQty',e.target.value)}
              placeholder="0" style={{...S.inp,width:100}} onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          <div style={{...S.field,flex:1,minWidth:120}}>
            <label style={S.label}>메모</label>
            <input type="text" value={form.memo} onChange={e=>setF('memo',e.target.value)}
              placeholder="특이사항" style={S.inp} onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          <button onClick={save} disabled={saving||!form.itemCode||(!form.planQty&&!form.actualQty)}
            style={{...S.saveBtn,opacity:saving||!form.itemCode?0.5:1,alignSelf:'flex-end'}}>
            {saving?'저장 중...':'+ 등록'}
          </button>
        </div>
      </div>

      {/* 이력 테이블 */}
      <div style={S.tableCard}>
        <div style={{padding:'10px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={S.sectionTitle}>가공 이력</div>
          <span style={{fontSize:11,color:'#9ca3af'}}>총 {logs.length}건</span>
        </div>
        <div style={{overflow:'auto'}}>
          <table style={{width:'100%',maxWidth:1100,borderCollapse:'collapse',tableLayout:'fixed'}}>
            <colgroup>
              <col style={{width:110}}/><col style={{width:80}}/><col/>
              <col style={{width:100}}/><col style={{width:100}}/><col style={{width:80}}/><col style={{width:150}}/><col style={{width:60}}/>
            </colgroup>
            <thead>
              <tr>{['날짜','코드','품목명','계획 (EA)','실적 (EA)','달성률','메모',''].map((h,i)=>(
                <th key={i} style={S.th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {logs.length===0 && <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>등록된 이력이 없습니다</td></tr>}
              {logs.map((log,i)=>{
                const rate = log.planQty>0 ? Math.round(log.actualQty/log.planQty*100) : null
                return (
                  <tr key={log.id} style={{background:i%2===0?'#f8fafc':'#fff'}}>
                    <td style={{...S.td,textAlign:'center',fontSize:12}}>{log.date}</td>
                    <td style={{...S.td,fontWeight:700,color:'#1e40af',textAlign:'center'}}>{log.itemCode}</td>
                    <td style={{...S.td,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{log.itemName}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:600,color:'#374151'}}>{log.planQty?.toLocaleString()}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:700,color:rate&&rate>=100?'#16a34a':rate&&rate<80?'#dc2626':'#374151'}}>
                      {log.actualQty?.toLocaleString()}
                    </td>
                    <td style={{...S.td,textAlign:'center'}}>
                      {rate!==null && <span style={{
                        padding:'2px 7px',borderRadius:10,fontSize:11,fontWeight:700,
                        background:rate>=100?'#dcfce7':rate>=80?'#fef9c3':'#fee2e2',
                        color:rate>=100?'#16a34a':rate>=80?'#ca8a04':'#dc2626'
                      }}>{rate}%</span>}
                    </td>
                    <td style={{...S.td,fontSize:11,color:'#6b7280'}}>{log.memo||''}</td>
                    <td style={{...S.td,textAlign:'center'}}>
                      <button onClick={()=>deleteLog(log.id)} style={S.delBtn}>삭제</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const S = {
  wrap:      {padding:16,background:'#f8fafc',minHeight:'100%',display:'flex',flexDirection:'column',gap:12},
  topBar:    {background:'#fff',borderRadius:10,padding:'14px 18px',border:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10},
  pageTitle: {fontSize:18,fontWeight:700,color:'#111827'},
  sub:       {fontSize:12,color:'#6b7280',marginTop:2},
  summaryBox:{textAlign:'right'},
  stockCard: {background:'#fff',borderRadius:10,padding:'14px 16px',border:'1px solid #e5e7eb'},
  formCard:  {background:'#fff',borderRadius:10,padding:'14px 16px',border:'1px solid #e5e7eb'},
  tableCard: {background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',overflow:'hidden',flex:1},
  sectionTitle:{fontSize:13,fontWeight:700,color:'#111827'},
  field:     {display:'flex',flexDirection:'column',gap:4},
  label:     {fontSize:11,fontWeight:600,color:'#374151'},
  inp:       {padding:'7px 9px',border:'1px solid #d1d5db',borderRadius:6,fontSize:12,outline:'none',fontFamily:'inherit',color:'#111827',width:'100%',boxSizing:'border-box'},
  saveBtn:   {padding:'8px 16px',background:'#1e40af',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'},
  th:        {background:'#1e293b',color:'#e2e8f0',padding:'8px 10px',fontSize:12,fontWeight:600,textAlign:'left',whiteSpace:'nowrap'},
  td:        {padding:'7px 10px',fontSize:13,borderBottom:'1px solid #f3f4f6'},
  delBtn:    {padding:'3px 8px',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:4,cursor:'pointer',fontSize:11,color:'#dc2626',fontFamily:'inherit'},
}
