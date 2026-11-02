import { useState, useEffect, useRef, useCallback } from 'react';

// Types
interface Timer {
  id: string;
  name: string;
  level?: number;
  endTime: number;
  duration: number;
  icon: string;
  category: string;
}

interface PotionState {
  active: boolean;
  endTime: number;
}

// Utility functions
function formatTime(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTimeShort(ms: number): string {
  if (ms <= 0) return 'Terminado';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function parseDuration(durationStr: string): number {
  const match = durationStr.match(/^(\d+)([smhd])$/i);
  if (!match) return 0;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

function getIconForCategory(category: string): string {
  const icons: Record<string, string> = {
    'building': '🏗️',
    'troop': '⚔️',
    'spell': '🧪',
    'hero': '🦸',
    'wall': '🧱',
    'research': '🔬',
    'other': '⏳',
  };
  return icons[category] || '⏳';
}

// Sample JSON data for demo
const SAMPLE_VILLAGE = {
  buildings: [
    { name: "Town Hall", level: 14, upgradeEndTime: Date.now() + 3 * 24 * 60 * 60 * 1000 },
    { name: "Clan Castle", level: 9, upgradeEndTime: Date.now() + 2 * 24 * 60 * 60 * 1000 },
    { name: "Army Camp", level: 11, upgradeEndTime: Date.now() + 5 * 24 * 60 * 60 * 1000 },
  ],
  heroes: [
    { name: "Barbarian King", level: 75, regenerationEndTime: Date.now() + 45 * 60 * 1000 },
    { name: "Archer Queen", level: 70, regenerationEndTime: Date.now() + 30 * 60 * 1000 },
  ],
  spells: [
    { name: "Poison Spell", level: 8, upgradeEndTime: Date.now() + 12 * 60 * 60 * 1000 },
  ],
  research: [
    { name: "Golem", level: 11, endTime: Date.now() + 14 * 24 * 60 * 60 * 1000 },
  ]
};

export default function App() {
  const [timers, setTimers] = useState<Timer[]>(() => {
    const saved = localStorage.getItem('clash-timers');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [potion, setPotion] = useState<PotionState>(() => {
    const saved = localStorage.getItem('clash-potion');
    return saved ? JSON.parse(saved) : { active: false, endTime: 0 };
  });
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('clash-notifications') === 'true';
  });
  
  const [jsonInput, setJsonInput] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualLevel, setManualLevel] = useState('');
  const [manualDuration, setManualDuration] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');
  const [syncCode, setSyncCode] = useState('');
  const [importCode, setImportCode] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [potionRemaining, setPotionRemaining] = useState('');
  
  const notifiedRef = useRef<Set<string>>(new Set());
  const workerRef = useRef<Worker | null>(null);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('clash-timers', JSON.stringify(timers));
  }, [timers]);

  useEffect(() => {
    localStorage.setItem('clash-potion', JSON.stringify(potion));
  }, [potion]);

  useEffect(() => {
    localStorage.setItem('clash-notifications', String(notificationsEnabled));
  }, [notificationsEnabled]);

  // Web Worker for notifications
  useEffect(() => {
    const workerCode = `
      let timers = [];
      let interval;
      
      self.onmessage = function(e) {
        if (e.data.type === 'update') {
          timers = e.data.timers;
          if (!interval) {
            interval = setInterval(checkTimers, 1000);
          }
        } else if (e.data.type === 'stop') {
          if (interval) clearInterval(interval);
          interval = null;
        }
      };
      
      function checkTimers() {
        const now = Date.now();
        const finished = timers.filter(t => t.endTime <= now && !t.notified);
        if (finished.length > 0) {
          self.postMessage({ type: 'finished', timers: finished.map(t => t.name) });
          timers = timers.map(t => ({...t, notified: finished.some(f => f.id === t.id) ? true : t.notified}));
        }
      }
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = (e) => {
      if (e.data.type === 'finished' && notificationsEnabled) {
        e.data.timers.forEach((name: string) => {
          if (!notifiedRef.current.has(name)) {
            notifiedRef.current.add(name);
            if (Notification.permission === 'granted') {
              new Notification('⏰ ¡Mejora completada!', {
                body: `${name} ha terminado de mejorar.`,
                icon: '🏗️',
              });
            }
            // Also play a sound
            try {
              const audioCtx = new AudioContext();
              const oscillator = audioCtx.createOscillator();
              const gainNode = audioCtx.createGain();
              oscillator.connect(gainNode);
              gainNode.connect(audioCtx.destination);
              oscillator.frequency.value = 800;
              oscillator.type = 'sine';
              gainNode.gain.value = 0.3;
              oscillator.start();
              setTimeout(() => {
                oscillator.stop();
                audioCtx.close();
              }, 300);
            } catch (e) { /* ignore audio errors */ }
          }
        });
      }
    };
    
    workerRef.current = worker;
    
    return () => {
      worker.terminate();
    };
  }, [notificationsEnabled]);

  // Update worker with current timers
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'update',
        timers: timers.map(t => ({ ...t, notified: notifiedRef.current.has(t.name) }))
      });
    }
  }, [timers]);

  // Potion countdown
  useEffect(() => {
    const interval = setInterval(() => {
      if (potion.active) {
        const remaining = potion.endTime - Date.now();
        if (remaining <= 0) {
          setPotion({ active: false, endTime: 0 });
          setPotionRemaining('');
        } else {
          setPotionRemaining(formatTime(remaining));
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [potion]);

  // Request notification permission
  const enableNotifications = useCallback(() => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationsEnabled(permission === 'granted');
      });
    }
  }, []);

  // Activate potion
  const activatePotion = () => {
    const endTime = Date.now() + 60 * 60 * 1000; // 1 hour
    setPotion({ active: true, endTime });
    // Speed up all timers (reduce remaining time by factor)
    setTimers(prev => prev.map(t => {
      const remaining = t.endTime - Date.now();
      const accelerated = remaining / 10; // 10x speed
      return { ...t, endTime: Date.now() + accelerated };
    }));
  };

  // Parse village JSON
  const parseVillageJSON = (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      const newTimers: Timer[] = [];

      // Parse buildings
      if (data.buildings && Array.isArray(data.buildings)) {
        data.buildings.forEach((b: any) => {
          const endTime = b.upgradeEndTime || b.endTime || 
            (b.remainingSeconds ? Date.now() + b.remainingSeconds * 1000 : 
            (b.finishDate ? new Date(b.finishDate).getTime() : null));
          if (endTime && endTime > Date.now()) {
            newTimers.push({
              id: generateId(),
              name: b.name || 'Edificio',
              level: b.level,
              endTime,
              duration: endTime - Date.now(),
              icon: '🏗️',
              category: 'building',
            });
          }
        });
      }

      // Parse heroes
      if (data.heroes && Array.isArray(data.heroes)) {
        data.heroes.forEach((h: any) => {
          const endTime = h.regenerationEndTime || h.endTime ||
            (h.remainingSeconds ? Date.now() + h.remainingSeconds * 1000 : null);
          if (endTime && endTime > Date.now()) {
            newTimers.push({
              id: generateId(),
              name: h.name || 'Héroe',
              level: h.level,
              endTime,
              duration: endTime - Date.now(),
              icon: '🦸',
              category: 'hero',
            });
          }
        });
      }

      // Parse spells
      if (data.spells && Array.isArray(data.spells)) {
        data.spells.forEach((s: any) => {
          const endTime = s.upgradeEndTime || s.endTime ||
            (s.remainingSeconds ? Date.now() + s.remainingSeconds * 1000 : null);
          if (endTime && endTime > Date.now()) {
            newTimers.push({
              id: generateId(),
              name: s.name || 'Hechizo',
              level: s.level,
              endTime,
              duration: endTime - Date.now(),
              icon: '🧪',
              category: 'spell',
            });
          }
        });
      }

      // Parse research
      if (data.research && Array.isArray(data.research)) {
        data.research.forEach((r: any) => {
          const endTime = r.endTime || r.upgradeEndTime ||
            (r.remainingSeconds ? Date.now() + r.remainingSeconds * 1000 : null);
          if (endTime && endTime > Date.now()) {
            newTimers.push({
              id: generateId(),
              name: r.name || 'Investigación',
              level: r.level,
              endTime,
              duration: endTime - Date.now(),
              icon: '🔬',
              category: 'research',
            });
          }
        });
      }

      if (newTimers.length > 0) {
        setTimers(prev => [...prev, ...newTimers]);
        setJsonInput('');
      }
    } catch (e) {
      alert('Error al analizar el JSON. Verifica el formato.');
    }
  };

  // Add manual timer
  const addManualTimer = () => {
    if (!manualName.trim()) return;
    
    let endTime: number;
    let duration: number;
    
    if (manualEndTime) {
      const date = new Date(manualEndTime);
      endTime = date.getTime();
      duration = endTime - Date.now();
    } else if (manualDuration) {
      duration = parseDuration(manualDuration);
      if (duration <= 0) {
        alert('Formato de duración inválido. Usa: 30s, 5m, 2h, 1d');
        return;
      }
      endTime = Date.now() + duration;
    } else {
      alert('Indica una duración o fecha de fin.');
      return;
    }
    
    if (endTime <= Date.now()) {
      alert('La fecha de fin debe ser en el futuro.');
      return;
    }

    const newTimer: Timer = {
      id: generateId(),
      name: manualName.trim(),
      level: manualLevel ? parseInt(manualLevel) : undefined,
      endTime,
      duration,
      icon: getIconForCategory('other'),
      category: 'other',
    };

    setTimers(prev => [...prev, newTimer]);
    setManualName('');
    setManualLevel('');
    setManualDuration('');
    setManualEndTime('');
  };

  // Remove timer
  const removeTimer = (id: string) => {
    setTimers(prev => prev.filter(t => t.id !== id));
  };

  // Generate sync code
  const generateSyncCode = () => {
    const data = { timers, potion, timestamp: Date.now() };
    const encoded = btoa(JSON.stringify(data));
    setSyncCode(encoded);
  };

  // Import sync code
  const importSyncCode = () => {
    try {
      const data = JSON.parse(atob(importCode));
      if (data.timers) setTimers(data.timers);
      if (data.potion) setPotion(data.potion);
      setImportCode('');
      setShowImport(false);
    } catch (e) {
      alert('Código de sincronización inválido.');
    }
  };

  // Clear all
  const clearAll = () => {
    if (confirm('¿Borrar todos los temporizadores?')) {
      setTimers([]);
      setPotion({ active: false, endTime: 0 });
      notifiedRef.current.clear();
    }
  };

  // Load sample
  const loadSample = () => {
    setJsonInput(JSON.stringify(SAMPLE_VILLAGE, null, 2));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur-sm border-b border-amber-500/30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-amber-400">⏱️ Temporizador Clash</h1>
          <div className="flex gap-2">
            <button
              onClick={enableNotifications}
              className={`p-2 rounded-lg transition-all ${
                notificationsEnabled 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
              title={notificationsEnabled ? 'Notificaciones activas' : 'Activar notificaciones'}
            >
              🔔
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Potion Section */}
        <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-2xl p-5 border border-purple-500/30">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            🧪 Poción de Constructor
          </h2>
          <p className="text-sm text-gray-300 mb-4">
            Al activarla, todos los constructores trabajan a velocidad <span className="text-amber-400 font-bold">×10</span> durante 1 hora real (equivale a 10 horas de mejoras).
          </p>
          
          {potion.active ? (
            <div className="bg-green-900/40 rounded-xl p-4 border border-green-500/30">
              <div className="flex items-center justify-between">
                <span className="text-green-400 font-bold">✅ Poción activa</span>
                <span className="text-green-300 font-mono text-lg">{potionRemaining}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={activatePotion}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg"
              >
                🧪 Usar poción ×10
              </button>
              <button
                onClick={enableNotifications}
                className={`py-3 px-6 rounded-xl font-bold transition-all ${
                  notificationsEnabled
                    ? 'bg-gray-700 text-gray-400 cursor-default'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                🔔 {notificationsEnabled ? 'Notificaciones activas' : 'Activar notificaciones'}
              </button>
            </div>
          )}
        </div>

        {/* Import Village Section */}
        <div className="bg-gray-800/60 rounded-2xl p-5 border border-gray-700">
          <h2 className="text-lg font-bold mb-3">📥 Importar aldea</h2>
          
          <div className="space-y-3">
            <label className="text-sm text-gray-400 block">
              JSON de la aldea
            </label>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder="Pega aquí el JSON de tu aldea. Se detectan automáticamente edificios, héroes, hechizos y mejoras con tiempo restante, segundos o fecha de fin."
              className="w-full h-32 bg-gray-900 border border-gray-600 rounded-xl p-3 text-sm text-gray-200 placeholder-gray-500 focus:border-amber-500 focus:outline-none resize-none"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => parseVillageJSON(jsonInput)}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-lg transition-all"
              >
                🔍 Analizar aldea
              </button>
              <button
                onClick={loadSample}
                className="bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold py-2 px-4 rounded-lg transition-all"
              >
                Cargar ejemplo
              </button>
              <button
                onClick={() => setJsonInput('')}
                className="bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold py-2 px-4 rounded-lg transition-all"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        {/* Manual Timer Section */}
        <div className="bg-gray-800/60 rounded-2xl p-5 border border-gray-700">
          <h2 className="text-lg font-bold mb-1">➕ Añadir temporizador manual</h2>
          <p className="text-sm text-gray-400 mb-4">
            Para mejoras que no estén en el JSON (muros, laboratorio, regeneración de héroes, etc.).
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Nombre</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Ej: Muro nivel 14"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Nivel (opcional)</label>
              <input
                type="number"
                value={manualLevel}
                onChange={(e) => setManualLevel(e.target.value)}
                placeholder="Ej: 14"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Duración (formato: 30s, 5m, 2h, 1d)</label>
              <input
                type="text"
                value={manualDuration}
                onChange={(e) => setManualDuration(e.target.value)}
                placeholder="Ej: 2h 30m → usa 150m"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            
            <div className="border-t border-gray-700 pt-3">
              <p className="text-sm text-gray-400 mb-2">— o indica fecha y hora de fin (formato 24h) —</p>
              <input
                type="datetime-local"
                value={manualEndTime}
                onChange={(e) => setManualEndTime(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-sm text-gray-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
            
            <button
              onClick={addManualTimer}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-all"
            >
              Añadir temporizador
            </button>
          </div>
        </div>

        {/* Notifications Info */}
        <div className="bg-blue-900/30 rounded-2xl p-4 border border-blue-500/30">
          <p className="text-sm text-blue-200">
            🔔 <strong>Notificaciones:</strong> actívalas con el botón de la campana. Sonarán cuando termine una mejora <strong>aunque la pestaña esté en segundo plano o minimizada</strong> (un Web Worker mantiene el reloj preciso). Si la mejora terminó con la página cerrada, recibirás el aviso al volver a abrirla.
          </p>
        </div>

        {/* Sync Section */}
        <div className="bg-gray-800/60 rounded-2xl p-5 border border-gray-700">
          <p className="text-sm text-gray-400 mb-4">
            💾 <strong className="text-gray-200">Guardado automático</strong> en este navegador. Para llevar tus temporizadores a <strong className="text-gray-200">otro dispositivo</strong>, genera un código de sincronización y pégalo allí.
          </p>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={generateSyncCode}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm"
            >
              📤 Generar código
            </button>
            <button
              onClick={() => setShowImport(!showImport)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm"
            >
              📥 Importar código
            </button>
            <button
              onClick={clearAll}
              className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm"
            >
              🗑️ Borrar todo
            </button>
          </div>

          {syncCode && (
            <div className="mt-3">
              <label className="text-xs text-gray-400 block mb-1">Código de sincronización (cópialo):</label>
              <textarea
                readOnly
                value={syncCode}
                className="w-full h-20 bg-gray-900 border border-gray-600 rounded-lg p-2 text-xs text-gray-300 font-mono"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </div>
          )}

          {showImport && (
            <div className="mt-3">
              <label className="text-xs text-gray-400 block mb-1">Pega el código aquí:</label>
              <textarea
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                className="w-full h-20 bg-gray-900 border border-gray-600 rounded-lg p-2 text-xs text-gray-300 font-mono focus:border-amber-500 focus:outline-none"
                placeholder="Pega el código de sincronización..."
              />
              <button
                onClick={importSyncCode}
                className="mt-2 bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm"
              >
                Importar
              </button>
            </div>
          )}
        </div>

        {/* Timers List */}
        <div className="bg-gray-800/60 rounded-2xl p-5 border border-gray-700">
          <h2 className="text-lg font-bold mb-4">⏳ Temporizadores</h2>
          
          {timers.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-5xl mb-4">🏗️</div>
              <p className="text-gray-400 font-bold mb-2">No hay mejoras en curso.</p>
              <p className="text-sm text-gray-500">
                Importa el JSON de tu aldea o añade temporizadores manualmente.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {timers
                .sort((a, b) => a.endTime - b.endTime)
                .map(timer => (
                  <TimerCard
                    key={timer.id}
                    timer={timer}
                    onRemove={() => removeTimer(timer.id)}
                  />
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500 py-4">
          <p>Temporizador Clash • Guardado local con sincronización entre dispositivos</p>
        </div>
      </div>
    </div>
  );
}

// Timer Card Component
function TimerCard({ timer, onRemove }: { timer: Timer; onRemove: () => void }) {
  const [remaining, setRemaining] = useState('');
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const rem = timer.endTime - now;
      
      if (rem <= 0) {
        setRemaining('00:00:00');
        setProgress(100);
        setFinished(true);
        return;
      }
      
      setRemaining(formatTime(rem));
      const elapsed = timer.duration - rem;
      setProgress(Math.min(100, (elapsed / timer.duration) * 100));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  return (
    <div className={`rounded-xl p-4 border transition-all ${
      finished 
        ? 'bg-green-900/30 border-green-500/50' 
        : 'bg-gray-900/50 border-gray-600/50'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{timer.icon}</span>
          <div>
            <h3 className="font-bold text-white">
              {timer.name}
              {timer.level && <span className="text-amber-400 ml-1">Nv.{timer.level}</span>}
            </h3>
            <p className={`text-sm font-mono ${finished ? 'text-green-400' : 'text-gray-300'}`}>
              {finished ? '✅ ¡Completado!' : remaining}
            </p>
            {!finished && (
              <p className="text-xs text-gray-500 mt-0.5">
                {formatTimeShort(timer.endTime - Date.now())} restante
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-gray-500 hover:text-red-400 transition-colors p-1"
          title="Eliminar"
        >
          ✕
        </button>
      </div>
      
      {/* Progress bar */}
      <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            finished ? 'bg-green-500' : 'bg-amber-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
