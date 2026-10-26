import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Header() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="header">
      <span className="brand">📚 AI Study Assistant</span>
      <nav>
        <NavLink to="/study">AI Study</NavLink>
        {isAdmin && <NavLink to="/notes" end>My Notes</NavLink>}
        {isAdmin && <NavLink to="/notes/new">Add Note</NavLink>}
      </nav>
      <div className="user">
        <span>
          {user.name} <small className="role">{user.role}</small>
        </span>
        <button type="button" className="secondary" onClick={handleLogout}>Logout</button>
      </div>
    </header>
  );
}
