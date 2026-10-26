import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api.js';

export default function AddNote() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', subject: '', content: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/notes', form);
      navigate('/notes');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const update = field => e => setForm({ ...form, [field]: e.target.value });

  return (
    <section className="card">
      <h1>Add Note</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Title
          <input required maxLength={200} value={form.title} onChange={update('title')} placeholder="Photosynthesis Basics" />
        </label>
        <label>
          Subject
          <input required maxLength={100} value={form.subject} onChange={update('subject')} placeholder="Biology" />
        </label>
        <label>
          Content
          <textarea required rows={8} maxLength={20000} value={form.content} onChange={update('content')} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Saving & indexing…' : 'Save note'}</button>
      </form>
    </section>
  );
}
