import { useState, useMemo, useEffect } from 'react'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { writeLog } from '../utils/logger'
import { downloadRecallTemplate, downloadRecallExcel } from '../utils/recallExcel'
import * as XLSX from 'xlsx'

const REPAIR_ITEMS = ['견시창 교체','반사판 교체','내부 볼트 파손','외부 볼트 파손','RFID 교체','파손','기타']
const MEMO_PRESETS = ['RFID 구형','RFID 신형','구형TYPE','신형TYPE']
const EMPTY_FORM   = { rfid:'', repairItems:[], payType:'유상', round:'', outDate:'', inDate:'', memo:'', category:'리콜' }

const parseDate = (v) => {
  if (!v) return ''
  const year = new Date().getFullYear()
  v = String(v).trim().replace(/\./g,'/')
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (slash) return `${year}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`
  const mmdd = v.match(/^(\d{2})(\d{2})$/)
  if (mmdd) return `${year}-${mmdd[1]}-${mmdd[2]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  // Excel date serial
  if (/^\d{5}$/.test(v)) {
    const d = new Date(Math.round((Number(v)-25569)*86400*1000))
    const local = new Date(d.getTime()-d.getTimezoneOffset()*60000)
    return local.toISOString().slice(0,10)
  }
  return v
}

export default function RecallManage({ defaultCategory }) {
  const { userData } = useAuth()
  const [records, setRecords] = useState([])
  const [roundFilter, setRoundFilter] = useState('전체')
  const [search, setSearch]   = useState('')
  const [dateType, setDateType] = useState('반출일')
  const [catFilter, setCatFilter] = useState(defaultCategory||'전체')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [loaded,   setLoaded]   = useState(false)
  const [modal,    setModal]    = useState(false)  // 개별입력 모달
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [editId,   setEditId]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [uploading,setUploading]= useState(false)

  useEffect(() => {
    const q = query(collection(db,'recalls'), orderBy('createdAt','desc'))
    return onSnapshot(q, snap => { setRecords(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoaded(true) })
  }, [])

  const roundInfo = useMemo(() => {
    const m = {}
    records.forEach(r => {
      if (!r.round) return
      if (!m[r.round]) m[r.round] = { outDates:[], inDates:[], paid:0, free:0, total:0 }
      if (r.outDate) m[r.round].outDates.push(r.outDate)
      if (r.inDate)  m[r.round].inDates.push(r.inDate)
      r.payType==='유상' ? m[r.round].paid++ : m[r.round].free++
      m[r.round].total++
    })
    return m
  }, [records])

  const rounds = useMemo(() => {
    const s = new Set(records.map(r=>r.round).filter(Boolean))
    return ['전체', ...Array.from(s).sort((a,b)=>parseInt(b)-parseInt(a))]
  }, [records])

  const filtered = useMemo(() => records
    .filter(r => roundFilter==='전체' || r.round===roundFilter)
    .filter(r => catFilter==='전체' || (r.category||'리콜')===catFilter)
    .filter(r => !search || r.rfid?.toLowerCase().includes(search.toLowerCase()) ||
      (Array.isArray(r.repairItems)?r.repairItems:([r.repairItem||''])).join(' ').includes(search) ||
      r.memo?.includes(search))
    .filter(r => {
      const d = dateType==='반출일' ? r.outDate : r.inDate
      if (dateFrom && (!d||d<dateFrom)) return false
      if (dateTo   && (!d||d>dateTo))   return false
      return true
    })
  , [records, roundFilter, search, dateType, dateFrom, dateTo])

  const paidCount    = filtered.filter(r=>r.payType==='유상').length
  const freeCount    = filtered.filter(r=>r.payType==='무상').length
  const pendingCount = filtered.filter(r=>!r.inDate).length

  const setF = (k,v) => setForm(f=>({...f,[k]:v}))

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setModal(true) }
  const openEdit = (r) => {
    setForm({ rfid:r.rfid||'', repairItems:Array.isArray(r.repairItems)?r.repairItems:(r.repairItem?[r.repairItem]:[]), category:r.category||'리콜',
      payType:r.payType||'유상', round:r.round||'', outDate:r.outDate||'', inDate:r.inDate||'', memo:r.memo||'' })
    setEditId(r.id); setModal(true)
  }

  const save = async () => {
    if (!form.rfid.trim()||!form.round.trim()||!form.repairItems.length) return
    setSaving(true)
    const data = { rfid:form.rfid.trim().toUpperCase(), repairItems:form.repairItems, payType:form.payType,
      round:form.round.trim(), outDate:parseDate(form.outDate), inDate:parseDate(form.inDate), memo:form.memo.trim() }
    if (editId) {
      await updateDoc(doc(db,'recalls',editId), data)
      await writeLog({ action:'수정', target:'리콜수리', docId:editId, after:data, user:userData?.name||'' })
      setEditId(null)
    } else {
      await addDoc(collection(db,'recalls'), { ...data, createdAt:serverTimestamp() })
      await writeLog({ action:'입력', target:'리콜수리', after:data, user:userData?.name||'' })
    }
    setModal(false); setForm(EMPTY_FORM); setSaving(false)
  }

  const deleteRecord = async (r) => {
    if (!window.confirm(`${r.rfid} 삭제하시겠습니까?`)) return
    await deleteDoc(doc(db,'recalls',r.id))
    await writeLog({ action:'삭제', target:'리콜수리', docId:r.id, before:r, user:userData?.name||'' })
  }

  const setInDate = async (r, date) => {
    await updateDoc(doc(db,'recalls',r.id), { inDate: date })
  }

  const downloadExcel = () => downloadRecallExcel(filtered, roundFilter)

  const downloadTemplate = () => downloadRecallTemplate()

  // ── 엑셀 업로드 → Firestore 저장
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { cellDates:true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' })

    // 헤더 행 찾기 (RFID NO 포함된 행)
    let headerIdx = rows.findIndex(r => r.some(v => String(v).includes('RFID')))
    if (headerIdx < 0) { alert('헤더를 찾을 수 없습니다. (RFID NO 컬럼 필요)'); setUploading(false); return }

    const headers = rows[headerIdx].map(h => String(h).trim())
    const col = (name) => headers.findIndex(h => h.includes(name))
    const iRfid    = col('RFID')
    const iRepair  = col('교체')
    const iPayType = col('유')
    const iRound   = col('차수')
    const iOut     = col('반출')
    const iIn      = col('반입')
    const iMemo    = col('비고')

    const items = []
    for (let i = headerIdx+1; i < rows.length; i++) {
      const row = rows[i]
      const rfid = String(row[iRfid]||'').trim().toUpperCase()
      if (!/^[A-Z]{3,4}\d{3,}$/.test(rfid)) continue
      const repairRaw = String(row[iRepair]||'').trim()
      const repairItems = repairRaw.split(/[,、]+/).map(s=>s.trim()).filter(Boolean)
      items.push({
        rfid, repairItems,
        payType: String(row[iPayType]||'유상').includes('무') ? '무상' : '유상',
        round:   String(row[iRound]||'').trim(),
        outDate: parseDate(String(row[iOut]||'')),
        inDate:  parseDate(String(row[iIn]||'')),
        memo:    String(row[iMemo]||'').trim(),
      })
    }

    if (!items.length) { alert('유효한 데이터가 없습니다.'); setUploading(false); return }
    if (!window.confirm(`${items.length}건을 등록하시겠습니까?`)) { setUploading(false); e.target.value=''; return }

    for (const item of items) {
      await addDoc(collection(db,'recalls'), { ...item, createdAt:serverTimestamp() })
    }
    await writeLog({ action:'일괄입력', target:'리콜수리', after:{count:items.length}, user:userData?.name||'' })
    alert(`${items.length}건 등록 완료!`)
    setUploading(false); e.target.value=''
  }

  return (
    <div style={S.wrap}>
      {/* 헤더 */}
      <div style={S.topBar}>
        <div>
          <div style={S.pageTitle}>🔧 리콜 수리 관리</div>
          <div style={S.sub}>C-CASSETTE 반출/반입 수리 이력</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <span style={S.badge('#dc2626')}>유상 {paidCount}EA</span>
          <span style={S.badge('#2563eb')}>무상 {freeCount}EA</span>
          <span style={S.badge('#d97706')}>미반입 {pendingCount}EA</span>
          <span style={{fontSize:13,fontWeight:700,color:'#374151'}}>총 {filtered.length}EA</span>
          <div style={{width:1,height:20,background:'#e5e7eb',margin:'0 4px'}}/>
          <button onClick={downloadTemplate} style={{...S.btn,'#6b7280':1,background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db'}}>
            📋 양식 다운
          </button>
          <label style={{...S.btn,background:'#1e40af',color:'#fff',border:'none',cursor:'pointer'}}>
            {uploading?'업로드 중...':'📂 엑셀 업로드'}
            <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleUpload} disabled={uploading}/>
          </label>
          <button onClick={downloadExcel} style={{...S.btn,background:'#16a34a',color:'#fff',border:'none'}}>
            ⬇ 엑셀 다운
          </button>
        </div>
      </div>
      {/* 필터 */}
      <div style={{display:'flex',gap:8,alignItems:'flex-start',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:5,flexWrap:'wrap',flex:1}}>
          {['전체','리콜','Repair'].map(cat=>(
            <button key={cat} onClick={()=>setCatFilter(cat)}
              style={{padding:'5px 14px',borderRadius:20,border:'1px solid',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600,
                background:catFilter===cat?'#1e293b':'#fff',color:catFilter===cat?'#fff':'#374151',borderColor:catFilter===cat?'#1e293b':'#d1d5db'}}>
              {cat}
            </button>
          ))}
          <div style={{width:1,background:'#e5e7eb',margin:'0 4px'}}/>
          {rounds.map(r => {
            const info = roundInfo[r]
            const outMin = info?.outDates.sort()[0]?.slice(5)
            const inMax  = info?.inDates.sort().at(-1)?.slice(5)
            return (
              <button key={r} onClick={()=>setRoundFilter(r)}
                style={{padding:'5px 12px',borderRadius:20,border:'1px solid',cursor:'pointer',
                  fontSize:12,fontFamily:'inherit',fontWeight:600,lineHeight:1.4,textAlign:'left',
                  background:roundFilter===r?'#1e293b':'#fff',
                  color:roundFilter===r?'#fff':'#374151',
                  borderColor:roundFilter===r?'#1e293b':'#d1d5db'}}>
                <div>{r}</div>
                {r!=='전체'&&info&&(
                  <div style={{fontSize:9,opacity:0.8,fontWeight:400}}>
                    {outMin}{inMax?'~'+inMax:'(진행중)'} · 유{info.paid}/무{info.free}
                  </div>
                )}
              </button>
            )
          })}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          <select value={dateType} onChange={e=>setDateType(e.target.value)} style={S.sel}>
            <option>반출일</option><option>반입일</option>
          </select>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{...S.inp,width:130}}/>
          <span style={{color:'#9ca3af'}}>~</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{...S.inp,width:130}}/>
          {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom('');setDateTo('')}} style={S.clearBtn}>초기화</button>}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="RFID / 교체항목 검색" style={{...S.inp,width:180}}/>
        </div>
      </div>

      {/* 테이블 */}
      <div style={S.tableCard}>
        <table style={{width:'100%',maxWidth:1100,borderCollapse:'collapse',tableLayout:'fixed'}}>
          <colgroup>
            <col style={{width:45}}/><col style={{width:110}}/><col/>
            <col style={{width:70}}/><col style={{width:70}}/><col style={{width:105}}/>
            <col style={{width:110}}/><col style={{width:140}}/><col style={{width:75}}/>
          </colgroup>
          <thead>
            <tr>{['NO','RFID NO','교체 항목','유·무상','차수','반출일','반입일','비고',''].map((h,i)=>(
              <th key={i} style={S.th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {!loaded&&<tr><td colSpan={9} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>로딩 중...</td></tr>}
            {loaded&&filtered.length===0&&<tr><td colSpan={9} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>데이터가 없습니다</td></tr>}
            {filtered.map((r,i)=>(
              <tr key={r.id} style={{background:!r.inDate?'#fffbeb':i%2===0?'#f8fafc':'#fff'}}>
                <td style={{...S.td,textAlign:'center',color:'#9ca3af',fontSize:11}}>{i+1}</td>
                <td style={{...S.td,fontWeight:700,color:'#1e40af',letterSpacing:1}}>{r.rfid}</td>
                <td style={{...S.td,fontSize:12}}>
                  {(Array.isArray(r.repairItems)?r.repairItems:[r.repairItem||'']).map((item,pi)=>(
                    <span key={pi} style={{display:'inline-block',background:'#f1f5f9',color:'#374151',
                      borderRadius:3,padding:'1px 6px',fontSize:10,marginRight:3,marginBottom:2}}>{item}</span>
                  ))}
                </td>
                <td style={{...S.td,textAlign:'center'}}>
                  <span style={{...S.tag,
                    background:(r.category||'리콜')==='리콜'?'#ede9fe':'#dbeafe',
                    color:(r.category||'리콜')==='리콜'?'#7c3aed':'#1e40af'}}>
                    {r.category||'리콜'}
                  </span>
                </td>
                <td style={{...S.td,textAlign:'center'}}>
                  <span style={{...S.tag,background:r.payType==='유상'?'#fee2e2':'#dbeafe',
                    color:r.payType==='유상'?'#dc2626':'#2563eb'}}>{r.payType}</span>
                </td>
                <td style={{...S.td,textAlign:'center',fontSize:12}}>{r.round}</td>
                <td style={{...S.td,textAlign:'center',fontSize:12}}>{r.outDate||'-'}</td>
                <td style={{...S.td,textAlign:'center'}}>
                  {r.inDate
                    ? <span style={{fontSize:12,color:'#16a34a',fontWeight:600}}>{r.inDate}</span>
                    : <input placeholder="반입일 입력" style={S.inlineInp}
                        onBlur={e=>e.target.value&&setInDate(r,parseDate(e.target.value))}
                        onKeyDown={e=>e.key==='Enter'&&e.target.value&&setInDate(r,parseDate(e.target.value))}/>
                  }
                </td>
                <td style={{...S.td,fontSize:11,color:'#6b7280'}}>{r.memo||''}</td>
                <td style={{...S.td,textAlign:'center'}}>
                  <div style={{display:'flex',gap:3,justifyContent:'center'}}>
                    <button onClick={()=>openEdit(r)} style={S.editBtn}>수정</button>
                    <button onClick={()=>deleteRecord(r)} style={S.delBtn}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 통계 탭 제거됨 */}
      {tab==='통계' && (() => {
        const rfidCount = {}
        records.forEach(r => { rfidCount[r.rfid] = (rfidCount[r.rfid]||0)+1 })
        const duplicates = Object.entries(rfidCount).filter(([,v])=>v>=2).sort((a,b)=>b[1]-a[1])
        const typeCount = {}
        records.forEach(r => {
          const items = Array.isArray(r.repairItems)?r.repairItems:[r.repairItem||'기타']
          items.forEach(t => { typeCount[t] = (typeCount[t]||0)+1 })
        })
        const typeRank = Object.entries(typeCount).sort((a,b)=>b[1]-a[1])
        const maxCount = typeRank[0]?.[1] || 1
        return (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{background:'#fff',borderRadius:8,border:'1px solid #e5e7eb',padding:16}}>
              <div style={{fontWeight:700,fontSize:14,color:'#111827',marginBottom:12}}>📊 불량 유형별 발생 건수</div>
              {typeRank.map(([type,count],i) => (
                <div key={type} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span style={{fontWeight:700,color:'#9ca3af',fontSize:12,width:18}}>{i+1}</span>
                      <span style={{fontSize:13,fontWeight:600,color:'#111827'}}>{type}</span>
                    </div>
                    <span style={{fontWeight:700,color:'#1e40af'}}>{count}건</span>
                  </div>
                  <div style={{background:'#f3f4f6',borderRadius:4,height:8}}>
                    <div style={{background:'#1e40af',height:'100%',borderRadius:4,width:`${Math.round(count/maxCount*100)}%`}}/>
                  </div>
                </div>
              ))}
              {typeRank.length===0 && <div style={{color:'#9ca3af',fontSize:12}}>데이터 없음</div>}
            </div>
            <div style={{background:'#fff',borderRadius:8,border:'1px solid #e5e7eb',padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:14,color:'#111827'}}>🔁 중복 RFID</div>
                <span style={{background:duplicates.length>0?'#fee2e2':'#dcfce7',color:duplicates.length>0?'#dc2626':'#16a34a',padding:'2px 10px',borderRadius:10,fontSize:12,fontWeight:700}}>
                  {duplicates.length>0?`${duplicates.length}건 발견`:'중복 없음'}
                </span>
              </div>
              {duplicates.length>0 ? duplicates.map(([rfid,cnt]) => {
                const recs = records.filter(r=>r.rfid===rfid)
                return (
                  <div key={rfid} style={{background:'#fff5f5',border:'1px solid #fca5a5',borderRadius:6,padding:'8px 12px',marginBottom:6}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontWeight:700,color:'#dc2626',fontSize:14}}>{rfid}</span>
                      <span style={{background:'#dc2626',color:'#fff',borderRadius:10,padding:'1px 8px',fontSize:11,fontWeight:700}}>{cnt}회</span>
                    </div>
                    {recs.map((r,i)=>(
                      <div key={i} style={{fontSize:11,color:'#6b7280',marginBottom:2}}>
                        {r.round} · {r.outDate||'-'} · {(Array.isArray(r.repairItems)?r.repairItems:[r.repairItem||'']).join(', ')}
                      </div>
                    ))}
                  </div>
                )
              }) : <div style={{color:'#16a34a',fontSize:12,textAlign:'center',padding:16}}>✓ 중복된 RFID가 없습니다</div>}
            </div>
          </div>
        )
      })()}

      {/* 입력 탭 - 플로팅 버튼 */}
      <button onClick={openAdd} style={S.fab} title="개별 입력">＋</button>

      {/* 개별 입력 모달 */}
      {modal && (
        <div style={S.modalBg} onClick={()=>{setModal(false);setEditId(null)}}>
          <div style={S.modalBox} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={{fontWeight:700,fontSize:15}}>{editId?'수리 기록 수정':'수리 기록 추가'}</span>
              <button onClick={()=>{setModal(false);setEditId(null)}} style={S.closeBtn}>✕</button>
            </div>
            <div style={S.modalBody}>
              <div style={S.mField}>
                <label style={S.label}>카테고리</label>
                <div style={{display:'flex',gap:6}}>
                  {['리콜','Repair'].map(cat=>(
                    <button key={cat} onClick={()=>setForm(f=>({...f,category:cat}))}
                      style={{flex:1,padding:'7px',border:'1px solid',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,
                        background:form.category===cat?'#1e293b':'#f3f4f6',
                        color:form.category===cat?'#fff':'#374151',
                        borderColor:form.category===cat?'#1e293b':'#d1d5db'}}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div style={S.mRow}>
                <div style={S.mField}>
                  <label style={S.label}>차수 *</label>
                  <input value={form.round} onChange={e=>setF('round',e.target.value)} placeholder="12차" style={S.inp}/>
                </div>
                <div style={S.mField}>
                  <label style={S.label}>RFID NO *</label>
                  <input value={form.rfid} onChange={e=>setF('rfid',e.target.value.toUpperCase())} placeholder="IFZD412" style={S.inp}/>
                </div>
                <div style={S.mField}>
                  <label style={S.label}>유·무상</label>
                  <div style={{display:'flex',gap:4}}>
                    {['유상','무상'].map(t=>(
                      <button key={t} onClick={()=>setF('payType',t)} style={{...S.togBtn,
                        background:form.payType===t?(t==='유상'?'#dc2626':'#2563eb'):'#f3f4f6',
                        color:form.payType===t?'#fff':'#374151',
                        borderColor:form.payType===t?(t==='유상'?'#dc2626':'#2563eb'):'#d1d5db'}}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={S.mField}>
                <label style={S.label}>교체 항목 (복수 선택) *</label>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {REPAIR_ITEMS.map(item=>(
                    <label key={item} style={{display:'flex',alignItems:'center',gap:3,cursor:'pointer',
                      padding:'5px 10px',border:'1px solid',borderRadius:5,fontSize:12,fontWeight:600,
                      background:form.repairItems.includes(item)?'#1e40af':'#f9fafb',
                      color:form.repairItems.includes(item)?'#fff':'#374151',
                      borderColor:form.repairItems.includes(item)?'#1e40af':'#d1d5db'}}>
                      <input type="checkbox" style={{display:'none'}} checked={form.repairItems.includes(item)}
                        onChange={e=>setF('repairItems',e.target.checked?[...form.repairItems,item]:form.repairItems.filter(x=>x!==item))}/>
                      {item}
                    </label>
                  ))}
                </div>
              </div>
              <div style={S.mField}>
                <label style={S.label}>카테고리</label>
                <div style={{display:'flex',gap:6}}>
                  {['리콜','Repair'].map(cat=>(
                    <button key={cat} onClick={()=>setForm(f=>({...f,category:cat}))}
                      style={{flex:1,padding:'7px',border:'1px solid',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,
                        background:form.category===cat?'#1e293b':'#f3f4f6',
                        color:form.category===cat?'#fff':'#374151',
                        borderColor:form.category===cat?'#1e293b':'#d1d5db'}}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div style={S.mRow}>
                <div style={S.mField}>
                  <label style={S.label}>반출일</label>
                  <input value={form.outDate} onChange={e=>setF('outDate',e.target.value)} placeholder="7/7 또는 2026-07-07" style={S.inp}/>
                </div>
                <div style={S.mField}>
                  <label style={S.label}>반입일</label>
                  <input value={form.inDate} onChange={e=>setF('inDate',e.target.value)} placeholder="미반입 시 공백" style={S.inp}/>
                </div>
              </div>
              <div style={S.mField}>
                <label style={S.label}>비고</label>
                <div style={{display:'flex',gap:4,marginBottom:6,flexWrap:'wrap'}}>
                  {MEMO_PRESETS.map(p=>(
                    <button key={p} onClick={()=>setF('memo',form.memo===p?'':p)}
                      style={{padding:'3px 8px',border:'1px solid',borderRadius:4,cursor:'pointer',fontSize:11,
                        fontFamily:'inherit',fontWeight:600,
                        background:form.memo===p?'#1e293b':'#f3f4f6',
                        color:form.memo===p?'#fff':'#374151',
                        borderColor:form.memo===p?'#1e293b':'#d1d5db'}}>{p}</button>
                  ))}
                </div>
                <input value={form.memo} onChange={e=>setF('memo',e.target.value)} placeholder="직접 입력" style={S.inp}
                  onKeyDown={e=>e.key==='Enter'&&save()}/>
              </div>
              <button onClick={save} disabled={saving||!form.rfid||!form.round||!form.repairItems.length}
                style={{...S.saveBtn,width:'100%',marginTop:8,
                  opacity:saving||!form.rfid||!form.round||!form.repairItems.length?0.5:1}}>
                {saving?'저장 중...':(editId?'수정 완료':'등록')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  wrap:     {padding:16,background:'#f8fafc',minHeight:'100%',display:'flex',flexDirection:'column',gap:12,position:'relative'},
  topBar:   {background:'#fff',borderRadius:10,padding:'14px 18px',border:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10},
  pageTitle:{fontSize:18,fontWeight:700,color:'#111827'},
  sub:      {fontSize:12,color:'#6b7280',marginTop:2},
  badge:    c=>({background:c+'22',color:c,padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:700}),
  btn:      {padding:'7px 13px',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'},

  inp:      {padding:'7px 9px',border:'1px solid #d1d5db',borderRadius:6,fontSize:12,outline:'none',fontFamily:'inherit',color:'#111827',width:'100%',boxSizing:'border-box'},
  sel:      {padding:'6px 8px',border:'1px solid #d1d5db',borderRadius:6,fontSize:12,outline:'none',fontFamily:'inherit',background:'#fff'},
  clearBtn: {padding:'5px 8px',background:'none',border:'1px solid #d1d5db',borderRadius:5,cursor:'pointer',fontSize:11,color:'#6b7280',fontFamily:'inherit'},

  tableCard:{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',overflow:'auto'},
  th:       {background:'#1e293b',color:'#e2e8f0',padding:'8px 10px',fontSize:12,fontWeight:600,textAlign:'left',whiteSpace:'nowrap'},
  td:       {padding:'7px 10px',fontSize:13,borderBottom:'1px solid #f3f4f6'},
  tag:      {padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:700},
  inlineInp:{padding:'3px 6px',border:'1px solid #fcd34d',borderRadius:4,fontSize:11,fontFamily:'inherit',width:95,outline:'none',background:'#fffbeb'},
  editBtn:  {padding:'3px 8px',background:'#f3f4f6',border:'1px solid #d1d5db',borderRadius:4,cursor:'pointer',fontSize:11,fontFamily:'inherit'},
  delBtn:   {padding:'3px 8px',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:4,cursor:'pointer',fontSize:11,color:'#dc2626',fontFamily:'inherit'},

  fab:      {position:'fixed',bottom:28,right:28,width:52,height:52,borderRadius:'50%',background:'#1e40af',color:'#fff',border:'none',fontSize:26,cursor:'pointer',boxShadow:'0 4px 16px rgba(30,64,175,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'},

  modalBg:  {position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16},
  modalBox: {background:'#fff',borderRadius:12,width:'100%',maxWidth:480,boxShadow:'0 20px 60px rgba(0,0,0,0.2)',maxHeight:'90vh',overflowY:'auto'},
  modalHead:{padding:'16px 20px',borderBottom:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between',alignItems:'center'},
  closeBtn: {background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#9ca3af'},
  modalBody:{padding:20,display:'flex',flexDirection:'column',gap:12},
  mRow:     {display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10},
  mField:   {display:'flex',flexDirection:'column',gap:4},
  label:    {fontSize:11,fontWeight:600,color:'#374151'},
  togBtn:   {flex:1,padding:'7px',border:'1px solid',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600},
  saveBtn:  {padding:'10px',background:'#1e40af',color:'#fff',border:'none',borderRadius:7,cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'},
}
