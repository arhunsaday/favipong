"use strict";

class FaviPong {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.canvas.width = 16;
    this.canvas.height = 16;

    this.icon = document.createElement("link");
    this.icon.type = "image/x-icon";
    this.icon.rel = "shortcut icon";
    document.getElementsByTagName("head")[0].appendChild(this.icon);

    this.gameState = {
      ball: { x: 8, y: 8, dx: 1, dy: 1 },
      paddle1: { y: 6 },
      paddle2: { y: 6 },
      score1: 0,
      score2: 0,
      gameActive: false,
      winner: null,
    };

    this.isPlayer1 = false;
    this.gameId = null;
    this.playerId = null;

    this.confetti = [];
    this.confettiActive = false;

    this.setupWebSocket();
    this.setupControls();
    this.updateFavicon();
  }

  setupWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.updateConnectionStatus("Connected to server", "green");
      document.getElementById("join-game").disabled = false;
      document.getElementById("create-game").disabled = false;
    };

    this.ws.onclose = () => {
      this.updateConnectionStatus("Disconnected from server", "red");
      document.getElementById("join-game").disabled = true;
      document.getElementById("create-game").disabled = true;
    };

    this.ws.onerror = () => {
      this.updateConnectionStatus("Connection error", "red");
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case "gameCreated":
        this.gameId = message.gameId;
        this.playerId = message.playerId;
        this.isPlayer1 = true;
        this.updateGameStatus(
          `Game created! ID: ${this.gameId}. Waiting for player 2...`
        );
        this.updatePlayerInfo("You are Player 1 (left paddle)");
        break;

      case "gameJoined":
        this.gameId = message.gameId;
        this.playerId = message.playerId;
        this.isPlayer1 = false;
        this.updateGameStatus("Joined game! Get ready...");
        this.updatePlayerInfo("You are Player 2 (right paddle)");
        break;

      case "gameStarted":
        this.gameState.gameActive = true;
        this.updateGameStatus(
          "Game started! Use W/S or ↑/↓ to move your paddle"
        );
        break;

      case "gameState":
        this.gameState = { ...this.gameState, ...message.state };
        this.updateScore();
        this.updateFavicon();
        break;

      case "gameEnded":
        this.gameState.gameActive = false;
        this.gameState.winner = message.winner;
        const winnerText =
          message.winner === this.playerId ? "You won!" : "You lost!";
        this.updateGameStatus(`Game ended! ${winnerText}`);
        if (message.winner === this.playerId) {
          this.startConfetti();
          this.startWebpageConfetti();
        }
        break;

      case "playerDisconnected":
        this.gameState.gameActive = false;
        this.updateGameStatus("Other player disconnected");
        break;

      case "error":
        this.updateGameStatus(`Error: ${message.message}`);
        break;
    }
  }

  setupControls() {
    document.getElementById("create-game").addEventListener("click", () => {
      this.ws.send(JSON.stringify({ type: "createGame" }));
    });

    document.getElementById("join-game").addEventListener("click", () => {
      const gameId = prompt("Enter game ID:");
      if (gameId) {
        this.ws.send(JSON.stringify({ type: "joinGame", gameId }));
      }
    });

    document.addEventListener("keydown", (e) => {
      if (!this.gameState.gameActive) return;

      let direction = 0;
      if (e.key === "w" || e.key === "W" || e.key === "ArrowUp") {
        direction = -1;
      } else if (e.key === "s" || e.key === "S" || e.key === "ArrowDown") {
        direction = 1;
      }

      if (direction !== 0) {
        this.ws.send(
          JSON.stringify({
            type: "playerMove",
            direction,
          })
        );
        e.preventDefault();
      }
    });
  }

  startConfetti() {
    this.confetti = [];
    this.confettiActive = true;

    // Create confetti particles
    const colors = ["#ff0", "#f0f", "#0ff", "#0f0", "#f00", "#00f"];
    for (let i = 0; i < 30; i++) {
      this.confetti.push({
        x: Math.random() * 16,
        y: Math.random() * 16,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0,
        decay: 0.02,
      });
    }

    // Start confetti animation
    this.animateConfetti();

    // Stop confetti after 3 seconds
    setTimeout(() => {
      this.confettiActive = false;
    }, 3000);
  }

  startWebpageConfetti() {
    // Multiple confetti bursts for celebration
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });

    // Left side burst
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
      });
    }, 250);

    // Right side burst
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
      });
    }, 400);

    // Final center burst
    setTimeout(() => {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: [
          "#ff0000",
          "#00ff00",
          "#0000ff",
          "#ffff00",
          "#ff00ff",
          "#00ffff",
        ],
      });
    }, 600);
  }

  animateConfetti() {
    if (!this.confettiActive) return;

    // Update confetti particles
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const particle = this.confetti[i];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= particle.decay;

      // Remove dead particles
      if (particle.life <= 0) {
        this.confetti.splice(i, 1);
      }
    }

    this.updateFavicon();

    // Continue animation
    if (this.confettiActive || this.confetti.length > 0) {
      requestAnimationFrame(() => this.animateConfetti());
    }
  }

  updateFavicon() {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, 16, 16);

    // Draw paddles
    this.ctx.fillStyle = "#fff";
    // Player 1 paddle (left)
    this.ctx.fillRect(1, this.gameState.paddle1.y, 1, 4);
    // Player 2 paddle (right)
    this.ctx.fillRect(14, this.gameState.paddle2.y, 1, 4);

    // Draw ball
    this.ctx.fillStyle = "#ff0";
    this.ctx.fillRect(
      Math.round(this.gameState.ball.x),
      Math.round(this.gameState.ball.y),
      1,
      1
    );

    // Draw center line
    this.ctx.fillStyle = "#666";
    for (let y = 0; y < 16; y += 2) {
      this.ctx.fillRect(8, y, 1, 1);
    }

    // Draw confetti
    for (const particle of this.confetti) {
      this.ctx.fillStyle = particle.color;
      this.ctx.globalAlpha = particle.life;
      this.ctx.fillRect(Math.round(particle.x), Math.round(particle.y), 1, 1);
    }
    this.ctx.globalAlpha = 1.0; // Reset alpha

    // Update favicon
    this.icon.href = this.canvas.toDataURL("image/x-icon");
  }

  updateConnectionStatus(message, color = "white") {
    const statusEl = document.getElementById("connection-status");
    statusEl.textContent = message;
    statusEl.style.color = color;
  }

  updateGameStatus(message) {
    document.getElementById("game-status").textContent = message;
  }

  updatePlayerInfo(message) {
    document.getElementById("player-info").textContent = message;
  }

  updateScore() {
    document.getElementById("player1-score").textContent =
      this.gameState.score1;
    document.getElementById("player2-score").textContent =
      this.gameState.score2;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new FaviPong();
});
