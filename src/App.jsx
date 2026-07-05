import SideCalendar from './components/SideCalendar'
import SideCalculator from './components/SideCalculator'
import { useState, useEffect, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Dashboard from './pages/Dashboard'
import InboundManage from './pages/InboundManage'
import ShipmentManage from './pages/ShipmentManage'
import History from './pages/History'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PendingPage from './pages/PendingPage'
import PrintModal from './components/PrintModal'

function MainApp() {
  const { currentUser, userRole, userData, logout } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [sideCollapsed, setSideCollapsed] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [sidePanel, setSidePanel] = useState(null)
  const [toast, setToast] = useState(null)
  const [showPrint, setShowPrint] = useState(false)

  useEffect(() => {
    if (!currentUser) return
// pending users 리스너
    let unsubUsers = () => {}
    if (userRole === 'admin') {
      const qUsers = query(collection(db, 'users'), where('role', '==', 'pending'))
      unsubUsers = onSnapshot(qUsers, snap => setPendingCount(snap.size))
    }
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'))
    return onSnapshot(q, snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [currentUser])

  const stockMap = useMemo(() => {
    const map = {}
    for (const tx of transactions) {
      if (tx.type === '입고' || tx.type === '출고') {
        if (!map[tx.itemCode]) map[tx.itemCode] = 0
        map[tx.itemCode] += tx.type === '입고' ? tx.quantity : -tx.quantity
      }
    }
    return map
  }, [transactions])

  const NAV = [
    { id:'dashboard', icon:'◈', label:'재고 현황',  group:'재고관리' },
    { id:'inbound',   icon:'↑', label:'입고 관리',  group:'재고관리' },
    { id:'shipment',  icon:'↓', label:'출하 관리',  group:'재고관리' },
    { id:'history',   icon:'≡', label:'이력 조회',  group:'재고관리' },
    ...(userRole==='admin' ? [{ id:'admin', icon:'◉', label:'사용자 관리', group:'시스템' }] : []),
  ]

  const groups = [...new Set(NAV.map(n => n.group))]
  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric',weekday:'short'})
  const pageLabel = NAV.find(n => n.id === page)?.label || ''

  return (
    <div style={S.root}>
      <aside style={{...S.sidebar, width: sideCollapsed ? 60 : 220}}>
        <div style={S.logoArea}>
          <button style={S.logoBtn} onClick={()=>setPage('dashboard')} title="홈으로">
            <img src="/ints-logo.png" alt="INTS"
              style={{height:28,objectFit:'contain',display:'block'}}
              onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex'}}
            />
            <div style={{display:'none',width:32,height:32,background:'linear-gradient(135deg,#3b82f6,#1e40af)',borderRadius:8,alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:900,color:'#fff'}}>IN</div>
          </button>
          {!sideCollapsed && (
            <div style={{flex:1,minWidth:0}}>
              <div style={S.logoSub}>CST 재고관리</div>
            </div>
          )}
          <button style={S.collapseBtn} onClick={()=>setSideCollapsed(!sideCollapsed)}>
            {sideCollapsed ? '›' : '‹'}
          </button>
        </div>

        <nav style={{flex:1,padding:'8px',overflowY:'auto'}}>
          {groups.map(g => (
            <div key={g} style={{marginBottom:16}}>
              {!sideCollapsed && <div style={S.groupLabel}>{g}</div>}
              {NAV.filter(n=>n.group===g).map(item => (
                <button key={item.id} title={item.label}
                  style={page===item.id ? S.navActive : S.navItem}
                  onClick={()=>setPage(item.id)}>
                  <span style={{fontSize:14,width:18,textAlign:'center',flexShrink:0}}>{item.icon}</span>
                  {!sideCollapsed && <span>{item.label}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* 달력/계산기 버튼 */}
        {!sideCollapsed && (
          <div style={{display:'flex',gap:4,padding:'0 8px 6px',flexShrink:0}}>
            <button onClick={()=>setSidePanel(p=>p==='cal'?null:'cal')}
              style={{flex:1,padding:'6px 4px',background:sidePanel==='cal'?'#1e40af':'#1e293b',
                border:'none',borderRadius:6,color:sidePanel==='cal'?'#fff':'#94a3b8',
                cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600}}>
              📅 달력
            </button>
            <button onClick={()=>setSidePanel(p=>p==='calc'?null:'calc')}
              style={{flex:1,padding:'6px 4px',background:sidePanel==='calc'?'#1e40af':'#1e293b',
                border:'none',borderRadius:6,color:sidePanel==='calc'?'#fff':'#94a3b8',
                cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600}}>
              🧮 계산기
            </button>
          </div>
        )}

        {/* 패널 */}
        {!sideCollapsed && sidePanel === 'cal' && (
          <div style={{overflowY:'auto',maxHeight:'52vh',flexShrink:0}}>
            <SideCalendar transactions={transactions}/>
          </div>
        )}
        {!sideCollapsed && sidePanel === 'calc' && (
          <div style={{flexShrink:0}}>
            <SideCalculator/>
          </div>
        )}

        <div style={S.sideFooter}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom: sideCollapsed?0:8}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'#22c55e',flexShrink:0}}/>
            {!sideCollapsed && <span style={{fontSize:11,color:'#64748b'}}>실시간 연결됨</span>}
          </div>
          {!sideCollapsed && (
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={S.avatar}>{userData?.name?.[0]||'U'}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:'#e2e8f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userData?.name}</div>
                <div style={{fontSize:10,color:'#64748b'}}>{userRole==='admin'?'관리자':'사용자'}</div>
              </div>
              <button onClick={logout} style={{background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:14}} title="로그아웃">⏻</button>
            </div>
          )}
        </div>
      </aside>

      <div style={S.mainWrap}>
        <header style={S.header}>
          <div style={{fontSize:13,color:'#64748b'}}>
            <span>CST 재고관리</span>
            <span style={{margin:'0 6px',color:'#cbd5e1'}}>/</span>
            <span style={{color:'#1e293b',fontWeight:600}}>{pageLabel}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:12,color:'#64748b'}}>{dateStr}</span>
            <div style={{width:1,height:16,background:'#e2e8f0'}}/>
            <button onClick={()=>setShowPrint(true)}
              style={{background:'none',border:'1px solid #e2e8f0',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:12,color:'#64748b',display:'flex',alignItems:'center',gap:4}}>
              🖨 인쇄
            </button>
            <button onClick={()=>window.location.reload()}
              style={{background:'none',border:'1px solid #e2e8f0',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:12,color:'#64748b',display:'flex',alignItems:'center',gap:4}}>
              ↻ 새로고침
            </button>
            <div style={{width:1,height:16,background:'#e2e8f0'}}/>
            <span style={{fontSize:13,fontWeight:600,color:'#374151'}}>{userData?.name} 님</span>
          </div>
        </header>

        <main style={S.content}>
          {loading ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:12}}>
              <div style={{width:28,height:28,border:'3px solid #e2e8f0',borderTop:'3px solid #3b82f6',borderRadius:'50%'}}/>
              <div style={{color:'#64748b',fontSize:13}}>데이터 불러오는 중...</div>
            </div>
          ) : page==='dashboard' ? <Dashboard transactions={transactions} stockMap={stockMap} />
            : page==='inbound'   ? <InboundManage transactions={transactions} />
            : page==='shipment'  ? <ShipmentManage transactions={transactions} stockMap={stockMap} />
            : page==='history'   ? <History transactions={transactions} />
            : page==='admin'     ? <AdminPage />
            : null}
        </main>
      </div>

      {toast && <div style={S.toast}>✓ {toast}</div>}
      {showPrint && <PrintModal transactions={transactions} stockMap={stockMap} onClose={()=>setShowPrint(false)} />}
    </div>
  )
}

function AuthRouter() {
  const { currentUser, userRole } = useAuth()
  if (!currentUser) return <Routes><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route path="*" element={<Navigate to="/login" />} /></Routes>
  if (userRole === 'pending') return <Routes><Route path="*" element={<PendingPage />} /></Routes>
  return <Routes><Route path="*" element={<MainApp />} /></Routes>
}

export default function App() {
  return <BrowserRouter><AuthProvider><AuthRouter /></AuthProvider></BrowserRouter>
}

const S = {
  root: {display:'flex',height:'100vh',overflow:'hidden',background:'#f1f5f9'},
  sidebar: {background:'#0f172a',display:'flex',flexDirection:'column',flexShrink:0,transition:'width 0.2s',overflow:'hidden'},
  logoArea: {padding:'12px 12px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid #1e293b',flexShrink:0,background:'#fff'},
  logoBtn:  {background:'none',border:'none',cursor:'pointer',padding:'2px 4px',borderRadius:6,flexShrink:0,display:'flex',alignItems:'center'},
  logoSub:  {fontSize:10,color:'#94a3b8',marginTop:1},
  collapseBtn:{marginLeft:'auto',background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:16,padding:'2px 4px',flexShrink:0},
  groupLabel: {fontSize:10,fontWeight:700,color:'#475569',letterSpacing:1.2,textTransform:'uppercase',padding:'4px 10px 5px'},
  navItem:  {display:'flex',alignItems:'center',gap:10,width:'100%',padding:'8px 10px',background:'none',border:'none',color:'#94a3b8',cursor:'pointer',borderRadius:6,fontFamily:'inherit',fontWeight:500,fontSize:13,textAlign:'left',marginBottom:1},
  navActive:{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'8px 10px',background:'#1e293b',border:'none',color:'#f1f5f9',cursor:'pointer',borderRadius:6,fontFamily:'inherit',fontWeight:700,fontSize:13,textAlign:'left',marginBottom:1,borderLeft:'3px solid #3b82f6'},
  sideFooter:{padding:'10px 10px 14px',borderTop:'1px solid #1e293b',flexShrink:0},
  avatar:   {width:26,height:26,borderRadius:'50%',background:'#1e40af',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff',flexShrink:0},
  mainWrap: {flex:1,display:'flex',flexDirection:'column',overflow:'hidden'},
  header:   {height:50,background:'#fff',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',flexShrink:0,boxShadow:'0 1px 3px rgba(0,0,0,0.04)'},
  content:  {flex:1,overflowY:'auto',padding:'12px 16px'},
  toast:    {position:'fixed',bottom:24,right:24,background:'#0f172a',color:'#fff',padding:'12px 20px',borderRadius:8,fontSize:14,fontWeight:600,boxShadow:'0 8px 24px rgba(0,0,0,0.2)',zIndex:2000},
}
