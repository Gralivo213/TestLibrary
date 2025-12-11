/**
 * IsoMapEngine Library v2.0 (Optimized)
 * Performance Overhaul:
 * - Implemented Asset Preloading System (No more mid-game loading stutter)
 * - specialized 'createImageBitmap' loader for GPU-ready textures
 * - Added 'LOADING' state with visual progress bar
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
            
            // UI Colors
            LOADING_BG: '#111111',
            LOADING_BAR_BG: '#333333',
            LOADING_BAR_FILL: '#e3c076'
        },
        ANIMATION: {
            STAGGER_DELAY: 100, 
            FADE_DURATION: 300  
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

    // --- Asset Manager ---
    const AssetManager = {
        cache: new Map(),
        total: 0,
        loaded: 0,
        
        // Extract all unique URLs from CONFIG
        collectUrls() {
            const urls = new Set();
            urls.add(CONFIG.PLAYER_IMG);
            Object.values(CONFIG.ASSETS).forEach(list => {
                list.forEach(url => urls.add(url));
            });
            return Array.from(urls);
        },

        // High-performance loader using createImageBitmap
        async loadAll() {
            const urls = this.collectUrls();
            this.total = urls.length;
            this.loaded = 0;

            const promises = urls.map(async (url) => {
                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    
                    // createImageBitmap is faster as it decodes off-main-thread and prepares for GPU
                    const bitmap = await createImageBitmap(blob);
                    this.cache.set(url, bitmap);
                } catch (err) {
                    console.error(`Failed to load optimized asset: ${url}`, err);
                    // Fallback for failed blobs or CORS issues
                    await this.loadFallback(url);
                } finally {
                    this.loaded++;
                }
            });

            await Promise.all(promises);
        },

        loadFallback(url) {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.onload = () => {
                    this.cache.set(url, img);
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`Asset completely failed: ${url}`);
                    resolve(); // Resolve anyway to not block game
                };
                img.src = url;
            });
        },

        get(url) {
            return this.cache.get(url);
        },

        getProgress() {
            return this.total === 0 ? 0 : this.loaded / this.total;
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
            // LOADING -> IDLE -> SHOW_RANGE -> SHOW_PATH
            this.state = 'LOADING'; 
            this.validMoves = []; 
            this.selectedPath = []; 
            
            this.animStartTime = 0;
        }

        async start() {
            if (this.active) return;
            this.active = true;
            this.createCanvas();
            
            // Start Loading
            console.log("IsoGameEngine: Preloading Assets...");
            this.loop(); // Start loop immediately to show loading screen
            
            await AssetManager.loadAll();
            
            // Initialization after load
            this.generateChunk(1, 0, 0);
            this.camera.x = window.innerWidth / 2;
            this.camera.y = 100;
            this.state = 'IDLE';
            console.log("IsoGameEngine: Assets Loaded. Game Starting.");
            
            this.attachEvents();
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
                // If the tile already has an asset, don't change it unless necessary
                // to prevent sprite flickering on re-parsing
                if (!this.chunks[tileKey].assetUrl) {
                    const randomImg = assetList[Math.floor(Math.random() * assetList.length)];
                    this.chunks[tileKey].assetUrl = randomImg;
                    this.chunks[tileKey].assetType = type;
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
            if (this.state === 'LOADING') return;
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

        drawLoadingScreen() {
            const w = this.canvas.width;
            const h = this.canvas.height;
            const progress = AssetManager.getProgress();

            this.ctx.fillStyle = CONFIG.COLORS.LOADING_BG;
            this.ctx.fillRect(0, 0, w, h);

            // Bar Container
            const barW = 300;
            const barH = 20;
            const barX = (w - barW) / 2;
            const barY = h / 2;

            this.ctx.fillStyle = CONFIG.COLORS.LOADING_BAR_BG;
            this.ctx.fillRect(barX, barY, barW, barH);

            // Fill
            this.ctx.fillStyle = CONFIG.COLORS.LOADING_BAR_FILL;
            this.ctx.fillRect(barX, barY, barW * progress, barH);

            // Text
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '16px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`Loading Assets... ${Math.floor(progress * 100)}%`, w/2, barY - 15);
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

            // 3. Assets (From Cache)
            if (tile.assetUrl) {
                const img = AssetManager.get(tile.assetUrl);
                // Note: ImageBitmap is drawn identically to Image Element
                if (img) {
                    // Check valid width for ImageBitmap or HTMLImageElement
                    const nW = img.width || img.naturalWidth;
                    const nH = img.height || img.naturalHeight;
                    
                    if (nW > 0) {
                        let scaleFactor = 0.8;
                        if (tile.assetType === 'H') scaleFactor = 0.65;

                        const scale = (w / nW) * scaleFactor; 
                        const dw = nW * scale;
                        const dh = nH * scale;
                        const drawX = x - (dw / 2);
                        const groundOffset = tile.assetType === 'H' ? 0.25 : 0.5;
                        const drawY = (y + h/2) - dh + (h * groundOffset); 
                        this.ctx.drawImage(img, drawX, drawY, dw, dh);
                    }
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
                if (pImg) {
                    this.ctx.drawImage(pImg, -radius, -radius, radius * 2, radius * 2);
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
            
            if (this.state === 'LOADING') {
                this.drawLoadingScreen();
                return;
            }

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
            if (this.state === 'LOADING') return;
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
            if (this.state === 'LOADING') return;
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