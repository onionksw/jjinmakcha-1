import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Admin from './components/Admin';
import EmbedMap from './components/EmbedMap';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const isAdmin = window.location.pathname === '/admin';
const isEmbedMap = window.location.pathname === '/embed-map';

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {isEmbedMap ? <EmbedMap /> : isAdmin ? <Admin /> : <App />}
  </React.StrictMode>
);
