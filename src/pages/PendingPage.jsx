import { useAuth } from "../contexts/AuthContext"

export default function PendingPage() {
  const { logout, userData } = useAuth()
  return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"#fff",borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:380,textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        <div style={{fontSize:56,marginBottom:16}}>⏳</div>
        <div style={{fontSize:20,fontWeight:800,color:"#0f172a",marginBottom:8}}>승인 대기 중</div>
        <div style={{fontSize:14,color:"#64748b",lineHeight:1.7,marginBottom:28}}>
          <strong>{userData?.name}</strong>님의 계정이<br/>관리자 승인을 기다리고 있습니다.<br/>승인 완료 후 다시 로그인해 주세요.
        </div>
        <div style={{background:"#eff6ff",borderRadius:10,padding:"14px",marginBottom:24,fontSize:13,color:"#1d4ed8"}}>
          📞 승인 요청: 관리자(유성배 차장)에게 연락하세요
        </div>
        <button onClick={logout}
          style={{width:"100%",padding:"14px",background:"#1e40af",color:"#fff",border:"none",borderRadius:10,fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          로그아웃
        </button>
      </div>
    </div>
  )
}
