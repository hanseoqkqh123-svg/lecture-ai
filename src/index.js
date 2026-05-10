import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AdminPage from './AdminPage';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));

if (window.location.pathname.startsWith('/admin')) {
    root.render(<AdminPage />);
} else {
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}

reportWebVitals();