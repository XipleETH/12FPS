import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Import embedded application (RootApp wrapped as App) from app directory
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
