const BACKEND_URL = "https://zeroswipe-backend.onrender.com";
const socket = io(BACKEND_URL);

let currentUserId = localStorage.getItem("rinderaUserId");
let currentName = localStorage.getItem("rinderaName");
let currentMatchId = localStorage.getItem("rinderaMatchId");
let currentStatus = localStorage.getItem("rinderaStatus") || "idle";
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

registerBtn.onclick = () => {
  const name = nameInput.value.trim();

  if (!name) {
    showStatus("Enter your name first.");
    return;
  }

  currentName = name;

  if (!currentUserId) {
  currentUserId = null;
}

  localStorage.setItem("rinderaName", currentName);

  socket.emit("register-user", {
    userId: currentUserId,
    name: currentName
  });

  findMatchBtn.disabled = false;
  showStatus("User connected and saved on this device.");
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

socket.on("connect", () => {
  if (!currentStatus || currentStatus === "idle") {
    showStatus("Connected to Rindera backend.");
  }
});

socket.on("registered", (user) => {
  currentUserId = user.userId;
  localStorage.setItem("rinderaUserId", currentUserId);

  findMatchBtn.disabled = false;

  if (currentStatus === "waiting") {
    showStatus("Waiting for another user...");
  } else if (currentStatus === "matched" && currentMatchId) {
    matchTitle.innerText = "Match found";
    matchActions.classList.remove("hidden");
    showStatus("You are still matched.");
  } else {
    showStatus(`Welcome, ${user.name}.`);
  }
});

socket.on("user-status-updated", (data) => {
  if (data.status === "offline" || data.status === "online") {
    return;
  }

  currentStatus = data.status;
  localStorage.setItem("rinderaStatus", currentStatus);

  if (data.matchId) {
    currentMatchId = data.matchId;
    localStorage.setItem("rinderaMatchId", currentMatchId);
  }
});

socket.on("waiting-for-match", () => {
  currentStatus = "waiting";
  localStorage.setItem("rinderaStatus", currentStatus);

  showStatus("Waiting for another user...");
});

socket.on("match-found", (match) => {
  currentMatchId = match.matchId;
  currentStatus = "matched";

  localStorage.setItem("rinderaMatchId", currentMatchId);
  localStorage.setItem("rinderaStatus", currentStatus);

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

    if (currentStatus === "waiting") {
      showStatus("Waiting for another user...");
    } else if (currentStatus === "matched" && currentMatchId) {
      matchTitle.innerText = "Match found";
      matchActions.classList.remove("hidden");
      showStatus("You are still matched.");
    } else {
      showStatus("Welcome back, " + currentName + ".");
    }
  }
});
