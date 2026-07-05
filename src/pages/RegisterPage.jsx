import { useState } from "react"
import { auth, db } from "../firebase"
import { createUserWithEmailAndPassword } from "firebase/auth"
import { doc, setDoc } from "firebase/firestore"
import { useNavigate } from "react-router-dom"

export default function RegisterPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleRegister() {
    if (!name || !email || !password) return setError("모든 항목을 입력하세요.")
    if (password.length < 6) return setError("비밀번호는 6자 이상이어야 합니다.")
    try {
      setError(""); setLoading(true)
      const result = await createUserWithEmailAndPassword(auth, email, password)
      await setDoc(doc(db, "users", result.user.uid), { name, email, role: "pending", createdAt: new Date() })
      alert("가입 완료!\n관리자 승인 후 사용 가능합니다.")
      navigate("/login")
    } catch (e) {
      if (e.code === "auth/email-already-in-use") setError("이미 사용 중인 이메일입니다.")
      else setError("가입 오류: " + e.code)
    }
    setLoading(false)
  }

  const inp = { width:"100%", padding:"15px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:15, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"#fff",borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:60,height:60,background:"linear-gradient(135deg,#3b82f6,#1d4ed8)",borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:28}}>⚙</div>
          <div style={{fontSize:20,fontWeight:800,color:"#0f172a"}}>회원가입</div>
          <div style={{fontSize:13,color:"#64748b",marginTop:4}}>가입 후 관리자 승인이 필요합니다</div>
        </div>

        {error && <div style={{background:"#fee2e2",color:"#dc2626",padding:"11px 14px",borderRadius:8,marginBottom:16,fontSize:13,fontWeight:500}}>{error}</div>}

        <div style={{marginBottom:12}}>
          <input style={inp} placeholder="이름" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div style={{marginBottom:12}}>
          <input type="email" style={inp} placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} />
        </div>
        <div style={{marginBottom:24}}>
          <input type="password" style={inp} placeholder="비밀번호 (6자 이상)" value={password} onChange={e=>setPassword(e.target.value)} />
        </div>

        <button onClick={handleRegister} disabled={loading}
          style={{width:"100%",padding:"15px",background:loading?"#93c5fd":"#1e40af",color:"#fff",border:"none",borderRadius:10,fontSize:16,fontWeight:700,cursor:loading?"not-allowed":"pointer",marginBottom:10,fontFamily:"inherit"}}>
          {loading ? "가입 중..." : "회원가입 신청"}
        </button>
        <button onClick={()=>navigate("/login")}
          style={{width:"100%",padding:"15px",background:"#fff",color:"#475569",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          로그인으로 돌아가기
        </button>
      </div>
    </div>
  )
}
