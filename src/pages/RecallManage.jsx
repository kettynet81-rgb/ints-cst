import { useState, useMemo, useEffect } from 'react'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { writeLog } from '../utils/logger'
import { downloadRecallTemplate, downloadRecallExcel } from '../utils/recallExcel'
import * as XLSX from 'xlsx'

const REPAIR_ITEMS = ['견시창 교체','반사판 교체','RFID 교체','CNT 파손','슬라이드 교체','FRONT COVER 교체','ARM 파손','볼트 파손/누락','외관 찍힘/변형','기타']
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
  const [itemFilter, setItemFilter] = useState('전체')
  const [catFilter, setCatFilter] = useState(defaultCategory==='Repair'?'Repair':defaultCategory==='리콜'?'리콜':'전체')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [loaded,   setLoaded]   = useState(false)
  const [modal,    setModal]    = useState(false)  // 개별입력 모달
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [editId,   setEditId]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [uploading,setUploading]= useState(false)
  const [selected, setSelected]  = useState(new Set())

  useEffect(() => {
    const q = query(collection(db,'recalls'), orderBy('createdAt','desc'))
    return onSnapshot(q, snap => { setRecords(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoaded(true) })
  }, [])

  const repairRecords = useMemo(() => records.filter(r=>(r.category||'리콜')==='Repair'), [records])

  const roundInfo = useMemo(() => {
    const m = {}
    repairRecords.forEach(r => {
      if (!r.round) return
      if (!m[r.round]) m[r.round] = { outDates:[], inDates:[], paid:0, free:0, total:0 }
      if (r.outDate) m[r.round].outDates.push(r.outDate)
      if (r.inDate)  m[r.round].inDates.push(r.inDate)
      r.payType==='유상' ? m[r.round].paid++ : m[r.round].free++
      m[r.round].total++
    })
    return m
  }, [repairRecords])

  const rounds = useMemo(() => {
    const s = new Set(repairRecords.map(r=>r.round).filter(Boolean))
    return ['전체', ...Array.from(s).sort((a,b)=>parseInt(b)-parseInt(a))]
  }, [repairRecords])

  const filtered = useMemo(() => records
    .filter(r => roundFilter==='전체' || (r.round||'').includes(roundFilter))
    .filter(r => catFilter==='전체' || (r.category||'리콜')===catFilter)
    .filter(r => itemFilter==='전체' || (Array.isArray(r.repairItems)?r.repairItems:([r.repairItem||''])).includes(itemFilter))
    .filter(r => !search || r.rfid?.toLowerCase().includes(search.toLowerCase()) ||
      (Array.isArray(r.repairItems)?r.repairItems:([r.repairItem||''])).join(' ').toLowerCase().includes(search.toLowerCase()) ||
      r.memo?.toLowerCase().includes(search.toLowerCase()))
    .filter(r => {
      const d = dateType==='반출일' ? r.outDate : r.inDate
      if (dateFrom && (!d||d<dateFrom)) return false
      if (dateTo   && (!d||d>dateTo))   return false
      return true
    })
  , [records, roundFilter, catFilter, itemFilter, search, dateType, dateFrom, dateTo])

  const paidCount    = filtered.filter(r=>r.payType==='유상').length
  const freeCount    = filtered.filter(r=>r.payType==='무상').length
  const pendingCount = filtered.filter(r=>!r.inDate).length

  const setF = (k,v) => setForm(f=>({...f,[k]:v}))
  const toggleSel  = (id) => setSelected(s => { const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n })
  const selectAll  = () => setSelected(new Set(filtered.map(r=>r.id)))
  const clearSel   = () => setSelected(new Set())
  const deleteSelected = async () => {
    if (!window.confirm(`선택한 ${selected.size}건을 삭제하시겠습니까?`)) return
    for (const id of selected) await deleteDoc(doc(db,'recalls',id))
    setSelected(new Set())
  }

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setModal(true) }
  const openEdit = (r) => {
    setForm({ rfid:r.rfid||'', repairItems:Array.isArray(r.repairItems)?r.repairItems:(r.repairItem?[r.repairItem]:[]), category:r.category||'리콜',
      payType:r.payType||'유상', round:r.round||'', outDate:r.outDate||'', inDate:r.inDate||'', memo:r.memo||'' })
    setEditId(r.id); setModal(true)
  }

  const save = async () => {
    if (!form.rfid.trim()||!form.repairItems.length) return
    if (defaultCategory==='Repair' && !form.round.trim()) return
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
    const iRfid    = col('RFID NO') >= 0 ? col('RFID NO') : col('RFID')
    const iRepair  = col('교체 항목') >= 0 ? col('교체 항목') : col('교체')
    const iPayType = col('유·무상') >= 0 ? col('유·무상') : col('유')
    const iRound   = col('차수')
    const iOut     = col('반출일') >= 0 ? col('반출일') : col('반출')
    const iIn      = col('반입일') >= 0 ? col('반입일') : col('반입')
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
        category: defaultCategory==='Repair' ? 'Repair' : '리콜',
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
          <div style={S.pageTitle}>{defaultCategory==='Repair'?'🛠 Repair 관리':'🔧 리콜 관리'}</div>
          <div style={S.sub}>C-CASSETTE 반출/반입 수리 이력</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:13,fontWeight:700,color:'#374151'}}>총 {filtered.length}건</span>
          <div style={{width:1,height:20,background:'#e5e7eb',margin:'0 4px'}}/>
          <button onClick={downloadTemplate} style={{...S.btn,background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db'}}>
            📋 양식 다운
          </button>
          <label style={{...S.btn,background:'#1e40af',color:'#fff',border:'none',cursor:'pointer'}}>
            {uploading?'업로드 중...':'📂 엑셀 업로드'}
            <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleUpload} disabled={uploading}/>
          </label>
          {selected.size > 0 && (
            <>
              <span style={{fontSize:12,color:'#1e40af',fontWeight:600}}>{selected.size}건 선택</span>
              <button onClick={deleteSelected}
                style={{...S.btn,background:'#dc2626',color:'#fff',border:'none',cursor:'pointer'}}>
                🗑 선택 삭제
              </button>
              <button onClick={clearSel}
                style={{...S.btn,background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',cursor:'pointer'}}>
                선택 해제
              </button>
            </>
          )}
          <button onClick={()=>selected.size===filtered.length?clearSel():selectAll()}
            style={{...S.btn,background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',cursor:'pointer'}}>
            {selected.size===filtered.length&&selected.size>0?'전체 해제':'전체 선택'}
          </button>
          <button onClick={downloadExcel} style={{...S.btn,background:'#16a34a',color:'#fff',border:'none'}}>
            ⬇ 엑셀 다운
          </button>
        </div>
      </div>
      {/* 필터 */}
      <div style={{display:'flex',gap:8,alignItems:'flex-start',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:5,flexWrap:'wrap',flex:1}}>

        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          {/* 차수 필터 - Repair만 */}
          {defaultCategory==='Repair' && (
            <input value={roundFilter==='전체'?'':roundFilter}
              onChange={e=>setRoundFilter(e.target.value||'전체')}
              placeholder="차수 검색 (예: 12차)"
              style={{...S.inp, width:160}}/>
          )}
          {/* 교체항목 필터 */}
          <select value={itemFilter} onChange={e=>setItemFilter(e.target.value)} style={S.sel}>
            <option value="전체">교체항목 전체</option>
            {REPAIR_ITEMS.map(i=><option key={i} value={i}>{i}</option>)}
          </select>
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
            <col style={{width:30}}/>
            {defaultCategory==='Repair' ? <>
              <col style={{width:40}}/><col style={{width:85}}/><col style={{width:180}}/>
              <col style={{width:60}}/><col style={{width:55}}/><col style={{width:85}}/>
              <col style={{width:100}}/><col style={{width:100}}/><col/>
            </> : <>
              <col style={{width:40}}/><col style={{width:85}}/><col style={{width:200}}/>
              <col style={{width:100}}/><col style={{width:100}}/><col/>
            </>}
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
              <tr key={r.id} style={{background:selected.has(r.id)?'#eff6ff':!r.inDate?'#fffbeb':i%2===0?'#f8fafc':'#fff'}}>
                <td style={{...S.td,textAlign:'center'}}>
                  <input type="checkbox" checked={selected.has(r.id)}
                    onChange={()=>toggleSel(r.id)} style={{cursor:'pointer'}}/>
                </td>
                <td style={{...S.td,textAlign:'center',color:'#9ca3af',fontSize:11}}>{i+1}</td>
                <td style={{...S.td,fontWeight:700,color:'#1e40af',letterSpacing:1}}>{r.rfid}</td>
                <td style={{...S.td,fontSize:12}}>
                  {(Array.isArray(r.repairItems)?r.repairItems:[r.repairItem||'']).map((item,pi)=>(
                    <span key={pi} style={{display:'inline-block',background:'#f1f5f9',color:'#374151',
                      borderRadius:3,padding:'1px 6px',fontSize:10,marginRight:3,marginBottom:2}}>{item}</span>
                  ))}
                </td>
                {defaultCategory==='Repair' && <td style={{...S.td,textAlign:'center'}}>
                  <span style={{...S.tag,fontSize:10,padding:'1px 5px',background:r.payType==='유상'?'#fee2e2':'#dbeafe',
                    color:r.payType==='유상'?'#dc2626':'#2563eb'}}>{r.payType}</span>
                </td>}
                {defaultCategory==='Repair' && <td style={{...S.td,textAlign:'center',fontSize:12}}>{r.round}</td>}
                <td style={{...S.td,textAlign:'center',fontSize:12}}>{r.outDate||'-'}</td>
                <td style={{...S.td,textAlign:'center'}}>
                  {r.inDate
                    ? <span style={{fontSize:12,color:'#16a34a',fontWeight:600}}>{r.inDate}</span>
                    : <input placeholder="반입일 입력" style={S.inlineInp}
                        onBlur={e=>e.target.value&&setInDate(r,parseDate(e.target.value))}
                        onKeyDown={e=>e.key==='Enter'&&e.target.value&&setInDate(r,parseDate(e.target.value))}/>
                  }
                </td>
                <td style={{...S.td,fontSize:11,color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:150}}>{r.memo||''}</td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>



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
              {defaultCategory==='Repair' && (
                <div style={S.mField}>
                  <label style={S.label}>차수</label>
                  <input value={form.round} onChange={e=>setForm(f=>({...f,round:e.target.value}))} placeholder="예: 12차" style={S.inp}/>
                </div>
              )}
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
              {defaultCategory==='Repair' && (
                <div style={S.mField}>
                  <label style={S.label}>차수</label>
                  <input value={form.round} onChange={e=>setForm(f=>({...f,round:e.target.value}))} placeholder="예: 12차" style={S.inp}/>
                </div>
              )}
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
