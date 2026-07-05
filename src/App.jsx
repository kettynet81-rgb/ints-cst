import { useState, useEffect, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PendingPage from './pages/PendingPage'
import InboundModal from './components/InboundModal'
import SetOutboundModal from './components/SetOutboundModal'

function MainApp() {
  const { currentUser, userRole, userData, logout } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!currentUser || userRole !== 'approved' && userRole !== 'admin') return
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [currentUser, userRole])

  const stockMap = useMemo(() => {
    const map = {}
    for (const tx of transactions) {
      if (!map[tx.itemCode]) map[tx.itemCode] = 0
      map[tx.itemCode] += tx.type === '입고' ? tx.quantity : -tx.quantity
    }
    return map
  }, [transactions])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const NAV = [
    { id:'dashboard', icon:'📊', label:'재고 현황' },
    { id:'history',   icon:'📋', label:'입출고 이력' },
    ...(userRole === 'admin' ? [{ id:'admin', icon:'👤', label:'사용자 관리' }] : []),
  ]

  return (
    <div style={S.root}>
      {/* 사이드바 */}
      <aside style={S.sidebar}>
        <div style={S.logoArea}>
          <div style={S.logoBox}>⚙</div>
          <div>
            <div style={S.logoTitle}>INTS</div>
            <div style={S.logoSub}>CST 재고관리</div>
          </div>
        </div>

        <div style={S.sideActions}>
          <button style={S.btnIn} onClick={()=>setModal('inbound')}>📥 입고 입력</button>
          <button style={S.btnOut} onClick={()=>setModal('setout')}>📦 SET 출고</button>
        </div>

        <div style={S.divider}/>

        <nav style={S.nav}>
          {NAV.map(n => (
            <button key={n.id} style={page===n.id ? S.navActive : S.navItem} onClick={()=>setPage(n.id)}>
              <span>{n.icon}</span><span>{n.label}</span>
            </button>
          ))}
        </nav>

        <div style={S.sideBottom}>
          <div style={S.userInfo}>
            <div style={S.userDot}/>
            <span>{userData?.name || currentUser?.email}</span>
          </div>
          <button onClick={logout} style={S.logoutBtn}>로그아웃</button>
        </div>
      </aside>

      {/* 메인 */}
      <main style={S.main}>
        {loading ? (
          <div style={S.loadWrap}><div style={{color:"#64748b"}}>데이터 불러오는 중...</div></div>
        ) : page === 'dashboard' ? (
          <Dashboard transactions={transactions} onInbound={()=>setModal('inbound')} onSetOut={()=>setModal('setout')} />
        ) : page === 'history' ? (
          <History transactions={transactions} />
        ) : page === 'admin' ? (
          <AdminPage />
        ) : null}
      </main>

      {modal === 'inbound' && <InboundModal onClose={saved=>{setModal(null);if(saved)showToast('입고 저장 완료!')}} />}
      {modal === 'setout' && <SetOutboundModal stockMap={stockMap} onClose={saved=>{setModal(null);if(saved)showToast('SET 출고 처리 완료!')}} />}
      {toast && <div style={S.toast}>✅ {toast}</div>}
    </div>
  )
}

function AuthRouter() {
  const { currentUser, userRole } = useAuth()

  if (!currentUser) return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  )

  if (userRole === 'pending') return (
    <Routes>
      <Route path="*" element={<PendingPage />} />
    </Routes>
  )

  return (
    <Routes>
      <Route path="*" element={<MainApp />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthRouter />
      </AuthProvider>
    </BrowserRouter>
  )
}

const S = {
  root: {display:'flex',height:'100vh',overflow:'hidden'},
  sidebar: {width:220,background:'#0f172a',display:'flex',flexDirection:'column',flexShrink:0},
  logoArea: {padding:'22px 18px 18px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid #1e293b'},
  logoBox: {width:38,height:38,background:'linear-gradient(135deg,#3b82f6,#1d4ed8)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0},
  logoTitle: {fontWeight:800,fontSize:15,color:'#fff'},
  logoSub: {fontSize:11,color:'#64748b',marginTop:1},
  sideActions: {padding:'14px 12px 6px',display:'flex',flexDirection:'column',gap:8},
  btnIn: {display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'#1e40af',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13,width:'100%'},
  btnOut: {display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'#065f46',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13,width:'100%'},
  divider: {height:1,background:'#1e293b',margin:'6px 12px'},
  nav: {padding:'6px 8px',flex:1},
  navItem: {display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 12px',background:'none',border:'none',color:'#94a3b8',cursor:'pointer',borderRadius:7,fontFamily:'inherit',fontWeight:500,fontSize:13,textAlign:'left',marginBottom:2},
  navActive: {display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 12px',background:'#1e293b',border:'none',color:'#fff',cursor:'pointer',borderRadius:7,fontFamily:'inherit',fontWeight:700,fontSize:13,textAlign:'left',marginBottom:2},
  sideBottom: {padding:'10px 14px 18px',borderTop:'1px solid #1e293b'},
  userInfo: {display:'flex',alignItems:'center',gap:6,marginBottom:8},
  userDot: {width:7,height:7,borderRadius:'50%',background:'#22c55e',flexShrink:0},
  logoutBtn: {width:'100%',padding:'8px',background:'#1e293b',color:'#94a3b8',border:'none',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontSize:12},
  main: {flex:1,overflowY:'auto',background:'#f0f2f5'},
  loadWrap: {display:'flex',alignItems:'center',justifyContent:'center',height:'100%'},
  toast: {position:'fixed',bottom:28,right:28,background:'#0f172a',color:'#fff',padding:'13px 20px',borderRadius:10,fontSize:14,fontWeight:600,boxShadow:'0 8px 24px rgba(0,0,0,0.25)',zIndex:2000},
}
