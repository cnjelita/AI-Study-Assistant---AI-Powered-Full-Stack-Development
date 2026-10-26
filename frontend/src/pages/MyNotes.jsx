import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api.js';

export default function MyNotes() {
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/notes')
      .then(res => setNotes(res.data.notes))
      .catch(err => setError(errorMessage(err)));
  }, []);

  return (
    <section className="card">
      <h1>My Notes</h1>
      {error && <p className="error">{error}</p>}
      {!notes && !error && <p className="muted">Loading…</p>}
      {notes?.length === 0 && (
        <p className="muted">You have no notes yet. <Link to="/notes/new">Add your first note</Link>.</p>
      )}
      <ul className="notes">
        {notes?.map(note => (
          <li key={note._id} className="note">
            <h2>{note.title}</h2>
            <p className="badge">{note.subject}</p>
            <p className="content">{note.content}</p>
            <small className="muted">Saved {new Date(note.createdAt).toLocaleString()}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
