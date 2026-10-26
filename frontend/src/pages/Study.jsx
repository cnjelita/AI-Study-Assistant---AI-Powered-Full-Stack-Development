import { useState } from 'react';
import api, { errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Study() {
  const { isAdmin } = useAuth();
  const [question, setQuestion] = useState('');
  const [includeQuiz, setIncludeQuiz] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await api.post('/study/ask', { question, includeQuiz });
      setResult(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h1>AI Study</h1>
      <p className="muted">
        Ask about any topic.{' '}
        {isAdmin ? 'Answers use relevant content from your own saved notes.' : 'Answers come from the AI model.'}
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          Topic or question
          <textarea
            rows={3}
            required
            maxLength={1000}
            placeholder="e.g. What is photosynthesis?"
            value={question}
            onChange={e => setQuestion(e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={includeQuiz} onChange={e => setIncludeQuiz(e.target.checked)} />
          Also generate 3 practice questions
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading || !question.trim()}>{loading ? 'Thinking…' : 'Ask'}</button>
      </form>

      {result && (
        <div className="result">
          <h2>Answer</h2>
          {result.usedNotes > 0 && (
            <p className="badge">Used {result.usedNotes} excerpt{result.usedNotes > 1 ? 's' : ''} from your notes</p>
          )}
          <p className="answer">{result.answer}</p>
          {result.practiceQuestions.length > 0 && (
            <>
              <h2>Practice questions</h2>
              <ol>
                {result.practiceQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ol>
            </>
          )}
        </div>
      )}
    </section>
  );
}
