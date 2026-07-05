import { createContext, useContext, useEffect, useState } from "react"
import { auth, db } from "../firebase"
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"

const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password)
  const logout = () => signOut(auth)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (snap.exists()) {
          const role = snap.data().role
          if (role === "blocked" || role === "rejected") {
            await signOut(auth)
            setCurrentUser(null); setUserRole(null); setUserData(null)
            setLoading(false); return
          }
          setUserRole(role)
          setUserData(snap.data())
        }
        setCurrentUser(user)
      } else {
        setCurrentUser(null); setUserRole(null); setUserData(null)
      }
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f172a"}}>
      <div style={{color:"#fff",fontSize:16}}>로딩 중...</div>
    </div>
  )

  return (
    <AuthContext.Provider value={{ currentUser, userRole, userData, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
