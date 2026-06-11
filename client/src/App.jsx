import { useEffect, useMemo, useRef, useState } from 'react';
import '@tensorflow/tfjs';
import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const MATCH_THRESHOLD = 80;
const DIST_SCALE = 1.3;

const initialState = {
  users: [],
  currentUser: null,
  view: 'loading',
  statusMessage: 'Loading face recognition models…',
  scanProgress: 0,
  scanState: 'idle',
  overlayMessage: 'Keep your face centered and move slightly.',
  bestMatch: null,
  loginConfidence: 0
};

function App() {
  const [state, setState] = useState(initialState);
  const [name, setName] = useState('');
  const videoRef = useRef(null);
  const loginTimer = useRef(null);
  const scanStateRef = useRef({ motionDetected: false, noseHistory: [], running: false, startTime: 0 });

  const isRegisterView = state.view === 'register';
  const isLoginView = state.view === 'login';
  const isDashboardView = state.view === 'dashboard';

  const baseUrl = useMemo(() => {
    const apiOrigin = import.meta.env.VITE_API_ORIGIN;
    return apiOrigin || '';
  }, []);

  useEffect(() => {
    async function init() {
      setState((s) => ({ ...s, view: 'loading' }));
      await loadModels();
      await loadUsers();
      setState((s) => ({ ...s, view: 'login', statusMessage: '', scanState: 'ready' }));
      startAutoLogin();
    }

    init();
    return () => stopVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadModels() {
    setState((s) => ({ ...s, statusMessage: 'Downloading face detection models…' }));
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  }

  async function loadUsers() {
    const res = await fetch(`${baseUrl}/api/users`);
    let users = await res.json();
    // ensure descriptor is a Float32Array for face-api computations
    users = users.map(u => {
      if (u.descriptor && !ArrayBuffer.isView(u.descriptor)) {
        // handle the case where descriptor may be stored as an object
        try {
          u.descriptor = new Float32Array(u.descriptor);
        } catch (e) {
          // fallback: leave as-is
        }
      } else if (Array.isArray(u.descriptor)) {
        u.descriptor = new Float32Array(u.descriptor);
      }
      return u;
    });
    setState((s) => ({ ...s, users }));
  }

  async function startAutoLogin() {
    if (!state.users.length || state.currentUser || state.scanState === 'scanning') return;
    loginTimer.current = window.setTimeout(() => {
      if (!state.currentUser) startLogin();
    }, 500);
  }

  function stopVideo() {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    scanStateRef.current.running = false;
  }

  async function openCamera() {
    if (!videoRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
  }

  async function captureDescriptor() {
    if (!videoRef.current) return null;
    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
    return detection?.descriptor || null;
  }

  async function handleRegister() {
    if (!name.trim()) return;
    setState((s) => ({ ...s, scanState: 'capturing', statusMessage: 'Capturing your face…' }));
    try {
      await openCamera();
      const descriptor = await captureDescriptor();
      stopVideo();
      if (!descriptor) {
        setState((s) => ({ ...s, scanState: 'error', statusMessage: 'No face was detected. Try again.' }));
        return;
      }
      // send descriptor as a plain number array so JSON transport is safe
      const res = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), descriptor: Array.from(descriptor) })
      });
      const user = await res.json();
      await loadUsers();
      setName('');
      setState((s) => ({ ...s, view: 'login', scanState: 'ready', statusMessage: `Registered ${user.name}.` }));
      startAutoLogin();
    } catch (error) {
      stopVideo();
      setState((s) => ({ ...s, scanState: 'error', statusMessage: 'Capture failed. Please allow camera access.' }));
    }
  }

  async function startLogin() {
    if (!state.users.length) return;
    setState((s) => ({ ...s, view: 'login', scanState: 'scanning', overlayMessage: 'Move your head slightly while we scan your face.', loginConfidence: 0, bestMatch: null }));
    scanStateRef.current = { motionDetected: false, noseHistory: [], running: true, startTime: Date.now() };
    try {
      await openCamera();
      scanLoop();
    } catch (error) {
      stopVideo();
      setState((s) => ({ ...s, scanState: 'error', statusMessage: 'Camera access denied or unavailable.' }));
    }
  }

  function computeMotion(nose) {
    const history = scanStateRef.current.noseHistory;
    history.push({ x: nose.x, y: nose.y });
    if (history.length > 25) history.shift();
    const xs = history.map((item) => item.x);
    const ys = history.map((item) => item.y);
    const motion = Math.max(...xs) - Math.min(...xs) > 2 || Math.max(...ys) - Math.min(...ys) > 2;
    scanStateRef.current.motionDetected = scanStateRef.current.motionDetected || motion;
    return motion;
  }

  async function scanLoop() {
    if (!scanStateRef.current.running || !videoRef.current) return;
    if (videoRef.current.readyState < 3) {
      requestAnimationFrame(scanLoop);
      return;
    }

    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      if (Date.now() - scanStateRef.current.startTime > 30000) {
        stopVideo();
        setState((s) => ({ ...s, scanState: 'error', statusMessage: 'No face detected. Try again.', overlayMessage: 'No face on camera.' }));
        return;
      }
      requestAnimationFrame(scanLoop);
      return;
    }

    const nose = detection.landmarks.getNose()[3];
    const motion = computeMotion(nose);
    const best = findBestMatch(detection.descriptor);
    const confidence = best?.confidence || 0;

    setState((s) => ({
      ...s,
      loginConfidence: confidence,
      bestMatch: best?.user || null,
      overlayMessage: !motion
        ? 'Move your head slightly to confirm liveness.'
        : confidence < MATCH_THRESHOLD
        ? `Face match ${confidence}% — need ${MATCH_THRESHOLD}%`
        : `Match found for ${best.user.name}. Completing sign-in…`
    }));

    if (motion && confidence >= MATCH_THRESHOLD) {
      await completeLogin(best.user, confidence);
      return;
    }

    if (Date.now() - scanStateRef.current.startTime > 20000 && !motion) {
      stopVideo();
      setState((s) => ({ ...s, scanState: 'error', statusMessage: 'No natural motion detected. Scan stopped.' }));
      return;
    }

    requestAnimationFrame(scanLoop);
  }

  function findBestMatch(descriptor) {
    let best = null;
    let score = 0;
    for (const user of state.users) {
      const dist = faceapi.euclideanDistance(descriptor, user.descriptor);
      const confidence = Math.max(0, Math.min(100, Math.round((1 - dist / DIST_SCALE) * 100)));
      if (confidence > score) {
        score = confidence;
        best = { user, confidence };
      }
    }
    return best;
  }

  async function completeLogin(user, confidence) {
    stopVideo();
    const res = await fetch(`${baseUrl}/api/users/${user.id}/login`, { method: 'PUT' });
    const updated = await res.json();
    await loadUsers();
    setState((s) => ({ ...s, currentUser: updated, view: 'dashboard', scanState: 'ready', statusMessage: `Signed in as ${updated.name}.`, loginConfidence: confidence }));
  }

  async function handleDeleteUser(id) {
    await fetch(`${baseUrl}/api/users/${id}`, { method: 'DELETE' });
    await loadUsers();
    setState((s) => ({ ...s, statusMessage: 'User removed.' }));
  }

  function resetToLogin() {
    stopVideo();
    setState((s) => ({ ...s, view: 'login', scanState: 'ready', overlayMessage: 'Keep your face centered and move slightly.' }));
    startAutoLogin();
  }

  const sortedUsers = [...state.users].sort((a, b) => {
    if (!a.lastLogin) return 1;
    if (!b.lastLogin) return -1;
    return new Date(b.lastLogin) - new Date(a.lastLogin);
  });

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">FacePass React</div>
        <div className="nav-actions">
          {isLoginView && <button onClick={() => setState((s) => ({ ...s, view: 'register' }))}>Register face</button>}
          {isDashboardView && <button onClick={resetToLogin}>Sign out</button>}
        </div>
      </header>

      {state.view === 'loading' && (
        <main className="panel">
          <h1>Loading models</h1>
          <p>{state.statusMessage}</p>
        </main>
      )}

      {state.view === 'login' && (
        <main className="panel">
          <h1>FacePass login</h1>
          <p>{state.users.length ? 'Automatic face scan begins shortly.' : 'Register a face to get started.'}</p>
          <div className="status-card">
            <p>Status: {state.scanState === 'scanning' ? 'Scanning...' : state.statusMessage || 'Ready'}</p>
            <p>{state.overlayMessage}</p>
          </div>
          {state.users.length > 0 ? (
            <section className="user-list">
              {sortedUsers.map((user) => (
                <div key={user.id} className="user-card">
                  <div>
                    <strong>{user.name}</strong>
                    <div>{user.lastLogin ? `Last login: ${new Date(user.lastLogin).toLocaleString()}` : 'Never signed in'}</div>
                  </div>
                  <div className="user-actions">
                    <button onClick={() => startLogin()}>Scan</button>
                    <button className="delete" onClick={() => handleDeleteUser(user.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <div className="empty-state">
              <p>No faces registered yet.</p>
            </div>
          )}
          <button className="primary" onClick={() => setState((s) => ({ ...s, view: 'register' }))}>Register a new face</button>
        </main>
      )}

      {state.view === 'register' && (
        <main className="panel">
          <h1>Register your face</h1>
          <p>Allow camera access, then click Capture to register your face.</p>
          <div className="form-row">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="form-row">
            <button className="primary" onClick={handleRegister} disabled={!name.trim()}>Capture &amp; register</button>
            <button onClick={resetToLogin}>Cancel</button>
          </div>
          <div className="status-card">
            <p>{state.statusMessage}</p>
          </div>
        </main>
      )}

      {state.view === 'dashboard' && state.currentUser && (
        <main className="panel">
          <h1>Welcome, {state.currentUser.name}</h1>
          <div className="stats-grid">
            <div>
              <strong>Match confidence</strong>
              <p>{state.loginConfidence}%</p>
            </div>
            <div>
              <strong>Last login</strong>
              <p>{state.currentUser.lastLogin ? new Date(state.currentUser.lastLogin).toLocaleString() : '-'}</p>
            </div>
          </div>
          <div className="status-card">
            <p>Face verification succeeded.</p>
          </div>
          <button className="primary" onClick={resetToLogin}>Back to login</button>
        </main>
      )}

      <video
        ref={videoRef}
        style={{ display: state.view === 'register' ? 'block' : 'none' }}
        className="preview-video"
        playsInline
        muted
      />
    </div>
  );
}

export default App;
