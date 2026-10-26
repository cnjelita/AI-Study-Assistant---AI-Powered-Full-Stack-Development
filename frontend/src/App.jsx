import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header.jsx';
import { GuestOnly, RequireAdmin, RequireAuth } from './components/Guards.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import AddNote from './pages/AddNote.jsx';
import Login from './pages/Login.jsx';
import MyNotes from './pages/MyNotes.jsx';
import Register from './pages/Register.jsx';
import Study from './pages/Study.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <main>
          <Routes>
            <Route element={<GuestOnly />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route path="/study" element={<Study />} />
            </Route>
            <Route element={<RequireAdmin />}>
              <Route path="/notes" element={<MyNotes />} />
              <Route path="/notes/new" element={<AddNote />} />
            </Route>
            <Route path="*" element={<Navigate to="/study" replace />} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
