import '../board/board.css'
import { BoardCanvas } from '../board/BoardCanvas'
import { useAuth } from '../context/AuthContext'

export function BoardPage() {
  const { user, logout } = useAuth()

  return (
    <div className="board-page">
      <BoardCanvas username={user?.username} onLogout={() => logout()} />
    </div>
  )
}
