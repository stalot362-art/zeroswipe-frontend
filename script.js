const BACKEND_URL = "https://rindera-backend.onrender.com";
const SUPABASE_URL = "https://czmojquewgsrfafkjejy.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bW9qcXVld2dzcmZhZmtqZWp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MzUyOTYsImV4cCI6MjA5NzMxMTI5Nn0.dMSTEQ84ns74_OpKxapw3mds4DCG2JUAmndV_cawO2Q";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
const socket = io(BACKEND_URL);

let currentUserId = localStorage.getItem("rinderaUserId");
let currentName = localStorage.getItem("rinderaName");
let currentMatchId = null;
let currentRequestType = null;
let pendingScheduleTime = null;

const nameInput = document.getElementById("name-input");
const registerBtn = document.getElementById("register-btn");
const findMatchBtn = document.getElementById("find-match-btn");

const matchActions = document.getElementById("match-actions");
const matchTitle = document.getElementById("match-title");

const videoDateBtn = document.getElementById("video-date-btn");
const gameDateBtn = document.getElementById("game-date-btn");
const scheduleInput = document.getElementById("schedule-input");
const scheduleDateBtn = document.getElementById("schedule-date-btn");

const requestBox = document.getElementById("request-box");
const requestText = document.getElementById("request-text");
const acceptRequestBtn = document.getElementById("accept-request-btn");

const statusBox = document.getElementById("status-box");

function showStatus(message) {
  statusBox.innerText = message;
}
registerBtn.onclick = async () => {
  const name = nameInput.value.trim();

  if (!name) {
    showStatus("Enter your name first.");
    return;
  }

  currentName = name;

  if (!currentUserId) {
    currentUserId = "user_" + Date.now();
    localStorage.setItem("rinderaUserId", currentUserId);
  }

  localStorage.setItem("rinderaName", currentName);

  const { error } = await supabaseClient
    .from("users")
    .upsert({
      id: currentUserId,
      name: currentName
    });

  if (error) {
    showStatus("Could not save user.");
    console.log(error);
    return;
  }

  socket.emit("register-user", {
    userId: currentUserId,
    name: currentName
  });

  showStatus("User saved and connected.");
};


  showStatus("Connecting...");
};

findMatchBtn.onclick = () => {
  socket.emit("find-match", {
    userId: currentUserId
  });

  showStatus("Searching for match...");
};

videoDateBtn.onclick = () => {
  socket.emit("request-video-date", {
    matchId: currentMatchId,
    fromUserId: currentUserId
  });

  showStatus("Video date request sent.");
};

gameDateBtn.onclick = () => {
  socket.emit("request-game-date", {
    matchId: currentMatchId,
    fromUserId: currentUserId
  });

  showStatus("Game date request sent.");
};

scheduleDateBtn.onclick = () => {
  const dateTime = scheduleInput.value;

  if (!dateTime) {
    showStatus("Choose a date and time first.");
    return;
  }

  socket.emit("request-scheduled-date", {
    matchId: currentMatchId,
    fromUserId: currentUserId,
    dateTime
  });

  showStatus("Scheduled date request sent.");
};

acceptRequestBtn.onclick = () => {
  if (currentRequestType === "video") {
    socket.emit("accept-video-date", {
      matchId: currentMatchId
    });
  }

  if (currentRequestType === "game") {
    socket.emit("accept-game-date", {
      matchId: currentMatchId
    });
  }

  if (currentRequestType === "schedule") {
    socket.emit("accept-scheduled-date", {
      matchId: currentMatchId,
      dateTime: pendingScheduleTime
    });
  }

  requestBox.classList.add("hidden");
};

// Backend events

socket.on("connect", () => {
  showStatus("Connected to Rindera backend.");
});

socket.on("registered", (user) => {
  showStatus(`Welcome, ${user.name}.`);
  findMatchBtn.disabled = false;
});

socket.on("waiting-for-match", () => {
  showStatus("Waiting for another user...");
});

socket.on("match-found", (match) => {
  currentMatchId = match.matchId;

  matchTitle.innerText = "Match found";
  matchActions.classList.remove("hidden");

  showStatus("You have been matched.");
});

socket.on("video-date-request", (data) => {
  currentRequestType = "video";
  currentMatchId = data.matchId;

  requestText.innerText = "Your match wants to start a video date.";
  requestBox.classList.remove("hidden");
});

socket.on("video-date-started", (data) => {
  showStatus(`Video date started. Room: ${data.roomId}`);
});

socket.on("game-date-request", (data) => {
  currentRequestType = "game";
  currentMatchId = data.matchId;

  requestText.innerText = "Your match wants to start a game date.";
  requestBox.classList.remove("hidden");
});

socket.on("game-date-started", (data) => {
  showStatus(`Game date started. Session: ${data.gameSessionId}`);
});

socket.on("scheduled-date-request", (data) => {
  currentRequestType = "schedule";
  currentMatchId = data.matchId;
  pendingScheduleTime = data.dateTime;

  requestText.innerText = `Your match wants to schedule a date for ${data.dateTime}.`;
  requestBox.classList.remove("hidden");
});

socket.on("scheduled-date-confirmed", (data) => {
  showStatus(`Scheduled date confirmed: ${data.dateTime}`);
});

socket.on("error-message", (message) => {
  showStatus(message);
});

window.addEventListener("load", () => {
  if (currentUserId && currentName) {
    nameInput.value = currentName;

    socket.emit("register-user", {
      userId: currentUserId,
      name: currentName
    });

    findMatchBtn.disabled = false;
    showStatus("Welcome back, " + currentName + ".");
  }
});
