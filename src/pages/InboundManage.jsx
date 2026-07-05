import { useState, useRef, useEffect } from 'react'
import { collection, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { ITEMS } from '../data/items'

const ITEM_MAP  = Object.fromEntries(ITEMS.map(i => [i.code, i.name]))
const today = () => new Date().toISOString().slice(0,10)

export default function InboundManage({ transactions }) {
  const inbounds = transactions
    .filter(t => t.type === '입고')
    .sort((a,b) => b.date.localeCompare(a.date) || (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))

  const [form, setForm]     = useState({ date: today(), itemCode:'', quantity:'', memo:'' })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [mode,   setMode]   = useState('text') // 'text' | 'select'

  const dateRef = useRef(null)
  const codeRef = useRef(null)
  const qtyRef  = useRef(null)
  const memoRef = useRef(null)

  const [editId, setEditId]     = useState(null)
  const [editData, setEditData] = useState({})
  const [deleting, setDeleting] = useState(null)

  const setF = (k, v) => setForm(f => ({...f, [k]: v}))

  const foundItem = ITEMS.find(i => i.code.toUpperCase() === form.itemCode.toUpperCase())

  const handleSave = async () => {
    if (!form.date || !foundItem || !form.quantity || Number(form.quantity) <= 0) return
    setSaving(true)
    await addDoc(collection(db, 'transactions'), {
      type: '입고',
      date: form.date,
      itemCode: foundItem.code,
      itemName: foundItem.name,
      quantity: Number(form.quantity),
      memo: form.memo.trim(),
      createdAt: serverTimestamp(),
    })
    setForm({ date: today(), itemCode:'', quantity:'', memo:'' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    // 코드 입력칸으로 포커스
    setTimeout(() => codeRef.current?.focus(), 50)
  }

  const handleKeyDown = (e, nextRef) => {
    if (e.key === 'Enter') {
      if (nextRef) nextRef.current?.focus()
      else handleSave()
    }
  }

  // 코드 입력 시 대문자 변환 + 매칭되면 수량으로 이동
  const handleCodeChange = (v) => {
    const upper = v.toUpperCase()
    setF('itemCode', upper)
    const match = ITEMS.find(i => i.code === upper)
    if (match) setTimeout(() => qtyRef.current?.focus(), 50)
  }

  const startEdit = (tx) => {
    setEditId(tx.id)
    setEditData({ date: tx.date, itemCode: tx.itemCode, quantity: tx.quantity, memo: tx.memo||'' })
  }
  const saveEdit = async () => {
    const item = ITEM_MAP[editData.itemCode]
    await updateDoc(doc(db, 'transactions', editId), {
      date: editData.date,
      itemCode: editData.itemCode,
      itemName: item || '',
      quantity: Number(editData.quantity),
      memo: editData.memo,
    })
    setEditId(null)
  }
  const deleteRow = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return
    setDeleting(id)
    await deleteDoc(doc(db, 'transactions', id))
    setDeleting(null)
  }

  const isReady = form.date && foundItem && form.quantity && Number(form.quantity) > 0

  return (
    <div style={S.wrap}>

      {/* ── 입력 카드 ── */}
      <div style={S.inputCard}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div style={S.inputLabel}>입고 등록</div>
          {/* 모드 토글 */}
          <div style={S.modeToggle}>
            <button style={mode==='text' ? S.modeActive : S.modeBtn} onClick={()=>setMode('text')}>
              ⌨ 직접 입력
            </button>
            <button style={mode==='select' ? S.modeActive : S.modeBtn} onClick={()=>setMode('select')}>
              ☰ 선택 입력
            </button>
          </div>
        </div>

        <div style={S.inputRow}>
          {/* 날짜 */}
          <div style={S.field}>
            <label style={S.label}>날짜</label>
            {mode === 'text' ? (
              <input ref={dateRef} type="text" value={form.date}
                onChange={e => setF('date', e.target.value)}
                onKeyDown={e => handleKeyDown(e, codeRef)}
                placeholder="2026-07-05"
                style={{...S.inp, width:130}}
              />
            ) : (
              <input type="date" value={form.date}
                onChange={e => setF('date', e.target.value)}
                style={{...S.inp, width:150}}
              />
            )}
          </div>

          {/* 품목 */}
          <div style={{...S.field, flex:2}}>
            <label style={S.label}>
              품목코드
              {foundItem && <span style={S.foundName}> → {foundItem.name}</span>}
              {form.itemCode && !foundItem && <span style={S.notFound}> → 없는 코드</span>}
            </label>
            {mode === 'text' ? (
              <div style={{position:'relative'}}>
                <input ref={codeRef} type="text" value={form.itemCode}
                  onChange={e => handleCodeChange(e.target.value)}
                  onKeyDown={e => handleKeyDown(e, foundItem ? qtyRef : null)}
                  placeholder="A1, A8, A16 ..."
                  style={{...S.inp, width:160, textTransform:'uppercase',
                    borderColor: foundItem ? '#16a34a' : form.itemCode ? '#dc2626' : '#e2e8f0'}}
                />
                {/* 자동완성 드롭다운 힌트 */}
                {form.itemCode && !foundItem && (
                  <div style={S.suggest}>
                    {ITEMS.filter(i => i.code.startsWith(form.itemCode.toUpperCase())).slice(0,5).map(i => (
                      <div key={i.code} style={S.suggestItem}
                        onMouseDown={() => { setF('itemCode', i.code); setTimeout(() => qtyRef.current?.focus(), 50) }}>
                        <span style={{fontWeight:700,color:'#1e40af',marginRight:8}}>{i.code}</span>
                        <span style={{fontSize:12,color:'#64748b'}}>{i.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <select value={form.itemCode} onChange={e => setF('itemCode', e.target.value)}
                style={{...S.inp, width:280}}>
                <option value="">-- 품목 선택 --</option>
                {ITEMS.map(i => (
                  <option key={i.code} value={i.code}>[{i.code}]  {i.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* 수량 */}
          <div style={S.field}>
            <label style={S.label}>수량 (EA)</label>
            <input ref={qtyRef} type="number" min="1" value={form.quantity}
              onChange={e => setF('quantity', e.target.value)}
              onKeyDown={e => handleKeyDown(e, memoRef)}
              placeholder="0"
              style={{...S.inp, width:100, textAlign:'right', fontWeight:700, fontSize:15}}
            />
          </div>

          {/* 메모 */}
          <div style={{...S.field, flex:2}}>
            <label style={S.label}>메모 <span style={{fontWeight:400,color:'#94a3b8'}}>(선택)</span></label>
            <input ref={memoRef} type="text" value={form.memo}
              onChange={e => setF('memo', e.target.value)}
              onKeyDown={e => handleKeyDown(e, null)}
              placeholder="좌 150 / 우 150 등"
              style={{...S.inp, flex:1}}
            />
          </div>

          {/* 저장 */}
          <div style={{...S.field, justifyContent:'flex-end'}}>
            <label style={{...S.label, opacity:0}}>·</label>
            <button onClick={handleSave} disabled={!isReady || saving}
              style={{...S.saveBtn,
                background: saved ? '#16a34a' : isReady ? '#1e40af' : '#cbd5e1',
                cursor: isReady ? 'pointer' : 'not-allowed'}}>
              {saved ? '✓ 저장됨' : saving ? '저장 중' : '저장  ↵'}
            </button>
          </div>
        </div>

        {/* 힌트 바 */}
        <div style={S.hintBar}>
          {foundItem ? (
            <span>
              <span style={{color:'#94a3b8'}}>1SET 필요수량</span>
              <strong style={{color:'#1e40af',margin:'0 6px'}}>{foundItem.needPerSet} EA</strong>
              {form.quantity > 0 && (
                <span style={{color:'#94a3b8'}}>
                  · 입고 수량 기준 <strong style={{color:'#059669'}}>{Math.floor(Number(form.quantity)/foundItem.needPerSet).toLocaleString()} SET</strong> 분량
                </span>
              )}
            </span>
          ) : (
            <span style={{color:'#cbd5e1'}}>
              {mode === 'text' ? '⌨  날짜 → 품목코드(A1~A29) → 수량 → 메모 순서로 입력 후 Enter' : '품목을 선택하세요'}
            </span>
          )}
        </div>
      </div>

      {/* ── 기록 테이블 ── */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>입고 기록</span>
          <span style={S.cardSub}>총 {inbounds.length}건 · 행 클릭하면 수정</span>
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {['날짜','코드','품목명','수량 (EA)','메모',''].map((h,i) => (
                  <th key={i} style={{...S.th, textAlign:i===3?'right':'left',
                    width:i===0?110:i===1?70:i===3?100:i===5?80:'auto'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inbounds.map((tx, i) => {
                const isEdit = editId === tx.id
                return (
                  <tr key={tx.id}
                    style={{background: isEdit?'#eff6ff':i%2===0?'#f8fafc':'#fff', cursor:isEdit?'default':'pointer'}}
                    onClick={() => !isEdit && startEdit(tx)}>
                    <td style={{...S.td,fontSize:12,color:'#475569'}}>
                      {isEdit
                        ? <input type="text" value={editData.date} onChange={e=>setEditData({...editData,date:e.target.value})} style={S.tdInp}/>
                        : tx.date}
                    </td>
                    <td style={S.td}>
                      {isEdit
                        ? <input type="text" value={editData.itemCode} onChange={e=>setEditData({...editData,itemCode:e.target.value.toUpperCase()})} style={{...S.tdInp,width:60,textTransform:'uppercase'}}/>
                        : <span style={S.codeTag}>{tx.itemCode}</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#374151'}}>
                      {isEdit ? ITEM_MAP[editData.itemCode]||'—' : tx.itemName}
                    </td>
                    <td style={{...S.td,textAlign:'right'}}>
                      {isEdit
                        ? <input type="number" value={editData.quantity} onChange={e=>setEditData({...editData,quantity:e.target.value})} style={{...S.tdInp,textAlign:'right',width:80}}/>
                        : <span style={{fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{tx.quantity.toLocaleString()}</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#64748b'}}>
                      {isEdit
                        ? <input type="text" value={editData.memo} onChange={e=>setEditData({...editData,memo:e.target.value})} style={S.tdInp}/>
                        : tx.memo||''}
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
  wrap: {display:'flex',flexDirection:'column',gap:16,height:'100%'},

  inputCard:  {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',padding:'16px 20px'},
  inputLabel: {fontSize:11,fontWeight:700,color:'#94a3b8',letterSpacing:1,textTransform:'uppercase'},

  modeToggle: {display:'flex',gap:0,border:'1px solid #e2e8f0',borderRadius:7,overflow:'hidden'},
  modeBtn:    {padding:'6px 14px',background:'#fff',border:'none',color:'#64748b',cursor:'pointer',fontSize:12,fontFamily:'inherit'},
  modeActive: {padding:'6px 14px',background:'#1e40af',border:'none',color:'#fff',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:700},

  inputRow:  {display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'},
  field:     {display:'flex',flexDirection:'column',gap:5},
  label:     {fontSize:11,fontWeight:600,color:'#64748b',letterSpacing:0.3},
  foundName: {color:'#16a34a',fontWeight:700,fontSize:11},
  notFound:  {color:'#dc2626',fontWeight:700,fontSize:11},
  inp:       {padding:'8px 11px',border:'1.5px solid #e2e8f0',borderRadius:7,fontSize:13,fontFamily:'inherit',outline:'none',color:'#1e293b',transition:'border 0.1s'},
  saveBtn:   {padding:'9px 22px',color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap',transition:'background 0.15s'},

  suggest:     {position:'absolute',top:'100%',left:0,zIndex:100,background:'#fff',border:'1px solid #e2e8f0',borderRadius:7,boxShadow:'0 4px 16px rgba(0,0,0,0.1)',minWidth:280,marginTop:4},
  suggestItem: {padding:'8px 14px',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center'},

  hintBar: {marginTop:10,fontSize:12,color:'#64748b',minHeight:18},

  card:     {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden'},
  cardHead: {padding:'12px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0},
  cardTitle:{fontSize:13,fontWeight:700,color:'#0f172a'},
  cardSub:  {fontSize:11,color:'#94a3b8'},
  tableWrap:{overflowY:'auto',flex:1},
  table:    {width:'100%',borderCollapse:'collapse'},
  th:       {background:'#1e293b',color:'#94a3b8',padding:'9px 14px',fontSize:11,fontWeight:700,position:'sticky',top:0,letterSpacing:0.8,whiteSpace:'nowrap'},
  td:       {padding:'7px 14px',fontSize:13,color:'#1e293b',borderBottom:'1px solid #f1f5f9',verticalAlign:'middle'},
  tdInp:    {padding:'4px 7px',border:'1.5px solid #3b82f6',borderRadius:4,fontSize:12,fontFamily:'inherit',outline:'none',width:'100%'},
  codeTag:  {background:'#eff6ff',color:'#1e40af',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:800},
  smSave:   {padding:'4px 10px',background:'#1e40af',color:'#fff',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
  smCancel: {padding:'4px 9px',background:'#f1f5f9',color:'#475569',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontFamily:'inherit'},
  smDel:    {padding:'4px 9px',background:'#fee2e2',color:'#dc2626',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
}
