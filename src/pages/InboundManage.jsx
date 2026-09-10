import { useState, useRef, useEffect } from 'react'
import { collection, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { writeLog } from '../utils/logger'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ITEMS } from '../data/items'
import ItemLookup from '../components/ItemLookup'

const ITEM_MAP = Object.fromEntries(ITEMS.map(i => [i.code, i.name]))

// 로컬 기준 오늘 (toISOString은 UTC라 밤에 하루 밀림)
const today = () => {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const parseDate = (v) => {
  const year = new Date().getFullYear()
  v = (v || '').trim().replace(/\./g, '/')
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (slash) return `${year}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`
  const mmdd = v.match(/^(\d{2})(\d{2})$/)
  if (mmdd) return `${year}-${mmdd[1]}-${mmdd[2]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return v
}

// 날짜 ±n일 (getFullYear/Month/Date 사용)
const shiftDate = (v, n) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parseDate(v))
  if (!m) return v
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)
  const p = x => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function InboundManage({ transactions }) {
  const inbounds = transactions
    .filter(t => t.type === '입고')
    .sort((a,b) => b.date.localeCompare(a.date) || (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))

  const [form, setForm]     = useState({ date: today(), itemCode:'', quantity:'', memo:'' })
  const [pending, setPending] = useState(0)
  const [saved,  setSaved]  = useState(false)
  const [err,    setErr]    = useState('')
  const { userData } = useAuth()

  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [deleting, setDel]  = useState(null)

  const [sugIdx, setSugIdx]   = useState(0)
  const [lookupOpen, setLookup] = useState(false)

  const dateRef = useRef(null)
  const codeRef = useRef(null)
  const qtyRef  = useRef(null)
  const memoRef = useRef(null)

  const setF = (k, v) => setForm(f => ({...f, [k]:v}))

  const item = ITEMS.find(i => i.code === form.itemCode.trim().toUpperCase())
  const isReady = form.date && item && form.quantity && Number(form.quantity) > 0

  // 자동완성 목록 (정확히 일치하면 표시하지 않음)
  const suggestions = (!item && form.itemCode.trim())
    ? ITEMS.filter(i => i.code.startsWith(form.itemCode.trim().toUpperCase())).slice(0, 6)
    : []

  // 진입 시 날짜에 포커스 (오늘 날짜가 채워져 있음)
  useEffect(() => { focusDate() }, [])
  useEffect(() => { setSugIdx(0) }, [form.itemCode])

  // 품목코드 정규화: 숫자만 입력하면 A 자동 추가
  const normalizeCode = (v) => {
    let val = (v || '').trim().toUpperCase()
    if (/^\d+$/.test(val)) val = 'A' + val
    return val
  }

  // 확정. setForm 은 항상 함수형으로 — 포커스 이동으로 blur 가 먼저 끼어들어도
  // 예전 값이 최신 값을 덮어쓰지 않게 한다.
  const finalizeCode = (v) => {
    const val = normalizeCode(v)
    setForm(f => ({ ...f, itemCode: val }))
    return ITEMS.find(i => i.code === val) || null
  }

  const finalizeCodeFromState = () => setForm(f => ({ ...f, itemCode: normalizeCode(f.itemCode) }))

  const pickSuggestion = (code) => {
    setF('itemCode', code)
    focusQty()
  }

  // 빈 칸이 있으면 저장 대신 그 칸으로 이동 (Enter 하나로 이동+저장)
  const focusMissing = () => {
    if (!form.date) { dateRef.current?.focus(); return true }
    if (!item)      { codeRef.current?.focus(); return true }
    if (!form.quantity || Number(form.quantity) <= 0) { qtyRef.current?.focus(); return true }
    return false
  }

  // 포커스는 반드시 동기적으로 옮긴다.
  // setTimeout 으로 미루면 빠르게 타이핑할 때 다음 글자가 이전 칸에 들어간다.
  const focusNow = (ref) => {
    const go = () => ref.current?.focus()
    go()
    requestAnimationFrame(go)
  }
  const focusCode = () => focusNow(codeRef)
  const focusQty  = () => focusNow(qtyRef)
  // 날짜는 포커스와 함께 전체 선택 — 바로 다른 날짜를 타이핑해 덮어쓸 수 있게
  const focusDate = () => {
    const go = () => { dateRef.current?.focus(); dateRef.current?.select() }
    go()
    requestAnimationFrame(go)
  }

  // 저장은 네트워크를 기다리지 않는다 — 입력칸을 바로 비우고 포커스를 되돌려
  // 다음 건을 곧바로 입력할 수 있게 하고, 실제 쓰기는 뒤에서 진행한다.
  const handleSave = (codeOverride) => {
    const code = (codeOverride || form.itemCode).trim().toUpperCase()
    const found = ITEMS.find(i => i.code === code)
    const dateVal = parseDate(form.date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) { setErr('날짜 형식을 확인하세요 (예: 7/5, 0705)'); dateRef.current?.focus(); return }
    if (!found || !form.quantity || Number(form.quantity) <= 0) return

    const snapshot = { ...form }
    const payload = {
      type:'입고', date:dateVal,
      itemCode:found.code, itemName:found.name,
      quantity:Number(form.quantity), memo:form.memo.trim(),
    }

    // 1) 화면부터 즉시 비우고 커서 복귀
    setErr('')
    setForm({ date:dateVal, itemCode:'', quantity:'', memo:'' })
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
    focusDate()

    // 2) 실제 저장은 뒤에서
    setPending(n => n + 1)
    ;(async () => {
      try {
        await addDoc(collection(db, 'transactions'), { ...payload, createdAt:serverTimestamp() })
        await writeLog({ action:'입력', target:'입고기록', docId:'',
          after:{ date:dateVal, itemCode:found.code, itemName:found.name, quantity:payload.quantity, memo:payload.memo },
          user: userData?.name||'알수없음' })
      } catch (e) {
        // 실패하면 입력값을 되돌려 다시 저장할 수 있게
        setErr(`저장 실패 (${found.code} ${payload.quantity}EA) — 입력값을 복구했습니다: ${e.message}`)
        setForm(snapshot)
        focusDate()
      } finally {
        setPending(n => Math.max(0, n - 1))
      }
    })()
  }

  // Enter = 저장. 빈 칸이 남아 있으면 저장 대신 그 칸으로 이동.
  const enterToSave = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    if (focusMissing()) return
    handleSave()
  }

  const onDateKeyDown = (e) => {
    if (e.key === 'ArrowUp')   { e.preventDefault(); setF('date', shiftDate(form.date,  1)); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setF('date', shiftDate(form.date, -1)); return }
    if (e.key === 'Enter') { setF('date', parseDate(form.date)) }
    enterToSave(e)
  }

  const onCodeKeyDown = (e) => {
    if (e.key === 'F2') { e.preventDefault(); setLookup(true); return }
    if (e.key === 'Escape') { e.preventDefault(); setF('itemCode', ''); return }

    if (suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSugIdx(i => Math.min(i + 1, suggestions.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSugIdx(i => Math.max(i - 1, 0)); return }
    }

    // Enter: 코드 확정 → 수량 비었으면 수량으로, 다 찼으면 저장
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      let found = finalizeCode(form.itemCode)
      if (!found && suggestions[sugIdx]) { pickSuggestion(suggestions[sugIdx].code); return }
      if (!found) { codeRef.current?.focus(); return }
      if (!form.quantity || Number(form.quantity) <= 0) { focusQty(); return }
      handleSave(found.code)
      return
    }

    // Tab: 코드 확정 후 다음 칸으로 (목록에서 고른 항목이 있으면 그걸로)
    if (e.key === 'Tab' && !e.shiftKey) {
      const found = finalizeCode(form.itemCode)
      if (!found && suggestions[sugIdx]) { e.preventDefault(); pickSuggestion(suggestions[sugIdx].code) }
      return
    }
  }

  const saveEdit = async () => {
    const before = inbounds.find(t => t.id === editId)
    const after = { date:parseDate(editData.date), itemCode:editData.itemCode, itemName:ITEM_MAP[editData.itemCode]||'', quantity:Number(editData.quantity), memo:editData.memo }
    await updateDoc(doc(db, 'transactions', editId), after)
    await writeLog({ action:'수정', target:'입고기록', docId:editId,
      before:{ date:before?.date, itemCode:before?.itemCode, quantity:before?.quantity, memo:before?.memo||'' },
      after, user:userData?.name||'알수없음' })
    setEditId(null)
  }

  const deleteRow = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return
    const target = inbounds.find(t => t.id === id)
    setDel(id)
    await writeLog({ action:'삭제', target:'입고기록', docId:id,
      before:{ date:target?.date, itemCode:target?.itemCode, quantity:target?.quantity }, user:userData?.name||'알수없음' })
    await deleteDoc(doc(db,'transactions',id))
    setDel(null)
  }

  const onEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); saveEdit() }
    if (e.key === 'Escape') { e.preventDefault(); setEditId(null) }
  }

  return (
    <div style={S.wrap}>

      {/* 입력 카드 */}
      <div style={S.inputCard}>
        <div style={S.inputLabel}>입고 등록</div>
        <div style={S.inputRow}>

          {/* 날짜 */}
          <div style={S.field}>
            <label style={S.label}>날짜 <span style={S.keyHint}>↑↓</span></label>
            <input ref={dateRef} type="text" value={form.date}
              onChange={e => setF('date', e.target.value)}
              onBlur={e => setF('date', parseDate(e.target.value))}
              onKeyDown={onDateKeyDown}
              placeholder="7/5 또는 0705"
              style={{...S.inp, width:130}} />
          </div>

          {/* 품목코드 */}
          <div style={{...S.field, flex:1}}>
            <label style={{...S.label, display:'flex', alignItems:'center', gap:8}}>
              <span>품목코드</span>
              <ItemLookup
                open={lookupOpen}
                onOpenChange={setLookup}
                onSelect={code => { setF('itemCode', code); focusQty() }} />
              {item && <span style={{color:'#16a34a', fontWeight:700, fontSize:11}}>→ {item.name}</span>}
              {form.itemCode && !item && <span style={{color:'#dc2626', fontSize:11}}>→ 없는 코드</span>}
            </label>
            <div style={{position:'relative'}}>
              <input ref={codeRef} type="text" value={form.itemCode}
                onChange={e => setF('itemCode', e.target.value.toUpperCase())}
                onKeyDown={onCodeKeyDown}
                onBlur={finalizeCodeFromState}
                placeholder="18 또는 A18"
                autoComplete="off"
                style={{...S.inp, width:150, borderColor: item?'#16a34a': form.itemCode?'#dc2626':'#e2e8f0'}} />
              {suggestions.length > 0 && (
                <div style={S.suggest}>
                  {suggestions.map((i, n) => (
                    <div key={i.code}
                      style={{...S.suggestItem, background: n === sugIdx ? '#dbeafe' : '#fff'}}
                      onMouseEnter={() => setSugIdx(n)}
                      onMouseDown={e => { e.preventDefault(); pickSuggestion(i.code) }}>
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
              onKeyDown={enterToSave}
              placeholder="0"
              style={{...S.inp, width:100, textAlign:'right', fontWeight:700, fontSize:15}} />
          </div>

          {/* 메모 */}
          <div style={{...S.field, flex:2}}>
            <label style={S.label}>메모 <span style={S.keyHint}>선택</span></label>
            <input ref={memoRef} type="text" value={form.memo}
              onChange={e => setF('memo', e.target.value)}
              onKeyDown={enterToSave}
              placeholder="메모 입력 (생략 가능)"
              style={{...S.inp, flex:1}} />
          </div>

          {/* 저장 */}
          <div style={{...S.field, justifyContent:'flex-end'}}>
            <label style={{...S.label, opacity:0}}>·</label>
            <button onClick={() => handleSave()} disabled={!isReady}
              style={{...S.saveBtn,
                background: saved?'#16a34a': isReady?'#1e40af':'#cbd5e1',
                cursor: isReady?'pointer':'not-allowed'}}>
              {saved?'✓ 저장됨':'저장  ↵'}
            </button>
          </div>
        </div>

        {/* 힌트 */}
        <div style={S.hintBar}>
          {pending > 0 && <span style={{color:'#94a3b8', marginRight:8}}>· 서버 저장 {pending}건 진행 중</span>}
          {err ? (
            <span style={{color:'#dc2626', fontWeight:700}}>{err}</span>
          ) : item ? (
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
            <span style={{color:'#94a3b8'}}>
              <b style={{color:'#64748b'}}>Tab</b> 다음 칸 · <b style={{color:'#64748b'}}>Enter</b> 저장 ·
              <b style={{color:'#64748b'}}> ↑↓</b> 코드 선택 / 날짜 증감 · <b style={{color:'#64748b'}}>F2</b> 품목조회 ·
              저장하면 날짜 칸으로 돌아갑니다 (날짜는 그대로 유지)
            </span>
          )}
        </div>
      </div>

      {/* 기록 테이블 */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>입고 기록</span>
          <span style={S.cardSub}>총 {inbounds.length}건 · 행 클릭하면 수정 (Enter 저장 · Esc 취소)</span>
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
                      {isEdit ? <input autoFocus type="text" value={editData.date} onKeyDown={onEditKeyDown} onChange={e=>setEditData({...editData,date:e.target.value})} style={S.tdInp}/> : tx.date}
                    </td>
                    <td style={S.td}>
                      {isEdit ? <input type="text" value={editData.itemCode} onKeyDown={onEditKeyDown} onChange={e=>setEditData({...editData,itemCode:e.target.value.toUpperCase()})} style={{...S.tdInp,width:60}}/> : <span style={S.codeTag}>{tx.itemCode}</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#374151'}}>
                      {isEdit ? ITEM_MAP[editData.itemCode]||'—' : tx.itemName}
                    </td>
                    <td style={{...S.td,textAlign:'right'}}>
                      {isEdit ? <input type="number" value={editData.quantity} onKeyDown={onEditKeyDown} onChange={e=>setEditData({...editData,quantity:e.target.value})} style={{...S.tdInp,textAlign:'right',width:80}}/> : <span style={{fontWeight:700}}>{tx.quantity.toLocaleString()}</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#64748b'}}>
                      {isEdit ? <input type="text" value={editData.memo} onKeyDown={onEditKeyDown} onChange={e=>setEditData({...editData,memo:e.target.value})} style={S.tdInp}/> : tx.memo||''}
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
  keyHint:   {fontSize:10,color:'#cbd5e1',fontWeight:700,marginLeft:2},
  inp:       {padding:'8px 11px',border:'1.5px solid #e2e8f0',borderRadius:7,fontSize:13,fontFamily:'inherit',outline:'none',color:'#1e293b'},
  saveBtn:   {padding:'9px 20px',color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'},
  hintBar:   {marginTop:8,fontSize:12,color:'#64748b',minHeight:16},
  suggest:     {position:'absolute',top:'100%',left:0,zIndex:200,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.1)',minWidth:300,marginTop:4,overflow:'hidden'},
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
