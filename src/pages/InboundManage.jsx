import { useState, useRef } from 'react'
import { collection, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { writeLog } from '../utils/logger'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ITEMS } from '../data/items'

const ITEM_MAP = Object.fromEntries(ITEMS.map(i => [i.code, i.name]))
const today    = () => new Date().toISOString().slice(0,10)

const parseDate = (v) => {
  const year = new Date().getFullYear()
  v = v.trim().replace(/\./g, '/')
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (slash) return `${year}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`
  const mmdd = v.match(/^(\d{2})(\d{2})$/)
  if (mmdd) return `${year}-${mmdd[1]}-${mmdd[2]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return v
}

export default function InboundManage({ transactions }) {
  const inbounds = transactions
    .filter(t => t.type === '입고')
    .sort((a,b) => b.date.localeCompare(a.date) || (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))

  const [form, setForm]     = useState({ date:'', itemCode:'', quantity:'', memo:'' })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const { userData } = useAuth()

  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [deleting, setDel]  = useState(null)

  const dateRef = useRef(null)
  const codeRef = useRef(null)
  const qtyRef  = useRef(null)
  const memoRef = useRef(null)

  const setF = (k, v) => setForm(f => ({...f, [k]:v}))

  const codeUpper = form.itemCode.trim().toUpperCase()
  const foundItem = ITEMS.find(i => i.code === codeUpper)

  // 품목코드 확정: 숫자만 입력 시 A 자동 추가
  const finalizeCode = (v, goNext=false) => {
    let val = v.trim().toUpperCase()
    if (/^\d+$/.test(val)) val = 'A' + val
    setF('itemCode', val)
    if (ITEMS.find(i => i.code === val) && goNext) setTimeout(() => qtyRef.current?.focus(), 50)
  }

  const handleSave = async () => {
    const item = ITEMS.find(i => i.code === form.itemCode.trim().toUpperCase())
    if (!form.date || !item || !form.quantity || Number(form.quantity) <= 0) return
    setSaving(true)
    await addDoc(collection(db, 'transactions'), {
      type:'입고', date:form.date,
      itemCode:item.code, itemName:item.name,
      quantity:Number(form.quantity), memo:form.memo.trim(),
      createdAt:serverTimestamp(),
    })
    await writeLog({ action:'입력', target:'입고기록', docId:'', after:{ date:form.date, itemCode:item.code, itemName:item.name, quantity:Number(form.quantity), memo:form.memo }, user: userData?.name||'알수없음' })
    setForm({ date:'', itemCode:'', quantity:'', memo:'' })
    setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); codeRef.current?.focus() }, 1500)
  }

  const saveEdit = async () => {
    const before = inbounds.find(t => t.id === editId)
    const after = { date:editData.date, itemCode:editData.itemCode, itemName:ITEM_MAP[editData.itemCode]||'', quantity:Number(editData.quantity), memo:editData.memo }
    await updateDoc(doc(db, 'transactions', editId), after)
    await writeLog({ action:'수정', target:'입고기록', docId:editId, before:{ date:before?.date, itemCode:before?.itemCode, quantity:before?.quantity, memo:before?.memo||'' }, after, user:userData?.name||'알수없음' })
    setEditId(null)
  }

  const deleteRow = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return
    const target = inbounds.find(t => t.id === id)
    setDel(id)
    await writeLog({ action:'삭제', target:'입고기록', docId:id, before:{ date:target?.date, itemCode:target?.itemCode, quantity:target?.quantity }, user:userData?.name||'알수없음' })
    await deleteDoc(doc(db,'transactions',id))
    setDel(null)
  }

  const item = ITEMS.find(i => i.code === form.itemCode.trim().toUpperCase())
  const isReady = form.date && item && form.quantity && Number(form.quantity) > 0

  return (
    <div style={S.wrap}>

      {/* 입력 카드 */}
      <div style={S.inputCard}>
        <div style={S.inputLabel}>입고 등록</div>
        <div style={S.inputRow}>

          {/* 날짜 */}
          <div style={S.field}>
            <label style={S.label}>날짜</label>
            <input ref={dateRef} type="text" value={form.date}
              onChange={e => setF('date', e.target.value)}
              onBlur={e => setF('date', parseDate(e.target.value))}
              onKeyDown={e => e.key==='Enter' && (setF('date', parseDate(form.date)), codeRef.current?.focus())}
              placeholder="7/5 또는 0705"
              style={{...S.inp, width:130}} />
          </div>

          {/* 품목코드 */}
          <div style={{...S.field, flex:1}}>
            <label style={S.label}>
              품목코드
              {item && <span style={{color:'#16a34a', fontWeight:700, fontSize:11, marginLeft:6}}>→ {item.name}</span>}
              {form.itemCode && !item && <span style={{color:'#dc2626', fontSize:11, marginLeft:6}}>→ 없는 코드</span>}
            </label>
            <div style={{position:'relative'}}>
              <input ref={codeRef} type="text" value={form.itemCode}
                onChange={e => setF('itemCode', e.target.value.toUpperCase())}
                onKeyDown={e => { if(e.key==='Enter'||e.key==='Tab'){e.preventDefault(); finalizeCode(form.itemCode, true)} }}
                onBlur={() => finalizeCode(form.itemCode, false)}
                placeholder="18 또는 A18"
                style={{...S.inp, width:150, borderColor: item?'#16a34a': form.itemCode?'#dc2626':'#e2e8f0'}} />
              {form.itemCode && !item && (
                <div style={S.suggest}>
                  {ITEMS.filter(i => i.code.startsWith(form.itemCode.toUpperCase())).slice(0,6).map(i => (
                    <div key={i.code} style={S.suggestItem}
                      onMouseDown={() => { setF('itemCode', i.code); setTimeout(()=>qtyRef.current?.focus(),50) }}>
                      <span style={{fontWeight:700, color:'#1e40af', marginRight:8, width:36}}>{i.code}</span>
                      <span style={{fontSize:12, color:'#64748b'}}>{i.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 수량 */}
          <div style={S.field}>
            <label style={S.label}>수량 (EA)</label>
            <input ref={qtyRef} type="number" min="1" value={form.quantity}
              onChange={e => setF('quantity', e.target.value)}
              onKeyDown={e => e.key==='Enter' && memoRef.current?.focus()}
              placeholder="0"
              style={{...S.inp, width:100, textAlign:'right', fontWeight:700, fontSize:15}} />
          </div>

          {/* 메모 */}
          <div style={{...S.field, flex:2}}>
            <label style={S.label}>메모</label>
            <input ref={memoRef} type="text" value={form.memo}
              onChange={e => setF('memo', e.target.value)}
              onKeyDown={e => e.key==='Enter' && handleSave()}
              placeholder="메모 입력"
              style={{...S.inp, flex:1}} />
          </div>

          {/* 저장 */}
          <div style={{...S.field, justifyContent:'flex-end'}}>
            <label style={{...S.label, opacity:0}}>·</label>
            <button onClick={handleSave} disabled={!isReady||saving}
              style={{...S.saveBtn,
                background: saved?'#16a34a': isReady?'#1e40af':'#cbd5e1',
                cursor: isReady?'pointer':'not-allowed'}}>
              {saved?'✓ 저장됨': saving?'저장 중':'저장  ↵'}
            </button>
          </div>
        </div>

        {/* 힌트 */}
        <div style={S.hintBar}>
          {item ? (
            <span>
              <span style={{color:'#94a3b8'}}>1SET 필요수량</span>
              <strong style={{color:'#1e40af', margin:'0 6px'}}>{item.needPerSet} EA</strong>
              {form.quantity > 0 && (
                <span style={{color:'#94a3b8'}}>
                  · 입고 수량 기준 <strong style={{color:'#059669'}}>{Math.floor(Number(form.quantity)/item.needPerSet).toLocaleString()} SET</strong> 분량
                </span>
              )}
            </span>
          ) : (
            <span style={{color:'#cbd5e1'}}>날짜 → 품목코드(숫자만 입력 가능) → 수량 → 메모 → Enter</span>
          )}
        </div>
      </div>

      {/* 기록 테이블 */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>입고 기록</span>
          <span style={S.cardSub}>총 {inbounds.length}건 · 행 클릭하면 수정</span>
        </div>
        <div style={{...S.tableWrap, }}>
          <table style={{...S.table, tableLayout:'fixed'}}>
            <colgroup>
              <col style={{width:100}}/>
              <col style={{width:70}}/>
              <col/>
              <col style={{width:100}}/>
              <col style={{width:'26%'}}/>
              <col style={{width:80}}/>
            </colgroup>
            <thead>
              <tr>
                {['날짜','코드','품목명','수량 (EA)','메모',''].map((h,i) => (
                  <th key={i} style={{...S.th, textAlign:i===3?'right':'left'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inbounds.map((tx,i) => {
                const isEdit = editId===tx.id
                return (
                  <tr key={tx.id}
                    style={{background:isEdit?'#eff6ff':i%2===0?'#f8fafc':'#fff', cursor:isEdit?'default':'pointer'}}
                    onClick={() => !isEdit && (setEditId(tx.id), setEditData({date:tx.date,itemCode:tx.itemCode,quantity:tx.quantity,memo:tx.memo||''}))}>
                    <td style={{...S.td,fontSize:12,color:'#475569'}}>
                      {isEdit ? <input type="text" value={editData.date} onChange={e=>setEditData({...editData,date:e.target.value})} style={S.tdInp}/> : tx.date}
                    </td>
                    <td style={S.td}>
                      {isEdit ? <input type="text" value={editData.itemCode} onChange={e=>setEditData({...editData,itemCode:e.target.value.toUpperCase()})} style={{...S.tdInp,width:60}}/> : <span style={S.codeTag}>{tx.itemCode}</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#374151'}}>
                      {isEdit ? ITEM_MAP[editData.itemCode]||'—' : tx.itemName}
                    </td>
                    <td style={{...S.td,textAlign:'right'}}>
                      {isEdit ? <input type="number" value={editData.quantity} onChange={e=>setEditData({...editData,quantity:e.target.value})} style={{...S.tdInp,textAlign:'right',width:80}}/> : <span style={{fontWeight:700}}>{tx.quantity.toLocaleString()}</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#64748b'}}>
                      {isEdit ? <input type="text" value={editData.memo} onChange={e=>setEditData({...editData,memo:e.target.value})} style={S.tdInp}/> : tx.memo||''}
                    </td>
                    <td style={S.td} onClick={e=>e.stopPropagation()}>
                      {isEdit ? (
                        <div style={{display:'flex',gap:4}}>
                          <button style={S.smSave} onClick={saveEdit}>저장</button>
                          <button style={S.smCancel} onClick={()=>setEditId(null)}>취소</button>
                        </div>
                      ) : (
                        <button style={S.smDel} disabled={deleting===tx.id} onClick={()=>deleteRow(tx.id)}>삭제</button>
                      )}
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
  wrap:      {display:'flex',flexDirection:'column',gap:12,height:'100%'},
  inputCard: {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',padding:'14px 18px',flexShrink:0},
  inputLabel:{fontSize:11,fontWeight:700,color:'#94a3b8',letterSpacing:1,textTransform:'uppercase',marginBottom:10},
  inputRow:  {display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'},
  field:     {display:'flex',flexDirection:'column',gap:4},
  label:     {fontSize:11,fontWeight:600,color:'#64748b',letterSpacing:0.3},
  inp:       {padding:'8px 11px',border:'1.5px solid #e2e8f0',borderRadius:7,fontSize:13,fontFamily:'inherit',outline:'none',color:'#1e293b'},
  saveBtn:   {padding:'9px 20px',color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'},
  hintBar:   {marginTop:8,fontSize:12,color:'#64748b',minHeight:16},
  suggest:     {position:'absolute',top:'100%',left:0,zIndex:200,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.1)',minWidth:300,marginTop:4},
  suggestItem: {padding:'8px 14px',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center'},
  card:      {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden'},
  cardHead:  {padding:'10px 16px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0},
  cardTitle: {fontSize:13,fontWeight:700,color:'#0f172a'},
  cardSub:   {fontSize:11,color:'#94a3b8'},
  tableWrap: {overflowY:'auto',flex:1},
  table:     {width:'100%',borderCollapse:'collapse'},
  th:        {background:'#1e293b',color:'#94a3b8',padding:'9px 12px',fontSize:11,fontWeight:700,position:'sticky',top:0,letterSpacing:0.5,whiteSpace:'nowrap'},
  td:        {padding:'7px 12px',fontSize:13,color:'#1e293b',borderBottom:'1px solid #f1f5f9',verticalAlign:'middle'},
  tdInp:     {padding:'4px 7px',border:'1.5px solid #3b82f6',borderRadius:4,fontSize:12,fontFamily:'inherit',outline:'none',width:'100%'},
  codeTag:   {background:'#eff6ff',color:'#1e40af',padding:'1px 7px',borderRadius:4,fontSize:11,fontWeight:800},
  smSave:    {padding:'4px 10px',background:'#1e40af',color:'#fff',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
  smCancel:  {padding:'4px 9px',background:'#f1f5f9',color:'#475569',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontFamily:'inherit'},
  smDel:     {padding:'4px 9px',background:'#fee2e2',color:'#dc2626',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
}
