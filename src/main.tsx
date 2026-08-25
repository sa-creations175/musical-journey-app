import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
// Side-effect import: registers `window.__readingElapsedShape()`, a
// read-only probe over Reading's recorded answer times. It lives here
// because it belongs to no screen — the corpus has to be describable
// from the console before anyone decides what to do about the rows
// where a card was left open overnight.
import './modules/reading/elapsedShape';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
