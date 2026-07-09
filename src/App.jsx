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
import RecallManage from './pages/RecallManage'
import AdminDelete from './pages/AdminDelete'
import ProcessingManage from './pages/ProcessingManage'
import ShipmentCalendar from './pages/ShipmentCalendar'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PendingPage from './pages/PendingPage'
import PrintModal from './components/PrintModal'

function MainApp() {
  const { currentUser, userRole, userData, logout } = useAuth()
  const [page, setPage] = useState(new URLSearchParams(window.location.search).get('page')||'dashboard')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [sideCollapsed, setSideCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [pendingCount, setPendingCount] = useState(0)
  const [toast, setToast] = useState(null)
  const [showPrint, setShowPrint] = useState(false)

  useEffect(() => {
    if (!currentUser) return
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'))
    return onSnapshot(q, snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [currentUser])

  useEffect(() => {
    if (userRole !== 'admin') { setPendingCount(0); return }
    const q = query(collection(db, 'users'), where('role', '==', 'pending'))
    return onSnapshot(q, snap => setPendingCount(snap.size))
  }, [userRole])

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
    { id:'dashboard', icon:'◈', label:'재고 현황',  group:'조립팀' },
    { id:'inbound',   icon:'↑', label:'입고 관리',  group:'조립팀' },
    { id:'shipment',  icon:'↓', label:'출하 관리',  group:'조립팀' },
    { id:'shipcal',   icon:'📅', label:'출하계획 관리', group:'조립팀' },
    { id:'history',   icon:'≡', label:'이력 조회',  group:'조립팀' },
    { id:'recall',    icon:'🔧', label:'리콜',        group:'조립팀' },
    { id:'repair',    icon:'🛠', label:'Repair',       group:'조립팀' },
    { id:'processing', icon:'🔩', label:'가공 현황',  group:'가공팀' },
    ...(userRole==='admin' ? [{ id:'admin', icon:'◉', label:'사용자 관리', group:'시스템' }] : []),
  ]

  const groups = [...new Set(NAV.map(n => n.group))]
  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric',weekday:'short'})
  const pageLabel = NAV.find(n => n.id === page)?.label || ''

  return (
    <div style={S.root}>
      {!isMobile && (
      <aside style={{...S.sidebar, width: sideCollapsed ? 60 : 220}}>
        <div style={{...S.logoArea, justifyContent: sideCollapsed?'center':'flex-start'}}>
          <button style={{...S.logoBtn, display: sideCollapsed?'none':'flex'}} onClick={()=>setPage('dashboard')} title="홈으로">
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
      )}
      <div style={S.mainWrap}>
        <header style={{...S.header, padding: isMobile?'8px 12px':'8px 16px'}}>
          <div style={{fontSize: isMobile?12:13, color:'#64748b', display:'flex', alignItems:'center', gap:4}}>
            {!isMobile && <><span>CST 재고관리</span><span style={{margin:'0 4px',color:'#cbd5e1'}}>/</span></>}
            <span style={{color:'#1e293b',fontWeight:600}}>{pageLabel}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap: isMobile?6:12}}>
            {!isMobile && <span style={{fontSize:12,color:'#64748b'}}>{dateStr}</span>}
            {!isMobile && <div style={{width:1,height:16,background:'#e2e8f0'}}/>}
            {!isMobile && <button onClick={()=>setShowPrint(true)}
              style={{background:'none',border:'1px solid #e2e8f0',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:12,color:'#64748b',display:'flex',alignItems:'center',gap:4}}>
              🖨 인쇄
            </button>}
            <button onClick={()=>window.location.reload()}
              style={{background:'none',border:'1px solid #e2e8f0',borderRadius:6,padding:'4px 8px',cursor:'pointer',fontSize:12,color:'#64748b'}}>
              ↻
            </button>
            <div style={{width:1,height:16,background:'#e2e8f0'}}/>
            <span style={{fontSize: isMobile?12:13, fontWeight:600,color:'#374151'}}>{userData?.name}{isMobile?'':' 님'}</span>
          </div>
        </header>

        <main style={S.content}>
          {loading ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:12}}>
              <div style={{width:28,height:28,border:'3px solid #e2e8f0',borderTop:'3px solid #3b82f6',borderRadius:'50%'}}/>
              <div style={{color:'#64748b',fontSize:13}}>데이터 불러오는 중...</div>
            </div>
          ) : page==='dashboard' ? <Dashboard transactions={transactions} stockMap={stockMap} isMobile={isMobile}/>
            : page==='inbound'   ? <InboundManage transactions={transactions} />
            : page==='shipment'  ? <ShipmentManage transactions={transactions} stockMap={stockMap} onNavigate={setPage}/>
            : page==='history'   ? <History transactions={transactions} />
            : page==='processing'? <ProcessingManage stockMap={stockMap}/>
            : page==='admindel'  ? <AdminDelete/>
            : page==='recall'    ? <RecallManage key='recall' defaultCategory='리콜'/>
            : page==='repair'    ? <RecallManage key='repair' defaultCategory='Repair'/>
            : page==='shipcal'   ? <ShipmentCalendar transactions={transactions} stockMap={stockMap} onNavigate={setPage}/>
            : page==='admin'     ? <AdminPage />
            : null}
        </main>
      </div>

      {toast && <div style={S.toast}>✓ {toast}</div>}
      {showPrint && <PrintModal transactions={transactions} stockMap={stockMap} onClose={()=>setShowPrint(false)} />}

      {/* 모바일 하단 탭바 */}
      {isMobile && (
        <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#0f172a',
          borderTop:'1px solid #1e293b',display:'flex',zIndex:100,paddingBottom:'env(safe-area-inset-bottom)'}}>
          {[
            { id:'dashboard', icon:'◈', label:'재고' },
            { id:'inbound',   icon:'↑', label:'입고' },
            { id:'shipment',  icon:'↓', label:'출하' },
            { id:'history',   icon:'≡', label:'이력' },
            { id:'processing', icon:'🔩', label:'가공' },
            { id:'shipcal',   icon:'📅', label:'계획' },
          ].map(item => (
            <button key={item.id} onClick={()=>setPage(item.id)}
              style={{flex:1,padding:'8px 2px',background:'none',border:'none',cursor:'pointer',
                display:'flex',flexDirection:'column',alignItems:'center',gap:2,
                color:page===item.id?'#3b82f6':'#64748b',fontFamily:'inherit'}}>
              <span style={{fontSize:18}}>{item.icon}</span>
              <span style={{fontSize:10,fontWeight:page===item.id?700:400}}>{item.label}</span>
            </button>
          ))}
        </div>
      )}
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
  logoArea: {height:50,padding:'0 8px',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid #1e293b',flexShrink:0,background:'#fff',minWidth:0,overflow:'visible',boxSizing:'border-box'},
  logoBtn:  {background:'none',border:'none',cursor:'pointer',padding:'2px 4px',borderRadius:6,flexShrink:0,display:'flex',alignItems:'center'},
  logoSub:  {fontSize:10,color:'#94a3b8',marginTop:1},
  collapseBtn:{marginLeft:'auto',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:5,color:'#374151',cursor:'pointer',fontSize:14,padding:'4px 7px',flexShrink:0,fontWeight:700},
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
