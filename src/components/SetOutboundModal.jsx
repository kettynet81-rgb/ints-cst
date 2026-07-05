import { useState } from 'react'
import { collection, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { ITEMS } from '../data/items'

export default function SetOutboundModal({ stockMap, onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [setQty, setSetQty] = useState('')
  const [step, setStep] = useState(1) // 1: 입력, 2: 미리보기 확인
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const qty = Number(setQty)

  // 미리보기 데이터 계산
  const preview = ITEMS.map(item => {
    const deduct = item.needPerSet * qty
    const current = stockMap[item.code] || 0
    const after = current - deduct
    return { ...item, deduct, current, after, shortage: after < 0 }
  })
  const hasShortage = preview.some(p => p.shortage)

  const handleNext = () => {
    setError('')
    if (!date || !qty || qty <= 0) {
      setError('날짜와 SET 수량을 입력하세요.')
      return
    }
    setStep(2)
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const batch = writeBatch(db)
      for (const item of ITEMS) {
        const ref = doc(collection(db, 'transactions'))
        batch.set(ref, {
          date,
          type: '출고',
          itemCode: item.code,
          itemName: item.name,
          quantity: item.needPerSet * qty,
          memo: `${qty}SET 출고`,
          createdAt: serverTimestamp(),
        })
      }
      await batch.commit()
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
            <div style={S.headerIcon}>📦</div>
            <div>
              <div style={S.headerTitle}>SET 출고</div>
              <div style={S.headerSub}>
                {step === 1 ? 'SET 수량 입력 → 자동 부품 차감' : `${qty}SET 출고 — 차감 내역 확인`}
              </div>
            </div>
          </div>
          <button style={S.closeBtn} onClick={() => onClose(false)}>✕</button>
        </div>

        {/* STEP 1: 입력 */}
        {step === 1 && (
          <div style={S.body}>
            {error && <div style={S.errorBox}>{error}</div>}
            <div style={S.row}>
              <label style={S.label}>출고 날짜</label>
              <input type="date" style={S.input} value={date}
                onChange={e => setDate(e.target.value)} />
            </div>
            <div style={S.row}>
              <label style={S.label}>출고 SET 수량</label>
              <input type="number" style={S.inputLarge} value={setQty} min="1"
                placeholder="0" onChange={e => setSetQty(e.target.value)} />
            </div>
            {qty > 0 && (
              <div style={S.previewHint}>
                입력 확인 후 <strong>다음 단계</strong>에서 전체 부품 차감 내역을 미리 확인할 수 있습니다.
              </div>
            )}
            <div style={S.footer}>
              <button style={S.cancelBtn} onClick={() => onClose(false)}>취소</button>
              <button style={S.nextBtn} onClick={handleNext}>차감 내역 확인 →</button>
            </div>
          </div>
        )}

        {/* STEP 2: 미리보기 */}
        {step === 2 && (
          <div>
            {hasShortage && (
              <div style={S.warnBox}>
                ⚠ 재고 부족 품목이 있습니다. 그래도 출고 처리할 경우 현재고가 음수가 됩니다.
              </div>
            )}
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr style={S.thead}>
                    <th style={S.th}>코드</th>
                    <th style={S.th}>품목명</th>
                    <th style={{...S.th,...S.num}}>현재고</th>
                    <th style={{...S.th,...S.num}}>차감</th>
                    <th style={{...S.th,...S.num}}>출고 후</th>
                    <th style={S.th}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={p.code} style={i%2===0 ? S.trEven : S.trOdd}>
                      <td style={{...S.td,...S.code}}>{p.code}</td>
                      <td style={S.td}>{p.name}</td>
                      <td style={{...S.td,...S.num}}>{p.current.toLocaleString()}</td>
                      <td style={{...S.td,...S.num,color:'#dc2626',fontWeight:600}}>-{p.deduct.toLocaleString()}</td>
                      <td style={{...S.td,...S.num,fontWeight:700,color: p.shortage ? '#dc2626' : '#16a34a'}}>
                        {p.after.toLocaleString()}
                      </td>
                      <td style={S.td}>
                        {p.shortage
                          ? <span style={S.badgeRed}>재고부족</span>
                          : <span style={S.badgeGreen}>정상</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <div style={{...S.errorBox,margin:'0 20px 12px'}}>{error}</div>}
            <div style={S.footer}>
              <button style={S.cancelBtn} onClick={() => setStep(1)}>← 수정</button>
              <button style={saving ? S.saveBtnDis : S.saveBtn}
                onClick={handleConfirm} disabled={saving}>
                {saving ? '처리 중...' : `${qty}SET 출고 확정`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20 },
  modal: { background:'#fff',borderRadius:12,width:'100%',maxWidth:700,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',overflow:'hidden' },
  header: { background:'#065f46',padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 },
  headerLeft: { display:'flex',alignItems:'center',gap:12 },
  headerIcon: { fontSize:28 },
  headerTitle: { color:'#fff',fontWeight:700,fontSize:17 },
  headerSub: { color:'#6ee7b7',fontSize:12,marginTop:2 },
  closeBtn: { background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',width:32,height:32,borderRadius:6,cursor:'pointer',fontSize:16 },
  body: { padding:'24px 24px 0' },
  warnBox: { background:'#fef3c7',color:'#92400e',padding:'12px 20px',fontSize:13,fontWeight:500,borderBottom:'1px solid #fde68a',flexShrink:0 },
  errorBox: { background:'#fee2e2',color:'#991b1b',padding:'10px 14px',borderRadius:6,fontSize:13,marginBottom:16 },
  row: { marginBottom:18 },
  label: { display:'block',fontSize:13,fontWeight:600,color:'#374151',marginBottom:6 },
  input: { width:'100%',padding:'10px 12px',border:'1.5px solid #d1d5db',borderRadius:6,fontSize:14,outline:'none',fontFamily:'inherit' },
  inputLarge: { width:'100%',padding:'14px 16px',border:'2px solid #d1d5db',borderRadius:8,fontSize:24,fontWeight:700,textAlign:'center',outline:'none',fontFamily:'inherit',color:'#111' },
  previewHint: { background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:6,padding:'10px 14px',fontSize:13,color:'#166534',marginBottom:16 },
  tableWrap: { overflowY:'auto',maxHeight:'calc(90vh - 220px)',flexShrink:1 },
  table: { width:'100%',borderCollapse:'collapse' },
  thead: {},
  th: { background:'#1e293b',color:'#fff',padding:'10px 12px',fontSize:12,fontWeight:600,textAlign:'left',position:'sticky',top:0 },
  num: { textAlign:'right' },
  trEven: { background:'#f8fafc' },
  trOdd:  { background:'#fff' },
  td: { padding:'8px 12px',fontSize:13,color:'#111',borderBottom:'1px solid #f1f5f9' },
  code: { fontWeight:700,color:'#1e40af' },
  badgeRed: { background:'#fee2e2',color:'#dc2626',padding:'2px 8px',borderRadius:12,fontSize:11,fontWeight:600 },
  badgeGreen: { background:'#dcfce7',color:'#16a34a',padding:'2px 8px',borderRadius:12,fontSize:11,fontWeight:600 },
  footer: { padding:'16px 24px',borderTop:'1px solid #f3f4f6',display:'flex',justifyContent:'flex-end',gap:10,flexShrink:0 },
  cancelBtn: { padding:'10px 20px',border:'1.5px solid #d1d5db',borderRadius:6,background:'#fff',color:'#374151',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:14 },
  nextBtn: { padding:'10px 24px',border:'none',borderRadius:6,background:'#065f46',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:14 },
  saveBtn: { padding:'10px 24px',border:'none',borderRadius:6,background:'#065f46',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:14 },
  saveBtnDis: { padding:'10px 24px',border:'none',borderRadius:6,background:'#6ee7b7',color:'#fff',cursor:'not-allowed',fontFamily:'inherit',fontWeight:700,fontSize:14 },
}
