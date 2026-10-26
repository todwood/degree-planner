import React from 'react';
import ReactDOM from 'react-dom/client';
import * as pdfjsModule from 'pdfjs-dist/legacy/build/pdf.js';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.js?url';
import App from './App.jsx';
import './styles/theme.css';

const pdfjs = pdfjsModule.default || pdfjsModule;
if (pdfjs?.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
