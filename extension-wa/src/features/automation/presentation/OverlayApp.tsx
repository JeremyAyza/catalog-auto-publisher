import React, { useEffect } from 'react';
import { useAutomationStore } from '../application/store';

export const OverlayApp: React.FC = () => {
  const {
    dirHandle,
    pendingProducts,
    status,
    logs,
    isRunning,
    handleSelectFolder,
    runAutomation,
    cancelAutomation
  } = useAutomationStore();

  useEffect(() => {
    // Redimensionar el contenedor principal de WhatsApp para que comparta pantalla
    const appEl = document.querySelector('#app') as HTMLElement | null;
    const originalWidth = appEl ? appEl.style.width : '';
    
    if (appEl) {
      appEl.style.width = 'calc(100vw - 320px)';
    }

    return () => {
      if (appEl) {
        appEl.style.width = originalWidth;
      }
    };
  }, []);

  return (
    <div className="fixed top-0 right-0 w-80 h-screen z-[9999] bg-white border-l border-gray-200 shadow-2xl flex flex-col font-sans">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col gap-3">
        <h1 className="text-lg font-bold text-green-600">WA Automator</h1>
        
        {!dirHandle ? (
          <button 
            onClick={handleSelectFolder}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm rounded-md font-medium transition-colors cursor-pointer"
          >
            1. Seleccionar Carpeta
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-gray-600 font-medium">
              {pendingProducts.length} productos pendientes
            </span>
            {!isRunning ? (
              <button 
                onClick={runAutomation}
                disabled={pendingProducts.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-3 py-2 text-sm rounded-md font-medium transition-colors cursor-pointer"
              >
                2. ▶ Iniciar Subida
              </button>
            ) : (
              <button 
                onClick={cancelAutomation}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm rounded-md font-medium transition-colors cursor-pointer"
              >
                ⏹ Cancelar Subida
              </button>
            )}
          </div>
        )}
        <span className="text-xs text-gray-500 line-clamp-2">{status}</span>
      </div>
      
      {/* Logger View */}
      <div className="flex-1 overflow-y-auto p-3 bg-gray-50 flex flex-col gap-1">
        {logs.length === 0 && (
          <div className="text-xs text-gray-400 text-center mt-4">Esperando acciones...</div>
        )}
        {logs.map(log => (
          <div 
            key={log.id} 
            className={`text-xs p-2 rounded border ${
              log.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 
              log.type === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 
              log.type === 'warning' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
              'bg-white text-gray-700 border-gray-100'
            }`}
          >
            <div className="text-[10px] text-gray-400 mb-0.5">
              {new Date(log.timestamp).toLocaleTimeString()}
            </div>
            <div className="break-words leading-tight">{log.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
