import { useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { ITEMS } from '../data/items'

export default function InboundModal({ onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [itemCode, setItemCode] = useState('')
  const [qty, setQty] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedItem = ITEMS.find(i => i.code === itemCode)

  const handleSave = async () => {
    setError('')
    if (!date || !itemCode || !qty || Number(qty) <= 0) {
      setError('날짜 · 품목 · 수량은 필수입력입니다.')
      return
    }
    setSaving(true)
    try {
      await addDoc(collection(db, 'transactions'), {
        date,
        type: '입고',
        itemCode,
        itemName: selectedItem?.name || '',
        quantity: Number(qty),
        memo: memo.trim(),
        createdAt: serverTimestamp(),
      })
      onClose(true)
    } catch (e) {
      setError('저장 실패: ' + e.message)
      setSaving(false)
    }
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        {/* 헤더 */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <div style={S.headerIcon}>📥</div>
            <div>
              <div style={S.headerTitle}>입고 입력</div>
              <div style={S.headerSub}>부품 입고 수량을 기록합니다</div>
            </div>
          </div>
          <button style={S.closeBtn} onClick={() => onClose(false)}>✕</button>
        </div>

        {/* 폼 */}
        <div style={S.body}>
          {error && <div style={S.errorBox}>{error}</div>}

          <div style={S.row}>
            <label style={S.label}>입고 날짜</label>
            <input type="date" style={S.input} value={date}
              onChange={e => setDate(e.target.value)} />
          </div>

          <div style={S.row}>
            <label style={S.label}>품목 선택</label>
            <select style={S.input} value={itemCode}
              onChange={e => setItemCode(e.target.value)}>
              <option value="">-- 품목을 선택하세요 --</option>
              {ITEMS.map(item => (
                <option key={item.code} value={item.code}>
                  [{item.code}] {item.name}
                </option>
              ))}
            </select>
          </div>

          {selectedItem && (
            <div style={S.infoBox}>
              <span style={S.infoLabel}>1SET 필요수량</span>
              <span style={S.infoValue}>{selectedItem.needPerSet} EA</span>
            </div>
          )}

          <div style={S.row}>
            <label style={S.label}>입고 수량 (EA)</label>
            <input type="number" style={S.input} value={qty} min="1"
              placeholder="0" onChange={e => setQty(e.target.value)} />
          </div>

          <div style={S.row}>
            <label style={S.label}>메모 <span style={S.optional}>(선택)</span></label>
            <input type="text" style={S.input} value={memo}
              placeholder="좌 150 / 우 150 등"
              onChange={e => setMemo(e.target.value)} />
          </div>
        </div>

        {/* 푸터 */}
        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={() => onClose(false)}>취소</button>
          <button style={saving ? S.saveBtnDis : S.saveBtn}
            onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '입고 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000 },
  modal: { background:'#fff',borderRadius:12,width:480,boxShadow:'0 20px 60px rgba(0,0,0,0.3)',overflow:'hidden' },
  header: { background:'#1e40af',padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between' },
  headerLeft: { display:'flex',alignItems:'center',gap:12 },
  headerIcon: { fontSize:28 },
  headerTitle: { color:'#fff',fontWeight:700,fontSize:17 },
  headerSub: { color:'#bfdbfe',fontSize:12,marginTop:2 },
  closeBtn: { background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',width:32,height:32,borderRadius:6,cursor:'pointer',fontSize:16 },
  body: { padding:'24px 24px 8px' },
  errorBox: { background:'#fee2e2',color:'#991b1b',padding:'10px 14px',borderRadius:6,fontSize:13,marginBottom:16 },
  row: { marginBottom:16 },
  label: { display:'block',fontSize:13,fontWeight:600,color:'#374151',marginBottom:6 },
  optional: { fontWeight:400,color:'#9ca3af',fontSize:12 },
  input: { width:'100%',padding:'10px 12px',border:'1.5px solid #d1d5db',borderRadius:6,fontSize:14,color:'#111',outline:'none',fontFamily:'inherit' },
  infoBox: { background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'10px 14px',marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center' },
  infoLabel: { fontSize:13,color:'#1d4ed8' },
  infoValue: { fontWeight:700,color:'#1d4ed8',fontSize:15 },
  footer: { padding:'16px 24px',borderTop:'1px solid #f3f4f6',display:'flex',justifyContent:'flex-end',gap:10 },
  cancelBtn: { padding:'10px 20px',border:'1.5px solid #d1d5db',borderRadius:6,background:'#fff',color:'#374151',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:14 },
  saveBtn: { padding:'10px 24px',border:'none',borderRadius:6,background:'#1e40af',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:14 },
  saveBtnDis: { padding:'10px 24px',border:'none',borderRadius:6,background:'#93c5fd',color:'#fff',cursor:'not-allowed',fontFamily:'inherit',fontWeight:700,fontSize:14 },
}
