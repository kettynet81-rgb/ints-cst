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
  const [sideCollapsed, setSideCollapsed] = useState(false)

  useEffect(() => {
    if (!currentUser) return
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'))
    return onSnapshot(q, snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [currentUser])

  const stockMap = useMemo(() => {
    const map = {}
    for (const tx of transactions) {
      if (!map[tx.itemCode]) map[tx.itemCode] = 0
      map[tx.itemCode] += tx.type === '입고' ? tx.quantity : -tx.quantity
    }
    return map
  }, [transactions])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const NAV_GROUPS = [
    {
      label: '재고관리',
      items: [
        { id: 'dashboard', icon: '◈', label: '재고 현황' },
        { id: 'history',   icon: '≡', label: '입출고 이력' },
      ]
    },
    ...(userRole === 'admin' ? [{
      label: '시스템',
      items: [{ id: 'admin', icon: '◉', label: '사용자 관리' }]
    }] : [])
  ]

  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'short' })

  return (
    <div style={S.root}>
      {/* 사이드바 */}
      <aside style={{...S.sidebar, width: sideCollapsed ? 64 : 220}}>
        {/* 로고 */}
        <div style={S.logoArea}>
          <div style={S.logoMark}>
            <span style={{fontSize:16,fontWeight:900,color:'#fff',letterSpacing:-1}}>IN</span>
          </div>
          {!sideCollapsed && (
            <div style={{minWidth:0}}>
              <div style={S.logoTitle}>INTS</div>
              <div style={S.logoSub}>CST 재고관리</div>
            </div>
          )}
          <button style={S.collapseBtn} onClick={() => setSideCollapsed(!sideCollapsed)}>
            {sideCollapsed ? '›' : '‹'}
          </button>
        </div>

        {/* 액션 버튼 */}
        {!sideCollapsed && (
          <div style={S.actionArea}>
            <button style={S.btnIn} onClick={() => setModal('inbound')}>
              <span>↑</span> 입고 입력
            </button>
            <button style={S.btnOut} onClick={() => setModal('setout')}>
              <span>↓</span> SET 출고
            </button>
          </div>
        )}
        {sideCollapsed && (
          <div style={{padding:'12px 8px',display:'flex',flexDirection:'column',gap:6}}>
            <button title="입고 입력" style={{...S.iconBtn,background:'#1e40af'}} onClick={() => setModal('inbound')}>↑</button>
            <button title="SET 출고" style={{...S.iconBtn,background:'#065f46'}} onClick={() => setModal('setout')}>↓</button>
          </div>
        )}

        {/* 구분선 */}
        <div style={S.divider} />

        {/* 네비게이션 */}
        <nav style={{flex:1,padding:'4px 8px',overflowY:'auto'}}>
          {NAV_GROUPS.map(g => (
            <div key={g.label} style={{marginBottom:16}}>
              {!sideCollapsed && (
                <div style={S.navGroupLabel}>{g.label}</div>
              )}
              {g.items.map(item => (
                <button key={item.id}
                  style={page === item.id ? S.navActive : S.navItem}
                  onClick={() => setPage(item.id)}
                  title={item.label}>
                  <span style={S.navIcon}>{item.icon}</span>
                  {!sideCollapsed && <span>{item.label}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* 하단 사용자 */}
        <div style={S.sideFooter}>
          <div style={S.sideStatus}>
            <div style={S.statusDot} />
            {!sideCollapsed && <span style={{fontSize:11,color:'#64748b'}}>실시간 연결됨</span>}
          </div>
          {!sideCollapsed && (
            <div style={S.userRow}>
              <div style={S.userAvatar}>{userData?.name?.[0] || 'U'}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:'#e2e8f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userData?.name}</div>
                <div style={{fontSize:10,color:'#64748b'}}>{userRole === 'admin' ? '관리자' : '사용자'}</div>
              </div>
              <button onClick={logout} style={S.logoutBtn} title="로그아웃">⏻</button>
            </div>
          )}
        </div>
      </aside>

      {/* 메인 영역 */}
      <div style={S.mainWrap}>
        {/* 상단 헤더 */}
        <header style={S.header}>
          <div style={S.headerLeft}>
            <div style={S.breadcrumb}>
              <span style={{color:'#94a3b8'}}>CST 재고관리</span>
              <span style={{color:'#cbd5e1',margin:'0 6px'}}>/</span>
              <span style={{color:'#1e293b',fontWeight:600}}>
                {page === 'dashboard' ? '재고 현황' : page === 'history' ? '입출고 이력' : '사용자 관리'}
              </span>
            </div>
          </div>
          <div style={S.headerRight}>
            <div style={S.headerDate}>{dateStr}</div>
            <div style={S.headerDivider}/>
            <div style={S.headerUser}>{userData?.name} 님</div>
          </div>
        </header>

        {/* 콘텐츠 */}
        <main style={S.content}>
          {loading ? (
            <div style={S.loadWrap}>
              <div style={S.loadSpinner}/>
              <div style={{color:'#64748b',fontSize:14,marginTop:12}}>데이터 불러오는 중...</div>
            </div>
          ) : page === 'dashboard' ? (
            <Dashboard transactions={transactions} stockMap={stockMap}
              onInbound={() => setModal('inbound')} onSetOut={() => setModal('setout')} />
          ) : page === 'history' ? (
            <History transactions={transactions} />
          ) : page === 'admin' ? (
            <AdminPage />
          ) : null}
        </main>
      </div>

      {modal === 'inbound' && (
        <InboundModal onClose={saved => { setModal(null); if (saved) showToast('입고가 저장되었습니다.') }} />
      )}
      {modal === 'setout' && (
        <SetOutboundModal stockMap={stockMap}
          onClose={saved => { setModal(null); if (saved) showToast('SET 출고가 처리되었습니다.') }} />
      )}

      {toast && (
        <div style={S.toast}>
          <span style={{fontSize:16}}>✓</span> {toast.msg}
        </div>
      )}
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
  if (userRole === 'pending') return <Routes><Route path="*" element={<PendingPage />} /></Routes>
  return <Routes><Route path="*" element={<MainApp />} /></Routes>
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
  root: { display:'flex', height:'100vh', overflow:'hidden', background:'#f1f5f9' },
  
  // 사이드바
  sidebar: { background:'#0f172a', display:'flex', flexDirection:'column', flexShrink:0, transition:'width 0.2s ease', overflow:'hidden' },
  logoArea: { padding:'18px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #1e293b', flexShrink:0 },
  logoMark: { width:34, height:34, background:'linear-gradient(135deg,#3b82f6,#1e40af)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  logoTitle: { fontSize:14, fontWeight:800, color:'#f8fafc', letterSpacing:1 },
  logoSub: { fontSize:10, color:'#475569', marginTop:1 },
  collapseBtn: { marginLeft:'auto', background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:18, padding:'2px 4px', flexShrink:0 },

  actionArea: { padding:'12px 10px 6px', display:'flex', flexDirection:'column', gap:6, flexShrink:0 },
  btnIn:  { display:'flex', alignItems:'center', gap:8, padding:'9px 14px', background:'#1e40af', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13, width:'100%', letterSpacing:0.3 },
  btnOut: { display:'flex', alignItems:'center', gap:8, padding:'9px 14px', background:'#065f46', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13, width:'100%', letterSpacing:0.3 },
  iconBtn: { width:40, height:40, border:'none', borderRadius:6, cursor:'pointer', color:'#fff', fontSize:16, fontWeight:700 },

  divider: { height:1, background:'#1e293b', margin:'6px 10px', flexShrink:0 },

  navGroupLabel: { fontSize:10, fontWeight:700, color:'#475569', letterSpacing:1.2, textTransform:'uppercase', padding:'4px 10px 6px' },
  navItem:   { display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px', background:'none', border:'none', color:'#94a3b8', cursor:'pointer', borderRadius:6, fontFamily:'inherit', fontWeight:500, fontSize:13, textAlign:'left', marginBottom:1 },
  navActive: { display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px', background:'#1e293b', border:'none', color:'#f1f5f9', cursor:'pointer', borderRadius:6, fontFamily:'inherit', fontWeight:700, fontSize:13, textAlign:'left', marginBottom:1, borderLeft:'3px solid #3b82f6' },
  navIcon:   { fontSize:14, width:18, textAlign:'center', flexShrink:0 },

  sideFooter: { padding:'10px 10px 14px', borderTop:'1px solid #1e293b', flexShrink:0 },
  sideStatus: { display:'flex', alignItems:'center', gap:6, marginBottom:8 },
  statusDot: { width:6, height:6, borderRadius:'50%', background:'#22c55e', flexShrink:0 },
  userRow:   { display:'flex', alignItems:'center', gap:8 },
  userAvatar: { width:28, height:28, borderRadius:'50%', background:'#1e40af', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 },
  logoutBtn: { background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:14, padding:2 },

  // 메인
  mainWrap: { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
  header: { height:52, background:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', flexShrink:0, boxShadow:'0 1px 3px rgba(0,0,0,0.04)' },
  headerLeft: { display:'flex', alignItems:'center' },
  breadcrumb: { fontSize:13 },
  headerRight: { display:'flex', alignItems:'center', gap:12 },
  headerDate: { fontSize:12, color:'#64748b' },
  headerDivider: { width:1, height:16, background:'#e2e8f0' },
  headerUser: { fontSize:13, fontWeight:600, color:'#374151' },

  content: { flex:1, overflowY:'auto', padding:24 },

  loadWrap: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%' },
  loadSpinner: { width:32, height:32, border:'3px solid #e2e8f0', borderTop:'3px solid #3b82f6', borderRadius:'50%', animation:'spin 0.8s linear infinite' },

  toast: { position:'fixed', bottom:24, right:24, background:'#0f172a', color:'#fff', padding:'12px 20px', borderRadius:8, fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:8, boxShadow:'0 8px 24px rgba(0,0,0,0.2)', zIndex:2000 },
}
