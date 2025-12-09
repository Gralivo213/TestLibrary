/**
 * IsoMapEngine Library v1.8
 * Updates: 
 * - Movement Logic: Switched to Manhattan Distance (Orthogonal steps only, Max 2)
 * - Visuals: Added Animation System (Sequential Fade-in for highlights)
 * - Interaction: Golden Path animation on selection
 * - Polish: Smoother transitions and strictly centered player
 */

(function(global) {
    // --- Configuration ---
    const CONFIG = {
        TILE_WIDTH: 64,
        TILE_HEIGHT: 32,
        TILE_THICKNESS: 12,
        CHUNK_SIZE: 10,
        COLORS: {
            TOP: '#e3c076',
            SIDE_LEFT: '#bfa163',
            SIDE_RIGHT: '#a38952',
            BORDER: '#1a1a1a',
            HOVER: 'rgba(0, 0, 0, 0.4)',
            
            // Highlight Colors
            HIGHLIGHT_BLUE: 'rgba(0, 140, 255, 0.6)', 
            HIGHLIGHT_GOLD: 'rgba(255, 215, 0, 0.7)',
            SELECTION_CIRCLE: '#ffffff'
        },
        ANIMATION: {
            STAGGER_DELAY: 100, // ms between dist 1 and dist 2 appearing
            FADE_DURATION: 300  // ms for a tile to fully fade in
        },
        ASSETS: {
            'M': [
                'https://i.imgur.com/KsayPCL.png',
                'https://i.imgur.com/h25KKtF.png',
                'https://i.imgur.com/op9lNo7.png',
                'https://i.imgur.com/YZEKUoe.png'
            ],
            'H': [
                'https://i.imgur.com/AHDWMI4.png',
                'https://i.imgur.com/thg2kZV.png',
                'https://i.imgur.com/eFrXsnK.png',
                'https://i.imgur.com/h8GETPJ.png',
                'https://i.imgur.com/80zCy8y.png',
                'https://i.imgur.com/WdGX61B.png',
                'https://i.imgur.com/fpo53QN.png'
            ]
        },
        PLAYER_IMG: 'https://i.imgur.com/RLV0oiU.png'
    };

    const imgCache = {};
    function getImage(url) {
        if (!imgCache[url]) {
            const img = new Image();
            img.src = url;
            imgCache[url] = img;
        }
        return imgCache[url];
    }

    class IsoGameEngine {
        constructor() {
            this.active = false;
            this.canvas = null;
            this.ctx = null;
            this.camera = { x: 0, y: 0, zoom: 1 };
            
            this.isDragging = false;
            this.lastMouse = { x: 0, y: 0 };
            this.mousePos = { x: 0, y: 0 };
            
            this.chunks = {};
            this.player = null; 
            
            // --- State Management ---
            this.state = 'IDLE'; // IDLE, SHOW_RANGE, SHOW_PATH
            this.validMoves = []; // Array of {tile, dist}
            this.selectedPath = []; // Array of {tile, stepIndex} for golden path
            
            // Animation Timers
            this.animStartTime = 0;
        }

        start() {
            if (this.active) return;
            this.active = true;
            this.createCanvas();
            this.generateChunk(1, 0, 0);
            
            this.camera.x = window.innerWidth / 2;
            this.camera.y = 100;

            window.addEventListener('resize', () => this.resize());
            
            this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
            window.addEventListener('mouseup', () => this.onMouseUp());
            window.addEventListener('mousemove', (e) => this.onMouseMove(e));
            this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
            this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

            this.loop();
            console.log("IsoGameEngine: Started.");
        }

        createCanvas() {
            this.canvas = document.createElement('canvas');
            this.canvas.style.display = 'block';
            this.canvas.style.position = 'absolute';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.zIndex = '-1';
            this.canvas.style.backgroundColor = '#222';
            document.body.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');
            this.resize();
        }

        resize() {
            if (!this.canvas) return;
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }

        generateChunk(id, chunkX, chunkY) {
            for (let y = 0; y < CONFIG.CHUNK_SIZE; y++) {
                for (let x = 0; x < CONFIG.CHUNK_SIZE; x++) {
                    const gx = (chunkX * CONFIG.CHUNK_SIZE) + x;
                    const gy = (chunkY * CONFIG.CHUNK_SIZE) + y;
                    const key = `${gx},${gy}`;
                    
                    if (!this.chunks[key]) {
                        this.chunks[key] = {
                            gx: gx, gy: gy,
                            lx: x + 1, ly: y + 1,
                            chunkId: id,
                            assetUrl: null, assetType: null
                        };
                    }
                }
            }
        }

        parseMapData(dataStr) {
            const chunkMatch = dataStr.match(/Chunk\s*=\s*(\d+)/);
            if (!chunkMatch) return;
            const chunkId = parseInt(chunkMatch[1]);

            const newPosMatch = dataStr.match(/(?:Player|NewPosition)\s*=\s*(\d+)[.,](\d+)/i);
            const prevPosMatch = dataStr.match(/(?:LastPosition|PreviousPosition|PlayerPrev)\s*=\s*(\d+)[.,](\d+)/i);

            let px, py;
            if (newPosMatch) { px = parseInt(newPosMatch[1]); py = parseInt(newPosMatch[2]); }
            else if (prevPosMatch) { px = parseInt(prevPosMatch[1]); py = parseInt(prevPosMatch[2]); }

            if (px !== undefined && py !== undefined) {
                this.player = { chunkId: chunkId, lx: px, ly: py };
                getImage(CONFIG.PLAYER_IMG);
                this.resetSelection();
            }

            const lineRegex = /([MH])\s*:\s*([0-9.,|\s]+)/g;
            let match;
            while ((match = lineRegex.exec(dataStr)) !== null) {
                const type = match[1];
                const coordsRaw = match[2];
                const coordPairs = coordsRaw.split('|');
                const assets = CONFIG.ASSETS[type];
                
                coordPairs.forEach(pair => {
                    pair = pair.trim();
                    if (!pair) return;
                    const splitChar = pair.includes(',') ? ',' : '.';
                    const parts = pair.split(splitChar);
                    if (parts.length >= 2) {
                        const lx = parseInt(parts[0].trim());
                        const ly = parseInt(parts[1].trim());
                        this.updateTileAsset(chunkId, lx, ly, assets, type);
                    }
                });
            }
        }

        updateTileAsset(chunkId, lx, ly, assetList, type) {
            const tileKey = Object.keys(this.chunks).find(k => {
                const t = this.chunks[k];
                return t.chunkId === chunkId && t.lx === lx && t.ly === ly;
            });
            if (tileKey) {
                const randomImg = assetList[Math.floor(Math.random() * assetList.length)];
                this.chunks[tileKey].assetUrl = randomImg;
                this.chunks[tileKey].assetType = type;
                getImage(randomImg);
            }
        }

        resetSelection() {
            this.state = 'IDLE';
            this.validMoves = [];
            this.selectedPath = [];
        }

        // --- Logic: Manhattan Movement ---

        calculateManhattanMoves() {
            if (!this.player) return;
            this.validMoves = [];
            const pLx = this.player.lx;
            const pLy = this.player.ly;

            Object.values(this.chunks).forEach(tile => {
                if (tile.chunkId !== this.player.chunkId) return;
                if (tile.lx === pLx && tile.ly === pLy) return; // Ignore self

                // Manhattan Distance: |x1 - x2| + |y1 - y2|
                const dist = Math.abs(tile.lx - pLx) + Math.abs(tile.ly - pLy);

                // Rule: Max 2 steps orthogonal
                if (dist <= 2) {
                    this.validMoves.push({
                        key: `${tile.gx},${tile.gy}`,
                        tile: tile,
                        dist: dist
                    });
                }
            });
        }

        buildPathTo(targetTile) {
            // Simple path reconstruction for Manhattan distance <= 2
            // We need a path: Player -> Intermediate -> Target (or just Player -> Target if dist 1)
            
            const pLx = this.player.lx;
            const pLy = this.player.ly;
            const path = [];

            // Step 1: Add intermediate if dist is 2
            const dist = Math.abs(targetTile.lx - pLx) + Math.abs(targetTile.ly - pLy);
            
            if (dist === 2) {
                // Find a valid intermediate tile (dist 1 from player AND dist 1 from target)
                // Since it's a grid, there are usually 1 or 2 options. We pick one.
                // Try moving X first
                let midLx = pLx + Math.sign(targetTile.lx - pLx);
                let midLy = pLy; 
                // If X didn't change (vertical move 2 steps), move Y
                if (targetTile.lx === pLx) {
                    midLy = pLy + Math.sign(targetTile.ly - pLy);
                }

                // Find this tile object
                const midTile = Object.values(this.chunks).find(t => 
                    t.chunkId === this.player.chunkId && t.lx === midLx && t.ly === midLy
                );
                
                if (midTile) path.push({ tile: midTile, step: 1 });
                path.push({ tile: targetTile, step: 2 });
            } else {
                // Dist 1
                path.push({ tile: targetTile, step: 1 });
            }
            
            return path;
        }

        // --- Interaction ---

        handleTileClick(tile, isRightClick) {
            if (!this.player) return;
            const isPlayerTile = (tile.lx === this.player.lx && tile.ly === this.player.ly);

            if (isRightClick) {
                // Right Click: Reset all
                if (this.state !== 'IDLE') {
                    this.resetSelection();
                    console.log("Action: Cancelled Selection.");
                }
                return;
            }

            // Left Click Logic
            if (isPlayerTile) {
                // Click Player: Toggle Range
                if (this.state === 'IDLE') {
                    this.calculateManhattanMoves();
                    this.state = 'SHOW_RANGE';
                    this.animStartTime = performance.now(); // Start fade-in
                } else {
                    this.resetSelection();
                }
            } else {
                // Click Other Tile
                if (this.state === 'SHOW_RANGE') {
                    // Check if it's a valid move
                    const move = this.validMoves.find(m => m.key === `${tile.gx},${tile.gy}`);
                    if (move) {
                        // Valid Move Clicked: Switch to Path Selection
                        this.selectedPath = this.buildPathTo(tile);
                        this.state = 'SHOW_PATH';
                        this.animStartTime = performance.now(); // Reset timer for path animation
                    } else {
                        // Clicked invalid tile
                        this.resetSelection();
                    }
                } else if (this.state === 'SHOW_PATH') {
                    // Clicking again deselects or selects new? Let's just reset for now
                    this.resetSelection();
                }
            }
        }

        // --- Rendering ---

        gridToScreen(gx, gy) {
            const halfW = CONFIG.TILE_WIDTH / 2;
            const halfH = CONFIG.TILE_HEIGHT / 2;
            const screenX = (gx - gy) * halfW;
            const screenY = (gx + gy) * halfH;
            return {
                x: (screenX * this.camera.zoom) + this.camera.x,
                y: (screenY * this.camera.zoom) + this.camera.y
            };
        }

        drawTile(tile, timestamp) {
            const pos = this.gridToScreen(tile.gx, tile.gy);
            const w = CONFIG.TILE_WIDTH * this.camera.zoom;
            const h = CONFIG.TILE_HEIGHT * this.camera.zoom;
            const d = CONFIG.TILE_THICKNESS * this.camera.zoom;
            const x = pos.x;
            const y = pos.y;
            const tileKey = `${tile.gx},${tile.gy}`;

            // 1. Draw Geometry
            this.ctx.beginPath();
            this.ctx.moveTo(x - w/2, y + h/2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x, y + h + d);
            this.ctx.lineTo(x - w/2, y + h/2 + d);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.SIDE_LEFT;
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(x + w/2, y + h/2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x, y + h + d);
            this.ctx.lineTo(x + w/2, y + h/2 + d);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.SIDE_RIGHT;
            this.ctx.fill();
            this.ctx.stroke();

            // Top Face Path
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x + w/2, y + h/2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x - w/2, y + h/2);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.TOP;
            this.ctx.fill();
            this.ctx.stroke();

            // 2. Highlights & Animations
            
            // A. Blue Range Highlights (One by one fade in)
            if (this.state === 'SHOW_RANGE') {
                const move = this.validMoves.find(m => m.key === tileKey);
                if (move) {
                    // Animation Logic
                    const timeElapsed = timestamp - this.animStartTime;
                    const delay = (move.dist - 1) * CONFIG.ANIMATION.STAGGER_DELAY; // Dist 1=0ms, Dist 2=100ms
                    
                    if (timeElapsed > delay) {
                        const alphaProgress = Math.min(1, (timeElapsed - delay) / CONFIG.ANIMATION.FADE_DURATION);
                        // Parse color to add alpha
                        this.ctx.fillStyle = CONFIG.COLORS.HIGHLIGHT_BLUE.replace(/[\d.]+\)$/, `${0.6 * alphaProgress})`); 
                        this.ctx.fill();
                    }
                }
            }

            // B. Golden Path Highlights (Sequential)
            if (this.state === 'SHOW_PATH') {
                const pathNode = this.selectedPath.find(n => n.tile === tile);
                if (pathNode) {
                    const timeElapsed = timestamp - this.animStartTime;
                    const delay = (pathNode.step - 1) * CONFIG.ANIMATION.STAGGER_DELAY;
                    
                    if (timeElapsed > delay) {
                        const alphaProgress = Math.min(1, (timeElapsed - delay) / CONFIG.ANIMATION.FADE_DURATION);
                        this.ctx.fillStyle = CONFIG.COLORS.HIGHLIGHT_GOLD.replace(/[\d.]+\)$/, `${0.7 * alphaProgress})`);
                        this.ctx.fill();
                        
                        // Add selection circle on the very last tile of the path
                        if (pathNode.step === this.selectedPath.length && alphaProgress > 0.8) {
                            this.ctx.save();
                            this.ctx.translate(x, y + h/2);
                            this.ctx.scale(1, 0.5);
                            this.ctx.beginPath();
                            this.ctx.arc(0, 0, w * 0.3, 0, Math.PI * 2);
                            this.ctx.lineWidth = 3;
                            this.ctx.strokeStyle = CONFIG.COLORS.SELECTION_CIRCLE;
                            this.ctx.stroke();
                            this.ctx.restore();
                        }
                    }
                }
            }

            // Hover (Standard)
            if (this.ctx.isPointInPath(this.mousePos.x, this.mousePos.y)) {
                this.ctx.fillStyle = CONFIG.COLORS.HOVER; 
                this.ctx.fill();
                this.hoveredTile = tile; 
            }

            // 3. Assets
            if (tile.assetUrl) {
                const img = getImage(tile.assetUrl);
                if (img.complete && img.naturalWidth > 0) {
                    let scaleFactor = 0.8;
                    if (tile.assetType === 'H') scaleFactor = 0.65;

                    const scale = (w / img.naturalWidth) * scaleFactor; 
                    const dw = img.naturalWidth * scale;
                    const dh = img.naturalHeight * scale;
                    const drawX = x - (dw / 2);
                    const groundOffset = tile.assetType === 'H' ? 0.25 : 0.5;
                    const drawY = (y + h/2) - dh + (h * groundOffset); 
                    this.ctx.drawImage(img, drawX, drawY, dw, dh);
                }
            }

            // 4. Player (Centered 3D Token)
            if (this.player && this.player.lx === tile.lx && this.player.ly === tile.ly) {
                const pImg = getImage(CONFIG.PLAYER_IMG);
                if (pImg.complete && pImg.naturalWidth > 0) {
                    const cx = x;
                    const cy = y + h/2; // Exact geometric center of top face
                    const radius = w * 0.25; 
                    const thickness = 10 * this.camera.zoom; 

                    // Token Side
                    this.ctx.save();
                    this.ctx.translate(cx, cy);
                    this.ctx.scale(1, 0.5); 
                    this.ctx.beginPath();
                    this.ctx.arc(0, thickness, radius, 0, Math.PI * 2); 
                    this.ctx.fillStyle = '#222222'; 
                    this.ctx.fill();
                    this.ctx.restore();

                    // Token Top
                    this.ctx.save();
                    this.ctx.translate(cx, cy);
                    this.ctx.scale(1, 0.5); 
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    this.ctx.clip(); 
                    this.ctx.fillStyle = '#444444';
                    this.ctx.fill();
                    this.ctx.drawImage(pImg, -radius, -radius, radius * 2, radius * 2);
                    this.ctx.restore();
                    
                    // Ring
                    this.ctx.save();
                    this.ctx.translate(cx, cy);
                    this.ctx.scale(1, 0.5);
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeStyle = '#ffffff';
                    this.ctx.stroke();
                    this.ctx.restore();
                }
            }
        }

        render(timestamp) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Sort by depth
            const sortedTiles = Object.values(this.chunks).sort((a, b) => {
                return (a.gx + a.gy) - (b.gx + b.gy);
            });
            sortedTiles.forEach(tile => this.drawTile(tile, timestamp));
        }

        loop(timestamp) {
            if (!this.active) return;
            this.render(timestamp);
            requestAnimationFrame((ts) => this.loop(ts));
        }

        // --- Inputs ---
        onMouseDown(e) { 
            this.lastMouse = { x: e.clientX, y: e.clientY };
            if (this.hoveredTile) {
                this.handleTileClick(this.hoveredTile, e.button === 2);
                if (e.button !== 2) this.isDragging = true; 
            } else {
                if (e.button === 0) this.isDragging = true;
            }
        }
        
        onMouseUp() { this.isDragging = false; }
        
        onMouseMove(e) {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;
                this.camera.x += dx;
                this.camera.y += dy;
                this.lastMouse = { x: e.clientX, y: e.clientY };
            }
        }
        
        onWheel(e) {
            e.preventDefault();
            const scaleAmount = -e.deltaY * 0.001;
            this.camera.zoom = Math.min(Math.max(this.camera.zoom + scaleAmount, 0.5), 3.0);
        }
    }

    const engine = new IsoGameEngine();
    const checker = setInterval(() => {
        if (global.Game === "Start") {
            clearInterval(checker);
            engine.start();
        }
    }, 100);

    global.UpdateMap = function(dataString) {
        if (engine && engine.active) {
            engine.parseMapData(dataString);
        }
    };

})(window);