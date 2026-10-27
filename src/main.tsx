import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { LiveLinkProvider, useLiveLink } from './context/LiveLinkContext';
import { Navigation } from './components/Navigation';
import { HomeView } from './views/HomeView';
import { SenderView } from './views/SenderView';
import { ReceiverView } from './views/ReceiverView';
import { DiagnosticView } from './views/DiagnosticView';
import { CleanView } from './views/CleanView';
import { CleanMultiview } from './views/CleanMultiview';
import './index.css';

function MainApp() {
  const [currentView, setCurrentView] = useState<'home' | 'receiver' | 'sender' | 'test'>('home');
  const { joinRoom, roomId } = useLiveLink();

  // Parse path and query parameters
  useEffect(() => {
    const syncViewAndRoom = () => {
      const path = window.location.pathname;
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room') || 'studio';

      if (path.startsWith('/view/') || path.startsWith('/multiview')) {
        return;
      } else if (path === '/sender') {
        setCurrentView('sender');
        joinRoom(roomParam, 'sender', 'Camera');
      } else if (path === '/receiver') {
        setCurrentView('receiver');
        joinRoom(roomParam, 'receiver', 'Production Multiview');
      } else if (path === '/test') {
        setCurrentView('test');
        joinRoom(roomParam, 'receiver', 'Benchmark Suite');
      } else {
        setCurrentView('home');
        joinRoom(roomParam, 'receiver', 'Portal');
      }
    };

    syncViewAndRoom();
    window.addEventListener('popstate', syncViewAndRoom);
    return () => window.removeEventListener('popstate', syncViewAndRoom);
  }, [joinRoom]);

  const handleNavigate = (view: string) => {
    setCurrentView(view as any);
    const newPath = `/${view === 'home' ? '' : view}?room=${roomId}`;
    window.history.pushState({}, '', newPath);

    if (view === 'sender') {
      joinRoom(roomId, 'sender', 'Camera');
    } else if (view === 'receiver') {
      joinRoom(roomId, 'receiver', 'Production Multiview');
    } else if (view === 'test') {
      joinRoom(roomId, 'receiver', 'Benchmark Suite');
    } else {
      joinRoom(roomId, 'receiver', 'Portal');
    }
  };

  // Special full-window clean views for OBS Studio
  const path = window.location.pathname;
  if (path.startsWith('/view/')) {
    return <CleanView />;
  }
  if (path.startsWith('/multiview')) {
    return <CleanMultiview />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <Navigation currentView={currentView} onNavigate={handleNavigate} />
      <main className="flex-1 flex flex-col">
        {currentView === 'home' && <HomeView onNavigate={handleNavigate} />}
        {currentView === 'receiver' && <ReceiverView />}
        {currentView === 'sender' && <SenderView />}
        {currentView === 'test' && <DiagnosticView />}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LiveLinkProvider>
      <MainApp />
    </LiveLinkProvider>
  </React.StrictMode>
);
