import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import { ITEMS } from './data/items'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import InboundModal from './components/InboundModal'
import SetOutboundModal from './components/SetOutboundModal'

const NAV = [
  { id: 'dashboard', icon: '📊', label: '재고 현황' },
  { id: 'history',   icon: '📋', label: '입출고 이력' },
]

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'inbound' | 'setout'
  const [toast, setToast] = useState(null)

  // Firebase 실시간 리스너
  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => {
      console.error(err)
      setLoading(false)
    })
    return unsub
  }, [])

  // 재고 맵 (SET출고 모달에 전달)
  const stockMap = useMemo(() => {
    const map = {}
    for (const tx of transactions) {
      if (!map[tx.itemCode]) map[tx.itemCode] = 0
      map[tx.itemCode] += tx.type === '입고' ? tx.quantity : -tx.quantity
    }
    return map
  }, [transactions])

  const showToast = (msg, type='success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleModalClose = (saved, modalType) => {
    setModal(null)
    if (saved) {
      showToast(modalType === 'inbound' ? '입고 저장 완료!' : 'SET 출고 처리 완료!')
    }
  }

  return (
    <div style={S.root}>
      {/* 사이드바 */}
      <aside style={S.sidebar}>
        {/* 로고 */}
        <div style={S.logoArea}>
          <div style={S.logoBox}>
            <div style={S.logoIcon}>⚙</div>
          </div>
          <div>
            <div style={S.logoTitle}>INTS</div>
            <div style={S.logoSub}>CST 재고관리</div>
          </div>
        </div>

        {/* 입고/출고 버튼 */}
        <div style={S.sideActions}>
          <button style={S.sideIn} onClick={() => setModal('inbound')}>
            <span>📥</span> 입고 입력
          </button>
          <button style={S.sideOut} onClick={() => setModal('setout')}>
            <span>📦</span> SET 출고
          </button>
        </div>

        {/* 구분선 */}
        <div style={S.divider} />

        {/* 네비게이션 */}
        <nav style={S.nav}>
          {NAV.map(n => (
            <button key={n.id} style={page===n.id ? S.navActive : S.navItem}
              onClick={() => setPage(n.id)}>
              <span style={S.navIcon}>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        {/* 하단 정보 */}
        <div style={S.sideBottom}>
          <div style={S.sideInfo}>
            <div style={S.sideInfoDot} />
            <span>실시간 동기화 중</span>
          </div>
          <div style={S.sideVersion}>C-CST 재고관리 v1.0</div>
          <div style={S.sideVersion}>㈜아이엔티에스</div>
        </div>
      </aside>

      {/* 메인 컨텐츠 */}
      <main style={S.main}>
        {loading ? (
          <div style={S.loadingWrap}>
            <div style={S.loadingSpinner} />
            <div style={S.loadingText}>데이터 불러오는 중...</div>
          </div>
        ) : page === 'dashboard' ? (
          <Dashboard
            transactions={transactions}
            onInbound={() => setModal('inbound')}
            onSetOut={() => setModal('setout')}
          />
        ) : (
          <History transactions={transactions} />
        )}
      </main>

      {/* 모달 */}
      {modal === 'inbound' && (
        <InboundModal onClose={saved => handleModalClose(saved, 'inbound')} />
      )}
      {modal === 'setout' && (
        <SetOutboundModal stockMap={stockMap} onClose={saved => handleModalClose(saved, 'setout')} />
      )}

      {/* 토스트 알림 */}
      {toast && (
        <div style={toast.type==='success' ? S.toastOk : S.toastErr}>
          {toast.type==='success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  )
}

const S = {
  root: { display:'flex', height:'100vh', overflow:'hidden', background:'#f0f2f5' },

  // 사이드바
  sidebar: { width:220, background:'#0f172a', display:'flex', flexDirection:'column', flexShrink:0, color:'#fff' },
  logoArea: { padding:'24px 20px 20px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid #1e293b' },
  logoBox: { width:40,height:40,background:'linear-gradient(135deg,#3b82f6,#1d4ed8)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 },
  logoIcon: { fontSize:20 },
  logoTitle: { fontWeight:800, fontSize:16, color:'#fff', letterSpacing:1 },
  logoSub: { fontSize:11, color:'#64748b', marginTop:1 },

  sideActions: { padding:'16px 14px 8px', display:'flex', flexDirection:'column', gap:8 },
  sideIn: { display:'flex',alignItems:'center',gap:8,padding:'11px 14px',background:'#1e40af',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13,width:'100%' },
  sideOut: { display:'flex',alignItems:'center',gap:8,padding:'11px 14px',background:'#065f46',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13,width:'100%' },

  divider: { height:1, background:'#1e293b', margin:'8px 14px' },

  nav: { padding:'8px 10px', flex:1 },
  navItem: { display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 12px',background:'none',border:'none',color:'#94a3b8',cursor:'pointer',borderRadius:7,fontFamily:'inherit',fontWeight:500,fontSize:14,textAlign:'left',marginBottom:2 },
  navActive: { display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 12px',background:'#1e293b',border:'none',color:'#fff',cursor:'pointer',borderRadius:7,fontFamily:'inherit',fontWeight:700,fontSize:14,textAlign:'left',marginBottom:2 },
  navIcon: { fontSize:16, width:20, textAlign:'center' },

  sideBottom: { padding:'12px 16px 20px', borderTop:'1px solid #1e293b' },
  sideInfo: { display:'flex',alignItems:'center',gap:6,marginBottom:6 },
  sideInfoDot: { width:7,height:7,borderRadius:'50%',background:'#22c55e',flexShrink:0 },
  sideVersion: { fontSize:11, color:'#475569', marginTop:3 },

  // 메인
  main: { flex:1, overflowY:'auto' },

  // 로딩
  loadingWrap: { display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:16 },
  loadingSpinner: { width:36,height:36,border:'4px solid #e2e8f0',borderTop:'4px solid #1e40af',borderRadius:'50%',animation:'spin 0.8s linear infinite' },
  loadingText: { color:'#64748b',fontSize:14 },

  // 토스트
  toastOk: { position:'fixed',bottom:28,right:28,background:'#0f172a',color:'#fff',padding:'14px 22px',borderRadius:10,fontSize:14,fontWeight:600,boxShadow:'0 8px 24px rgba(0,0,0,0.25)',zIndex:2000,display:'flex',alignItems:'center',gap:8 },
  toastErr: { position:'fixed',bottom:28,right:28,background:'#dc2626',color:'#fff',padding:'14px 22px',borderRadius:10,fontSize:14,fontWeight:600,boxShadow:'0 8px 24px rgba(0,0,0,0.25)',zIndex:2000,display:'flex',alignItems:'center',gap:8 },
}
