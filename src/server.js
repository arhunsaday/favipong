const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname)));

class PongGame {
    constructor(gameId) {
        this.gameId = gameId;
        this.players = new Map();
        this.gameState = {
            ball: { x: 8, y: 8, dx: 1, dy: 1 },
            paddle1: { y: 6 },
            paddle2: { y: 6 },
            score1: 0,
            score2: 0,
            gameActive: false,
            winner: null
        };
        this.gameLoop = null;
        this.lastUpdate = Date.now();
    }

    addPlayer(ws, playerId) {
        if (this.players.size >= 2) {
            return false;
        }

        const isPlayer1 = this.players.size === 0;
        this.players.set(playerId, {
            ws,
            isPlayer1,
            lastPaddleMove: 0
        });

        if (this.players.size === 2) {
            this.startGame();
        }

        return isPlayer1;
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }
        this.gameState.gameActive = false;

        // Notify remaining player
        for (const [id, player] of this.players) {
            player.ws.send(JSON.stringify({
                type: 'playerDisconnected'
            }));
        }
    }

    startGame() {
        this.gameState.gameActive = true;
        this.gameState.ball = { x: 8, y: 8, dx: Math.random() > 0.5 ? 1 : -1, dy: Math.random() > 0.5 ? 1 : -1 };

        // Notify all players
        for (const [id, player] of this.players) {
            player.ws.send(JSON.stringify({
                type: 'gameStarted'
            }));
        }

        this.gameLoop = setInterval(() => {
            this.updateGame();
        }, 100);
    }

    updateGame() {
        if (!this.gameState.gameActive) return;

        const ball = this.gameState.ball;

        // Move ball
        ball.x += ball.dx * 0.3;
        ball.y += ball.dy * 0.3;

        // Ball collision with top/bottom
        if (ball.y <= 0 || ball.y >= 15) {
            ball.dy = -ball.dy;
            ball.y = Math.max(0, Math.min(15, ball.y));
        }

        // Ball collision with paddles
        const paddle1 = this.gameState.paddle1;
        const paddle2 = this.gameState.paddle2;

        // Left paddle collision
        if (ball.x <= 2 && ball.x >= 1 &&
            ball.y >= paddle1.y && ball.y <= paddle1.y + 4) {
            ball.dx = Math.abs(ball.dx);
            ball.x = 2;
        }

        // Right paddle collision
        if (ball.x >= 13 && ball.x <= 14 &&
            ball.y >= paddle2.y && ball.y <= paddle2.y + 4) {
            ball.dx = -Math.abs(ball.dx);
            ball.x = 13;
        }

        // Scoring
        if (ball.x < 0) {
            this.gameState.score2++;
            this.resetBall();
        } else if (ball.x > 15) {
            this.gameState.score1++;
            this.resetBall();
        }

        // Check for winner
        if (this.gameState.score1 >= 5 || this.gameState.score2 >= 5) {
            this.endGame();
            return;
        }

        // Send game state to all players
        this.broadcastGameState();
    }

    resetBall() {
        this.gameState.ball = {
            x: 8,
            y: 8,
            dx: Math.random() > 0.5 ? 1 : -1,
            dy: Math.random() > 0.5 ? 1 : -1
        };
    }

    endGame() {
        this.gameState.gameActive = false;
        const winner = this.gameState.score1 >= 5 ?
            this.getPlayer1Id() : this.getPlayer2Id();

        this.gameState.winner = winner;

        for (const [id, player] of this.players) {
            player.ws.send(JSON.stringify({
                type: 'gameEnded',
                winner
            }));
        }

        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }
    }

    getPlayer1Id() {
        for (const [id, player] of this.players) {
            if (player.isPlayer1) return id;
        }
        return null;
    }

    getPlayer2Id() {
        for (const [id, player] of this.players) {
            if (!player.isPlayer1) return id;
        }
        return null;
    }

    movePaddle(playerId, direction) {
        const player = this.players.get(playerId);
        if (!player) return;

        const now = Date.now();
        if (now - player.lastPaddleMove < 50) return; // Rate limiting
        player.lastPaddleMove = now;

        if (player.isPlayer1) {
            this.gameState.paddle1.y = Math.max(0, Math.min(12, this.gameState.paddle1.y + direction));
        } else {
            this.gameState.paddle2.y = Math.max(0, Math.min(12, this.gameState.paddle2.y + direction));
        }

        this.broadcastGameState();
    }

    broadcastGameState() {
        const message = JSON.stringify({
            type: 'gameState',
            state: this.gameState
        });

        for (const [id, player] of this.players) {
            player.ws.send(message);
        }
    }
}

class GameManager {
    constructor() {
        this.games = new Map();
        this.playerToGame = new Map();
    }

    createGame(ws) {
        const gameId = Math.random().toString(36).substr(2, 9);
        const playerId = Math.random().toString(36).substr(2, 9);

        const game = new PongGame(gameId);
        this.games.set(gameId, game);

        game.addPlayer(ws, playerId);
        this.playerToGame.set(ws, { gameId, playerId });

        return { gameId, playerId, isPlayer1: true };
    }

    joinGame(ws, gameId) {
        const game = this.games.get(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.players.size >= 2) {
            throw new Error('Game is full');
        }

        const playerId = Math.random().toString(36).substr(2, 9);
        const isPlayer1 = game.addPlayer(ws, playerId);

        this.playerToGame.set(ws, { gameId, playerId });
        return { gameId, playerId, isPlayer1 };
    }

    removePlayer(ws) {
        const playerInfo = this.playerToGame.get(ws);
        if (!playerInfo) return;

        const game = this.games.get(playerInfo.gameId);
        if (game) {
            game.removePlayer(playerInfo.playerId);

            // Remove empty games
            if (game.players.size === 0) {
                this.games.delete(playerInfo.gameId);
            }
        }

        this.playerToGame.delete(ws);
    }

    handlePlayerMove(ws, direction) {
        const playerInfo = this.playerToGame.get(ws);
        if (!playerInfo) return;

        const game = this.games.get(playerInfo.gameId);
        if (game) {
            game.movePaddle(playerInfo.playerId, direction);
        }
    }
}

const gameManager = new GameManager();

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'createGame':
                    const gameInfo = gameManager.createGame(ws);
                    ws.send(JSON.stringify({
                        type: 'gameCreated',
                        ...gameInfo
                    }));
                    break;

                case 'joinGame':
                    try {
                        const joinInfo = gameManager.joinGame(ws, data.gameId);
                        ws.send(JSON.stringify({
                            type: 'gameJoined',
                            ...joinInfo
                        }));
                    } catch (error) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: error.message
                        }));
                    }
                    break;

                case 'playerMove':
                    gameManager.handlePlayerMove(ws, data.direction);
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        gameManager.removePlayer(ws);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`FaviPong server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to play!`);
});