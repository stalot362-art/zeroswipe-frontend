// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE   = "https://zeroswipe-backend.onrender.com";
const SOCKET_URL = "https://zeroswipe-backend.onrender.com";

// Replace with your actual Paystack public key
const PAYSTACK_KEY = "pk_test_9c2f196e59c2005240508904c30b324a8ceb44cb";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ── State ─────────────────────────────────────────────────────────────────────
let userId      = "";
let loading     = null;
let callState   = "idle";  // idle | joining | waiting | connected | error
let callStatus  = "";
let payRequired = false;
let isSearching = false;

// ── Refs ──────────────────────────────────────────────────────────────────────
let localStream  = null;
let pc           = null;
let rtcSocket    = null;
let matchSocket  = null;
let roomId       = "";

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Stop matching socket ──────────────────────────────────────────────────────
function stopMatching() {
  if (matchSocket) { matchSocket.disconnect(); matchSocket = null; }
  isSearching = false;
  loading     = null;
  render();
}

// ── Tear down call ────────────────────────────────────────────────────────────
function cleanup() {
  stopMatching();
  if (localStream)  { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (pc)           { pc.close(); pc = null; }
  if (rtcSocket)    { rtcSocket.disconnect(); rtcSocket = null; }
  $("local-video").srcObject  = null;
  $("remote-video").srcObject = null;
  callState  = "idle";
  callStatus = "";
  render();
}

// ── WebRTC peer connection ────────────────────────────────────────────────────
function createPeerConnection(socket) {
  const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  conn.onicecandidate = (e) => {
    if (e.candidate) socket.emit("ice-candidate", { roomId, candidate: e.candidate });
  };

  conn.ontrack = (e) => {
    if (e.streams[0]) {
      $("remote-video").srcObject = e.streams[0];
      callState  = "connected";
      callStatus = "Connected";
      render();
    }
  };

  conn.onconnectionstatechange = () => {
    if (conn.connectionState === "disconnected" || conn.connectionState === "failed") {
      callStatus = "Partner disconnected";
      $("remote-video").srcObject = null;
      render();
    }
  };

  if (localStream) localStream.getTracks().forEach(t => conn.addTrack(t, localStream));
  return conn;
}

// ── Join video call (WebRTC signalling) ───────────────────────────────────────
async function joinCall(rid) {
  callState  = "joining";
  callStatus = "Requesting camera…";
  render();

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
    $("local-video").srcObject = localStream;
  } catch {
    callState  = "error";
    callStatus = "Camera / mic access denied";
    render();
    return;
  }

  roomId = rid;
  const socket = io(SOCKET_URL, { transports: ["websocket"] });
  rtcSocket = socket;

  socket.on("connect", () => {
    callStatus = "Joining room…";
    render();
    socket.emit("join-room", roomId);
  });

  socket.on("connect_error", () => {
    callState  = "error";
    callStatus = "Could not reach signaling server";
    render();
  });

  socket.on("waiting", () => {
    callState  = "waiting";
    callStatus = "Waiting for partner to connect…";
    render();
  });

  socket.on("user-joined", async () => {
    callStatus = "Partner joined — connecting…";
    render();
    if (pc) pc.close();
    pc = createPeerConnection(socket);
    try {
      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      socket.emit("offer", { roomId, offer });
    } catch (e) { console.error("offer error:", e); }
  });

  socket.on("offer", async (data) => {
    callStatus = "Received offer — answering…";
    render();
    if (pc) pc.close();
    pc = createPeerConnection(socket);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { roomId, answer });
    } catch (e) { console.error("answer error:", e); }
  });

  socket.on("answer", async (data) => {
    try { await pc?.setRemoteDescription(new RTCSessionDescription(data.answer)); }
    catch (e) { console.error("setRemoteDescription error:", e); }
  });

  socket.on("ice-candidate", async (data) => {
    try {
      if (pc?.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch { /* stale */ }
  });

  socket.on("user-left", () => {
    callStatus = "Partner left the call";
    $("remote-video").srcObject = null;
    render();
  });

  render();
}

// ── Real-time matching via socket.io ──────────────────────────────────────────
function handleGetMatch() {
  userId = $("user-id-input").value.trim();
  if (!userId) { showStatus("error", "Please enter a User ID first."); return; }

  loading     = "match";
  isSearching = true;
  payRequired = false;
  showStatus("info", "Looking for a match…");
  render();

  const socket = io(SOCKET_URL, { transports: ["websocket"] });
  matchSocket  = socket;

  socket.on("connect", () => {
    socket.emit("find-match", userId);
  });

  socket.on("connect_error", () => {
    stopMatching();
    showStatus("error", "Could not reach server. Please try again.");
  });

  socket.on("waiting", () => {
    showStatus("info", "Waiting for a match…");
  });

  socket.on("match-found", async ({ roomId: rid }) => {
    stopMatching();
    showStatus("success", "Match found! Connecting you now…");
    await joinCall(rid);
  });

  socket.on("payment-required", () => {
    stopMatching();
    payRequired = true;
    showStatus("info", "Please pay $1 to continue.");
    render();
  });
}

function handleCancelSearch() {
  stopMatching();
  showStatus("info", "Search cancelled.");
}

// ── Unmatch ───────────────────────────────────────────────────────────────────
async function handleUnmatch() {
  userId = $("user-id-input").value.trim();
  if (!userId) { showStatus("error", "Please enter a User ID first."); return; }

  loading = "unmatch";
  hideStatus();
  cleanup();
  render();

  try { await axios.post(`${API_BASE}/unmatch`, { userId }); }
  catch { /* proceed anyway */ }

  loading     = null;
  payRequired = true;
  showStatus("info", "You unmatched. Pay $1 to continue.");
  render();
}

// ── Payment ───────────────────────────────────────────────────────────────────
async function notifyBackendPay(reference) {
  try {
    const res  = await fetch(`${API_BASE}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, reference }),
    });
    const data = await res.json().catch(() => null);
    const msg  = typeof data === "string" ? data : (data?.message ?? data?.msg ?? null);
    showStatus("success", msg ?? "Payment successful.");
    payRequired = false;
  } catch {
    showStatus("error", "Payment confirmed but server update failed.");
  } finally {
    loading = null;
    render();
  }
}

function handlePay() {
  userId = $("user-id-input").value.trim();
  if (!userId) { showStatus("error", "Please enter a User ID first."); return; }

  if (!PAYSTACK_KEY || PAYSTACK_KEY.includes("xxx")) {
    showStatus("error", "Payment not configured. Set PAYSTACK_KEY in script.js.");
    return;
  }

  loading = "pay";
  hideStatus();
  render();

  const popup = new PaystackPop();
  popup.newTransaction({
    key:      PAYSTACK_KEY,
    email:    `${userId}@zeroswipe.app`,
    amount:   165000,           // ₦1,650 ≈ $1
    currency: "NGN",
    ref:      `zeroswipe-${userId}-${Date.now()}`,
    label:    "ZeroSwipe – $1 match fee",
    onClose:  () => { showStatus("info", "Payment cancelled."); loading = null; render(); },
    onSuccess: (response) => { notifyBackendPay(response.reference); },
  });
}

// ── Create user ───────────────────────────────────────────────────────────────
async function handleCreateUser() {
  userId = $("user-id-input").value.trim();
  if (!userId) { showStatus("error", "Please enter a User ID first."); return; }

  loading = "create-user";
  hideStatus();
  render();

  try {
    await axios.post(`${API_BASE}/create-user`, { userId });
    showStatus("success", "User created successfully.");
  } catch {
    showStatus("error", "Could not create user. Please try again.");
  } finally {
    loading = null;
    render();
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────
function showStatus(type, message) {
  const el    = $("status-banner");
  const cls   = { success: "status-success", error: "status-error", info: "status-info" };
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  el.className = `status-banner ${cls[type]}`;
  el.innerHTML = `<span class="icon">${icons[type]}</span><span class="msg">${message}</span>`;
}

function hideStatus() {
  const el = $("status-banner");
  el.className = "status-banner hidden";
  el.innerHTML = "";
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const isInCall = callState !== "idle" && callState !== "error";

  // Video section
  $("video-section").classList.toggle("hidden", !isInCall);

  // Call status text
  const csEl = $("call-status");
  if (callStatus) { csEl.textContent = callStatus; csEl.classList.remove("hidden"); }
  else            { csEl.classList.add("hidden"); }

  // Remote video opacity + spinner
  $("remote-video").style.opacity = callState === "connected" ? "1" : "0";
  $("remote-spinner").classList.toggle("hidden", callState === "connected");

  // LIVE badge
  $("live-badge").classList.toggle("hidden", callState !== "connected");

  // User ID input
  $("user-id-input").disabled = isInCall || isSearching;

  // Get Match button vs searching indicator
  $("get-match-btn").classList.toggle("hidden", isSearching);
  $("searching-indicator").classList.toggle("hidden", !isSearching);
  $("get-match-btn").disabled = loading !== null || isInCall;

  // Other buttons
  $("create-user-btn").disabled = loading !== null || isSearching;
  $("unmatch-btn").disabled     = loading !== null || isSearching;

  // Pay button
  $("pay-btn").classList.toggle("hidden", !payRequired);
  $("pay-btn").disabled = loading !== null;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  $("create-user-btn").addEventListener("click", handleCreateUser);
  $("get-match-btn").addEventListener("click", handleGetMatch);
  $("cancel-search-btn").addEventListener("click", handleCancelSearch);
  $("end-call-btn").addEventListener("click", cleanup);
  $("pay-btn").addEventListener("click", handlePay);

  // Unmatch modal
  $("unmatch-btn").addEventListener("click", () => $("unmatch-modal").classList.remove("hidden"));
  $("modal-stay-btn").addEventListener("click", () => $("unmatch-modal").classList.add("hidden"));
  $("modal-unmatch-btn").addEventListener("click", () => {
    $("unmatch-modal").classList.add("hidden");
    handleUnmatch();
  });
  $("unmatch-modal").addEventListener("click", (e) => {
    if (e.target === $("unmatch-modal")) $("unmatch-modal").classList.add("hidden");
  });

  // Stop modal box clicks bubbling to overlay
  $("modal-box").addEventListener("click", (e) => e.stopPropagation());

  // Keep userId synced as user types
  $("user-id-input").addEventListener("input", (e) => { userId = e.target.value; });

  render();
});
