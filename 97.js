/**
 * IsoMapEngine Library v2.1 (Progressive Loading)
 * Fixes:
 * - REMOVED blocking wait: Game starts instantly.
 * - Progressive Loading: Assets pop in as they load.
 * - Fallbacks: Draws colored shapes if images are loading or missing.
 * - Assets: Updated to GitHub (Gralivo213/TestLibrary)
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
            SELECTION_CIRCLE: '#ffffff',
            
            // Placeholder Colors (Used while images load)
            PLACEHOLDER_M: '#8b4513', // Brown for mountains/objects
            PLACEHOLDER_H: '#228b22'  // Green for ground/grass
        },
        ANIMATION: {
            STAGGER_DELAY: 100, 
            FADE_DURATION: 300  
        },
        // Updated Assets from GitHub
        ASSETS: {
            'M': [
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/M1.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/M2.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/M3.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/M4.png'
            ],
            'H': [
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H1.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H2.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H3.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H4.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H5.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H6.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H7.png'
            ]
        },
        PLAYER_IMG: 'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/P1.png'
    };

    // --- Asset Manager (Non-Blocking) ---
    const AssetManager = {
        cache: new Map(),
        
        // Load, but don't make the game wait for it
        load(url) {
            if (this.cache.has(url)) return; // Already loading/loaded

            // Mark as loading (null means requested but not ready)
            this.cache.set(url, null);

            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = url;

            img.onload = () => {
                // Once loaded, store it. The next render loop will see it.
                this.cache.set(url, img);
                // Optional: Force a redraw if needed, but the loop handles it
            };

            img.onerror = () => {
                console.warn(`Failed to load: ${url}`);
                // Keep it null or set a flag so we don't retry endlessly
                this.cache.set(url, 'error'); 
            };
        },

        get(url) {
            const asset = this.cache.get(url);
            // If it's the first time seeing this URL, start loading it
            if (asset === undefined) {
                this.load(url);
                return null;
            }
            if (asset === 'error') return null;
            return asset; // Returns null (loading) or Image object (ready)
        }
    };

    // --- Engine ---
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
            this.state = 'IDLE'; 
            this.validMoves = []; 
            this.selectedPath = []; 
            this.animStartTime = 0;
        }

        start() {
            if (this.active) return;
            this.active = true;
            this.createCanvas();
            
            // Removed the "await AssetManager.loadAll()"
            // Game starts NOW. Assets load in background.
            
            this.generateChunk(1, 0, 0);
            this.camera.x = window.innerWidth / 2;
            this.camera.y = 100;

            this.attachEvents();
            this.loop();
            console.log("IsoGameEngine: Started (Progressive Loading Mode).");
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

        attachEvents() {
            window.addEventListener('resize', () => this.resize());
            this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
            window.addEventListener('mouseup', () => this.onMouseUp());
            window.addEventListener('mousemove', (e) => this.onMouseMove(e));
            this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
            this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
                // Pre-fetch player image
                AssetManager.get(CONFIG.PLAYER_IMG); 
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
                if (!this.chunks[tileKey].assetUrl) {
                    const randomImg = assetList[Math.floor(Math.random() * assetList.length)];
                    this.chunks[tileKey].assetUrl = randomImg;
                    this.chunks[tileKey].assetType = type;
                    // Trigger load immediately
                    AssetManager.get(randomImg);
                }
            }
        }

        resetSelection() {
            this.state = 'IDLE';
            this.validMoves = [];
            this.selectedPath = [];
        }

        calculateManhattanMoves() {
            if (!this.player) return;
            this.validMoves = [];
            const pLx = this.player.lx;
            const pLy = this.player.ly;

            Object.values(this.chunks).forEach(tile => {
                if (tile.chunkId !== this.player.chunkId) return;
                if (tile.lx === pLx && tile.ly === pLy) return; 

                const dist = Math.abs(tile.lx - pLx) + Math.abs(tile.ly - pLy);

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
            const pLx = this.player.lx;
            const pLy = this.player.ly;
            const path = [];

            const dist = Math.abs(targetTile.lx - pLx) + Math.abs(targetTile.ly - pLy);
            
            if (dist === 2) {
                let midLx = pLx + Math.sign(targetTile.lx - pLx);
                let midLy = pLy; 
                if (targetTile.lx === pLx) {
                    midLy = pLy + Math.sign(targetTile.ly - pLy);
                }

                const midTile = Object.values(this.chunks).find(t => 
                    t.chunkId === this.player.chunkId && t.lx === midLx && t.ly === midLy
                );
                
                if (midTile) path.push({ tile: midTile, step: 1 });
                path.push({ tile: targetTile, step: 2 });
            } else {
                path.push({ tile: targetTile, step: 1 });
            }
            return path;
        }

        handleTileClick(tile, isRightClick) {
            if (!this.player) return;
            const isPlayerTile = (tile.lx === this.player.lx && tile.ly === this.player.ly);

            if (isRightClick) {
                if (this.state !== 'IDLE') {
                    this.resetSelection();
                    console.log("Action: Cancelled Selection.");
                }
                return;
            }

            if (isPlayerTile) {
                if (this.state === 'IDLE') {
                    this.calculateManhattanMoves();
                    this.state = 'SHOW_RANGE';
                    this.animStartTime = performance.now(); 
                } else {
                    this.resetSelection();
                }
            } else {
                if (this.state === 'SHOW_RANGE') {
                    const move = this.validMoves.find(m => m.key === `${tile.gx},${tile.gy}`);
                    if (move) {
                        this.selectedPath = this.buildPathTo(tile);
                        this.state = 'SHOW_PATH';
                        this.animStartTime = performance.now(); 
                    } else {
                        this.resetSelection();
                    }
                } else if (this.state === 'SHOW_PATH') {
                    this.resetSelection();
                }
            }
        }

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

            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x + w/2, y + h/2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x - w/2, y + h/2);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.TOP;
            this.ctx.fill();
            this.ctx.stroke();

            // 2. Highlights
            if (this.state === 'SHOW_RANGE') {
                const move = this.validMoves.find(m => m.key === tileKey);
                if (move) {
                    const timeElapsed = timestamp - this.animStartTime;
                    const delay = (move.dist - 1) * CONFIG.ANIMATION.STAGGER_DELAY; 
                    
                    if (timeElapsed > delay) {
                        const alphaProgress = Math.min(1, (timeElapsed - delay) / CONFIG.ANIMATION.FADE_DURATION);
                        this.ctx.fillStyle = CONFIG.COLORS.HIGHLIGHT_BLUE.replace(/[\d.]+\)$/, `${0.6 * alphaProgress})`); 
                        this.ctx.fill();
                    }
                }
            }

            if (this.state === 'SHOW_PATH') {
                const pathNode = this.selectedPath.find(n => n.tile === tile);
                if (pathNode) {
                    const timeElapsed = timestamp - this.animStartTime;
                    const delay = (pathNode.step - 1) * CONFIG.ANIMATION.STAGGER_DELAY;
                    
                    if (timeElapsed > delay) {
                        const alphaProgress = Math.min(1, (timeElapsed - delay) / CONFIG.ANIMATION.FADE_DURATION);
                        this.ctx.fillStyle = CONFIG.COLORS.HIGHLIGHT_GOLD.replace(/[\d.]+\)$/, `${0.7 * alphaProgress})`);
                        this.ctx.fill();
                        
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

            // Hover
            if (this.ctx.isPointInPath(this.mousePos.x, this.mousePos.y)) {
                this.ctx.fillStyle = CONFIG.COLORS.HOVER; 
                this.ctx.fill();
                this.hoveredTile = tile; 
            }

            // 3. Assets & Placeholders
            if (tile.assetUrl) {
                // Try to get from cache
                const img = AssetManager.get(tile.assetUrl);
                
                if (img && img.naturalWidth > 0) {
                    // Image is Ready - Draw it
                    let scaleFactor = 0.8;
                    if (tile.assetType === 'H') scaleFactor = 0.65;
                    const scale = (w / img.naturalWidth) * scaleFactor; 
                    const dw = img.naturalWidth * scale;
                    const dh = img.naturalHeight * scale;
                    const drawX = x - (dw / 2);
                    const groundOffset = tile.assetType === 'H' ? 0.25 : 0.5;
                    const drawY = (y + h/2) - dh + (h * groundOffset); 
                    this.ctx.drawImage(img, drawX, drawY, dw, dh);
                } else {
                    // Image NOT Ready - Draw Placeholder Shape
                    this.ctx.save();
                    this.ctx.translate(x, y + h/2);
                    this.ctx.scale(1, 0.5);
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, w * 0.2, 0, Math.PI * 2);
                    this.ctx.fillStyle = (tile.assetType === 'H') ? CONFIG.COLORS.PLACEHOLDER_H : CONFIG.COLORS.PLACEHOLDER_M;
                    this.ctx.fill();
                    this.ctx.restore();
                }
            }

            // 4. Player
            if (this.player && this.player.lx === tile.lx && this.player.ly === tile.ly) {
                const pImg = AssetManager.get(CONFIG.PLAYER_IMG);
                const cx = x;
                const cy = y + h/2;
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
                
                if (pImg && pImg.naturalWidth > 0) {
                     this.ctx.drawImage(pImg, -radius, -radius, radius * 2, radius * 2);
                } else {
                    // Player Placeholder
                    this.ctx.fillStyle = '#ff0000';
                    this.ctx.fill();
                }
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

        render(timestamp) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Normal Render
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