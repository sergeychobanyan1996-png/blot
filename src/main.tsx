import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

// No StrictMode: the table pacing effect tracks previous state and must run once per change.
createRoot(document.getElementById('root')!).render(<App />);
