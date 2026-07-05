import { useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { useNavigate } from "react-router-dom"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleLogin() {
    if (!email || !password) { setError("이메일과 비밀번호를 입력하세요."); return }
    try {
      setError(""); setLoading(true)
      await login(email, password)
      navigate("/")
    } catch (e) {
      if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password") {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.")
      } else if (e.code === "auth/invalid-email") {
        setError("올바른 이메일 형식이 아닙니다.")
      } else if (e.code === "auth/too-many-requests") {
        setError("너무 많은 시도가 있었습니다. 잠시 후 다시 시도하세요.")
      } else {
        setError("로그인 오류: " + e.code)
      }
    }
    setLoading(false)
  }

  const inp = { width:"100%", padding:"15px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:15, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"#fff",borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        {/* 로고 */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:60,height:60,background:"linear-gradient(135deg,#3b82f6,#1d4ed8)",borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:28}}>⚙</div>
          <div style={{fontSize:20,fontWeight:800,color:"#0f172a"}}>INTS CST 재고관리</div>
          <div style={{fontSize:13,color:"#64748b",marginTop:4}}>승인된 팀원만 접속 가능합니다</div>
        </div>

        {error && <div style={{background:"#fee2e2",color:"#dc2626",padding:"11px 14px",borderRadius:8,marginBottom:16,fontSize:13,fontWeight:500}}>{error}</div>}

        <div style={{marginBottom:12}}>
          <input type="email" style={inp} placeholder="이메일" value={email}
            onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
        </div>
        <div style={{marginBottom:24}}>
          <input type="password" style={inp} placeholder="비밀번호" value={password}
            onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
        </div>

        <button onClick={handleLogin} disabled={loading}
          style={{width:"100%",padding:"15px",background:loading?"#93c5fd":"#1e40af",color:"#fff",border:"none",borderRadius:10,fontSize:16,fontWeight:700,cursor:loading?"not-allowed":"pointer",marginBottom:10,fontFamily:"inherit"}}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
        <button onClick={()=>navigate("/register")}
          style={{width:"100%",padding:"15px",background:"#fff",color:"#1e40af",border:"1.5px solid #dbeafe",borderRadius:10,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          회원가입 신청
        </button>
      </div>
    </div>
  )
}
