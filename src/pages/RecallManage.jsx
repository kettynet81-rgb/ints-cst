import { useState, useMemo } from 'react'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { writeLog } from '../utils/logger'
import * as XLSX from 'xlsx'

const REPAIR_ITEMS = ['견시창 교체','반사판 교체','내부 볼트 파손','외부 볼트 파손','RFID 교체','파손','기타']
const MEMO_PRESETS = ['RFID 구형','RFID 신형','구형TYPE','신형TYPE']
const EMPTY_FORM = { rfid:'', rfidList:'', repairItems:[], payType:'유상', round:'', outDate:'', inDate:'', memo:'' }

const parseDate = (v) => {
  if (!v) return ''
  const year = new Date().getFullYear()
  v = v.trim().replace(/\./g,'/')
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (slash) return `${year}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`
  const mmdd = v.match(/^(\d{2})(\d{2})$/)
  if (mmdd) return `${year}-${mmdd[1]}-${mmdd[2]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return v
}

export default function RecallManage() {
  const { userData } = useAuth()
  const [records, setRecords] = useState([])
  const [roundFilter, setRoundFilter] = useState('전체')
  const [form, setForm]   = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [bulkMode, setBulkMode] = useState(true)
  const [search, setSearch] = useState('')
  const [dateType, setDateType] = useState('반출일')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loaded, setLoaded] = useState(false)

  useState(() => {
    const q = query(collection(db,'recalls'), orderBy('createdAt','desc'))
    const unsub = onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id:d.id, ...d.data() })))
      setLoaded(true)
    })
    return unsub
  })

  const roundInfo = useMemo(() => {
    const m = {}
    records.forEach(r => {
      if (!r.round) return
      if (!m[r.round]) m[r.round] = { outDates:[], inDates:[], paid:0, free:0 }
      if (r.outDate) m[r.round].outDates.push(r.outDate)
      if (r.inDate)  m[r.round].inDates.push(r.inDate)
      if (r.payType==='유상') m[r.round].paid++
      else m[r.round].free++
    })
    return m
  }, [records])

  const rounds = useMemo(() => {
    const s = new Set(records.map(r => r.round).filter(Boolean))
    return ['전체', ...Array.from(s).sort((a,b) => parseInt(b)-parseInt(a))]
  }, [records])

  const filtered = useMemo(() => records
    .filter(r => roundFilter === '전체' || r.round === roundFilter)
    .filter(r => !search || r.rfid?.toLowerCase().includes(search.toLowerCase()) ||
      r.repairItem?.includes(search) || r.memo?.includes(search))
    .filter(r => {
      const d = dateType==='반출일' ? r.outDate : r.inDate
      if (dateFrom && (!d || d < dateFrom)) return false
      if (dateTo   && (!d || d > dateTo))   return false
      return true
    })
  , [records, roundFilter, search])

  const paidCount   = filtered.filter(r => r.payType === '유상').length
  const freeCount   = filtered.filter(r => r.payType === '무상').length
  const pendingCount = filtered.filter(r => !r.inDate).length

  const setF = (k,v) => setForm(f => ({...f,[k]:v}))

  const save = async () => {
    if (!form.round.trim() || form.repairItems.length===0) return
    setSaving(true)

    if (bulkMode && !editId) {
      // 일괄 입력: rfidList에서 RFID 파싱
      const rfids = form.rfidList.split(/[\n\r\t,\s]+/).map(s=>s.trim().toUpperCase()).filter(s=>/^[A-Z]{3,4}\d{3,}$/.test(s))
      if (rfids.length === 0) { setSaving(false); alert('유효한 RFID가 없습니다.'); return }
      if (!window.confirm(`${rfids.length}건을 일괄 등록하시겠습니까?\n\n${rfids.slice(0,5).join(', ')}${rfids.length>5?'...':''}`)) { setSaving(false); return }
      for (const rfid of rfids) {
        await addDoc(collection(db,'recalls'), {
          rfid, repairItems:form.repairItems, payType:form.payType,
          round:form.round.trim(), outDate:parseDate(form.outDate),
          inDate:parseDate(form.inDate), memo:form.memo.trim(),
          createdAt:serverTimestamp(),
        })
      }
      await writeLog({ action:'일괄입력', target:'리콜수리', after:{round:form.round,count:rfids.length,repairItems:form.repairItems}, user:userData?.name||'' })
      alert(`${rfids.length}건 등록 완료!`)
    } else {
      if (!form.rfid.trim()) { setSaving(false); return }
      const data = {
        rfid: form.rfid.trim().toUpperCase(),
        repairItems: form.repairItems,
        payType: form.payType,
        round: form.round.trim(),
        outDate: parseDate(form.outDate),
        inDate: parseDate(form.inDate),
        memo: form.memo.trim(),
      }
      if (editId) {
        await updateDoc(doc(db,'recalls',editId), data)
        await writeLog({ action:'수정', target:'리콜수리', docId:editId, after:data, user:userData?.name||'' })
        setEditId(null)
      } else {
        await addDoc(collection(db,'recalls'), { ...data, createdAt:serverTimestamp() })
        await writeLog({ action:'입력', target:'리콜수리', after:data, user:userData?.name||'' })
      }
    }
    setForm(EMPTY_FORM)
    setSaving(false)
  }

  const startEdit = (r) => {
    setEditId(r.id)
    setForm({ rfid:r.rfid||'', repairItems:Array.isArray(r.repairItems)?r.repairItems:(r.repairItem?[r.repairItem]:[]),
      payType:r.payType||'유상', round:r.round||'',
      outDate:r.outDate||'', inDate:r.inDate||'', memo:r.memo||'' })
  }

  const deleteRecord = async (r) => {
    if (!window.confirm(`${r.rfid} 삭제하시겠습니까?`)) return
    await deleteDoc(doc(db,'recalls',r.id))
    await writeLog({ action:'삭제', target:'리콜수리', docId:r.id, before:r, user:userData?.name||'' })
  }

  const setInDate = async (r, date) => {
    await updateDoc(doc(db,'recalls',r.id), { inDate: date })
  }

  const downloadExcel = () => {
    const headers = ['NO','RFID NO','교체 항목','유·무상','차수','반출일','반입일','비고']
    const rows = filtered.map((r,i) => [
      i+1, r.rfid, r.repairItem, r.payType, r.round, r.outDate||'', r.inDate||'', r.memo||''
    ])
    const data = [
      [`C-CASSETTE 리콜 현황 - ${roundFilter !== '전체' ? roundFilter : '전체'}`],
      [`유상 ${paidCount}EA     무상 ${freeCount}EA`],
      [],
      headers,
      ...rows,
      [],
      [`총 ${filtered.length}EA`, '', '', `유상 ${paidCount}  /  무상 ${freeCount}`]
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{wch:5},{wch:12},{wch:18},{wch:8},{wch:6},{wch:12},{wch:12},{wch:20}]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '리콜현황')
    XLSX.writeFile(wb, `CST_리콜현황_${roundFilter}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.xlsx`)
  }

  return (
    <div style={S.wrap}>
      {/* 헤더 */}
      <div style={S.topBar}>
        <div>
          <div style={S.pageTitle}>🔧 리콜 수리 관리</div>
          <div style={S.sub}>C-CASSETTE 반출/반입 수리 이력</div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <span style={S.badge('#dc2626')}>유상 {paidCount}EA</span>
            <span style={S.badge('#2563eb')}>무상 {freeCount}EA</span>
            <span style={S.badge('#d97706')}>미반입 {pendingCount}EA</span>
            <span style={{fontSize:12,color:'#374151',fontWeight:600}}>총 {filtered.length}EA</span>
          </div>
          <button onClick={downloadExcel} style={S.xlsBtn}>⬇ 엑셀</button>
        </div>
      </div>

      {/* 입력 폼 */}
      <div style={S.formCard}>
        <div style={S.formRow}>
          <div style={S.field}>
            <label style={S.label}>차수 *</label>
            <input value={form.round} onChange={e=>setF('round',e.target.value)}
              placeholder="예: 12차" style={{...S.inp,width:80}} onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          {bulkMode && !editId ? (
            <div style={{...S.field,flex:1,minWidth:200}}>
              <label style={S.label}>RFID 목록 (붙여넣기 가능) *</label>
              <textarea value={form.rfidList} onChange={e=>setF('rfidList',e.target.value)}
                placeholder={"IFYG766\nIFYF237\nIFYF797\n...\n엑셀에서 복사 후 붙여넣기"}
                style={{...S.inp,height:72,resize:'vertical',fontFamily:'monospace',fontSize:11,lineHeight:1.6}}/>
              <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}>
                인식된 RFID: {form.rfidList.split(/[\n\r\t,\s]+/).filter(s=>/^[A-Z]{3,4}\d{3,}$/.test(s.trim())).length}개
              </div>
            </div>
          ) : (
            <div style={S.field}>
              <label style={S.label}>RFID NO *</label>
              <input value={form.rfid} onChange={e=>setF('rfid',e.target.value.toUpperCase())}
                placeholder="IFZD412" style={{...S.inp,width:110}} onKeyDown={e=>e.key==='Enter'&&save()}/>
            </div>
          )}
          <div style={S.field}>
            <label style={S.label}>교체 항목 (복수 선택)</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {REPAIR_ITEMS.map(item=>(
                <label key={item} style={{display:'flex',alignItems:'center',gap:3,cursor:'pointer',
                  padding:'4px 8px',border:'1px solid',borderRadius:5,fontSize:11,fontWeight:600,
                  background:form.repairItems.includes(item)?'#1e40af':'#f9fafb',
                  color:form.repairItems.includes(item)?'#fff':'#374151',
                  borderColor:form.repairItems.includes(item)?'#1e40af':'#d1d5db'}}>
                  <input type="checkbox" style={{display:'none'}}
                    checked={form.repairItems.includes(item)}
                    onChange={e=>setF('repairItems', e.target.checked
                      ? [...form.repairItems,item]
                      : form.repairItems.filter(x=>x!==item))}/>
                  {item}
                </label>
              ))}
            </div>
          </div>
          <div style={S.field}>
            <label style={S.label}>유·무상</label>
            <div style={{display:'flex',gap:4}}>
              {['유상','무상'].map(t=>(
                <button key={t} onClick={()=>setF('payType',t)} style={{
                  ...S.toggleBtn, background:form.payType===t?(t==='유상'?'#dc2626':'#2563eb'):'#f3f4f6',
                  color:form.payType===t?'#fff':'#374151', borderColor:form.payType===t?(t==='유상'?'#dc2626':'#2563eb'):'#d1d5db'
                }}>{t}</button>
              ))}
            </div>
          </div>
          <div style={S.field}>
            <label style={S.label}>반출일</label>
            <input value={form.outDate} onChange={e=>setF('outDate',e.target.value)}
              placeholder="7/1 또는 0701" style={{...S.inp,width:110}} onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          <div style={S.field}>
            <label style={S.label}>반입일</label>
            <input value={form.inDate} onChange={e=>setF('inDate',e.target.value)}
              placeholder="미반입 시 공백" style={{...S.inp,width:110}} onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          <div style={{...S.field,flex:1}}>
            <label style={S.label}>비고</label>
            <div style={{display:'flex',gap:4,marginBottom:4,flexWrap:'wrap'}}>
              {MEMO_PRESETS.map(p=>(
                <button key={p} type="button"
                  onClick={()=>setF('memo', form.memo===p?'':p)}
                  style={{padding:'3px 8px',border:'1px solid',borderRadius:4,cursor:'pointer',
                    fontSize:10,fontFamily:'inherit',fontWeight:600,
                    background:form.memo===p?'#1e293b':'#f3f4f6',
                    color:form.memo===p?'#fff':'#374151',
                    borderColor:form.memo===p?'#1e293b':'#d1d5db'}}>
                  {p}
                </button>
              ))}
            </div>
            <input value={form.memo} onChange={e=>setF('memo',e.target.value)}
              placeholder="직접 입력 가능" style={{...S.inp}} onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'flex-end',paddingBottom:1}}>
            {!editId && (
              <button onClick={()=>{setBulkMode(!bulkMode);setForm(EMPTY_FORM)}}
                style={{padding:'7px 10px',background:bulkMode?'#f3f4f6':'#eff6ff',border:'1px solid',
                  borderColor:bulkMode?'#d1d5db':'#3b82f6',borderRadius:6,cursor:'pointer',
                  fontSize:11,fontFamily:'inherit',color:bulkMode?'#374151':'#1e40af',fontWeight:600,whiteSpace:'nowrap'}}>
                {bulkMode?'📝 개별입력':'📋 일괄입력'}
              </button>
            )}
            <button onClick={save} disabled={saving||!form.rfid||!form.round}
              style={{...S.saveBtn,opacity:saving||(!bulkMode&&!editId&&!form.rfid)||(bulkMode&&!editId&&!form.rfidList)||!form.round||!form.repairItems.length?0.5:1}}>
              {saving?'저장 중...':(editId?'수정':'+ 추가')}
            </button>
            {editId && <button onClick={()=>{setEditId(null);setForm(EMPTY_FORM)}} style={S.cancelBtn}>취소</button>}
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',flex:1}}>
          {rounds.map(r => {
            const info = roundInfo[r]
            const outMin = info?.outDates.length ? info.outDates.sort()[0] : null
            const inMax  = info?.inDates.length  ? info.inDates.sort().at(-1) : null
            return (
              <button key={r} onClick={()=>setRoundFilter(r)}
                style={{padding:'5px 12px',borderRadius:20,border:'1px solid',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600,
                  background:roundFilter===r?'#1e293b':'#fff',color:roundFilter===r?'#fff':'#374151',
                  borderColor:roundFilter===r?'#1e293b':'#d1d5db',lineHeight:1.4,textAlign:'left'}}>
                <div>{r}</div>
                {r!=='전체' && info && (
                  <div style={{fontSize:9,opacity:0.8,fontWeight:400}}>
                    {outMin&&outMin.slice(5)} {inMax?'~'+inMax.slice(5):'(미완료)'}
                    {' · '}유{info.paid}/무{info.free}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          <select value={dateType} onChange={e=>setDateType(e.target.value)} style={{...S.sel,fontSize:11,padding:'5px 7px'}}>
            <option>반출일</option><option>반입일</option>
          </select>
          <input value={dateFrom} onChange={e=>setDateFrom(e.target.value)} placeholder="시작일"
            style={{...S.inp,width:110,fontSize:11}} type="date"/>
          <span style={{fontSize:11,color:'#9ca3af'}}>~</span>
          <input value={dateTo} onChange={e=>setDateTo(e.target.value)} placeholder="종료일"
            style={{...S.inp,width:110,fontSize:11}} type="date"/>
          {(dateFrom||dateTo) && <button onClick={()=>{setDateFrom('');setDateTo('')}}
            style={{fontSize:11,color:'#6b7280',background:'none',border:'1px solid #d1d5db',borderRadius:4,padding:'4px 8px',cursor:'pointer',fontFamily:'inherit'}}>초기화</button>}
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="RFID / 교체항목 검색" style={{...S.inp,width:180}}/>
        </div>
      </div>

      {/* 테이블 */}
      <div style={S.tableCard}>
        <table style={{width:'100%',maxWidth:1100,borderCollapse:'collapse',tableLayout:'fixed'}}>
          <colgroup>
            <col style={{width:45}}/><col style={{width:110}}/><col style={{width:140}}/>
            <col style={{width:70}}/><col style={{width:70}}/><col style={{width:110}}/>
            <col style={{width:110}}/><col/><col style={{width:80}}/>
          </colgroup>
          <thead>
            <tr>
              {['NO','RFID NO','교체 항목','유·무상','차수','반출일','반입일','비고',''].map((h,i)=>(
                <th key={i} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={9} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>
                {loaded?'데이터가 없습니다':'로딩 중...'}
              </td></tr>
            )}
            {filtered.map((r,i)=>(
              <tr key={r.id} style={{background:i%2===0?'#f8fafc':'#fff',
                outline:!r.inDate?'1px solid #fde68a':'none'}}>
                <td style={{...S.td,textAlign:'center',color:'#9ca3af'}}>{i+1}</td>
                <td style={{...S.td,fontWeight:700,color:'#1e40af',letterSpacing:1}}>{r.rfid}</td>
                <td style={S.td}>{(Array.isArray(r.repairItems)?r.repairItems:[r.repairItem||'']).join(', ')}</td>
                <td style={{...S.td,textAlign:'center'}}>
                  <span style={{...S.tag, background:r.payType==='유상'?'#fee2e2':'#dbeafe',
                    color:r.payType==='유상'?'#dc2626':'#2563eb'}}>{r.payType}</span>
                </td>
                <td style={{...S.td,textAlign:'center',color:'#374151'}}>{r.round}</td>
                <td style={{...S.td,textAlign:'center',fontSize:12}}>{r.outDate||'-'}</td>
                <td style={{...S.td,textAlign:'center'}}>
                  {r.inDate
                    ? <span style={{fontSize:12,color:'#16a34a',fontWeight:600}}>{r.inDate}</span>
                    : <input placeholder="반입일 입력" style={{...S.inlineInp}}
                        onBlur={e=>e.target.value&&setInDate(r,parseDate(e.target.value))}
                        onKeyDown={e=>e.key==='Enter'&&e.target.value&&setInDate(r,parseDate(e.target.value))}/>
                  }
                </td>
                <td style={{...S.td,fontSize:12,color:'#6b7280'}}>{r.memo||''}</td>
                <td style={{...S.td,textAlign:'center'}}>
                  <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                    <button onClick={()=>startEdit(r)} style={S.editBtn}>수정</button>
                    <button onClick={()=>deleteRecord(r)} style={S.delBtn}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const S = {
  wrap:     {padding:16,background:'#f8fafc',minHeight:'100%',display:'flex',flexDirection:'column',gap:12},
  topBar:   {background:'#fff',borderRadius:10,padding:'14px 18px',border:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10,flexShrink:0},
  pageTitle:{fontSize:18,fontWeight:700,color:'#111827'},
  sub:      {fontSize:12,color:'#6b7280',marginTop:2},
  badge:    (c) => ({background:c+'22',color:c,padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:700}),
  xlsBtn:   {padding:'7px 14px',background:'#16a34a',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'},

  formCard: {background:'#fff',borderRadius:10,padding:'12px 16px',border:'1px solid #e5e7eb'},
  formRow:  {display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'},
  field:    {display:'flex',flexDirection:'column',gap:4},
  label:    {fontSize:11,fontWeight:600,color:'#374151'},
  inp:      {padding:'7px 9px',border:'1px solid #d1d5db',borderRadius:6,fontSize:12,outline:'none',fontFamily:'inherit',color:'#111827',width:'100%',boxSizing:'border-box'},
  sel:      {padding:'7px 9px',border:'1px solid #d1d5db',borderRadius:6,fontSize:12,outline:'none',fontFamily:'inherit',color:'#111827',background:'#fff'},
  toggleBtn:{padding:'6px 12px',border:'1px solid',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600},
  saveBtn:  {padding:'8px 16px',background:'#1e40af',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'},
  cancelBtn:{padding:'8px 12px',background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit'},

  tableCard:{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',overflow:'auto'},
  th:       {background:'#1e293b',color:'#e2e8f0',padding:'8px 10px',fontSize:12,fontWeight:600,textAlign:'left',whiteSpace:'nowrap'},
  td:       {padding:'7px 10px',fontSize:13,borderBottom:'1px solid #f3f4f6'},
  tag:      {padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:700},
  inlineInp:{padding:'3px 6px',border:'1px solid #fcd34d',borderRadius:4,fontSize:11,fontFamily:'inherit',width:90,outline:'none',background:'#fffbeb'},
  editBtn:  {padding:'3px 8px',background:'#f3f4f6',border:'1px solid #d1d5db',borderRadius:4,cursor:'pointer',fontSize:11,fontFamily:'inherit'},
  delBtn:   {padding:'3px 8px',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:4,cursor:'pointer',fontSize:11,color:'#dc2626',fontFamily:'inherit'},
}
