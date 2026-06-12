import { createRoot } from 'react-dom/client';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import './theme.css';
import './app.css';
import { App } from './App';
import { installDebugBridge } from './debug';

installDebugBridge();
createRoot(document.getElementById('root')!).render(<App />);
