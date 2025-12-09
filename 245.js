/**
 * IsoMapEngine Library v1.5
 * Updates: 
 * - Fixed Herb size (made smaller)
 * - Changed Player to 2D "Flat" token style (lying on tile)
 * - Added assetType tracking for specific scaling
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
            HOVER: 'rgba(0, 0, 0, 0.4)'
        },
        ASSETS: {
            // Mountains
            'M': [
                'https://i.imgur.com/KsayPCL.png',
                'https://i.imgur.com/h25KKtF.png',
                'https://i.imgur.com/op9lNo7.png',
                'https://i.imgur.com/YZEKUoe.png'
            ],
            // Herbs
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
            // Player state: { chunkId, lx, ly }
            this.player = null; 
        }

        start() {
            if (this.active) return;
            this.active = true;
            this.createCanvas();
            this.generateChunk(1, 0, 0);
            
            // Default View
            this.camera.x = window.innerWidth / 2;
            this.camera.y = 100;

            window.addEventListener('resize', () => this.resize());
            this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
            window.addEventListener('mouseup', () => this.onMouseUp());
            window.addEventListener('mousemove', (e) => this.onMouseMove(e));
            this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

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
                            gx: gx,
                            gy: gy,
                            lx: x + 1,
                            ly: y + 1,
                            chunkId: id,
                            assetUrl: null,
                            assetType: null // 'M' or 'H'
                        };
                    }
                }
            }
        }

        parseMapData(dataStr) {
            console.log("Parsing Map Data...");

            // 1. Chunk ID
            const chunkMatch = dataStr.match(/Chunk\s*=\s*(\d+)/);
            if (!chunkMatch) return console.error("No Chunk ID found");
            const chunkId = parseInt(chunkMatch[1]);

            // 2. Player Position
            const playerMatch = dataStr.match(/Player\s*=\s*(\d+)[.,](\d+)/);
            if (playerMatch) {
                this.player = {
                    chunkId: chunkId,
                    lx: parseInt(playerMatch[1]),
                    ly: parseInt(playerMatch[2])
                };
                getImage(CONFIG.PLAYER_IMG); // Preload player
            }

            // 3. Global Scanner for Location Assets (M, H)
            const lineRegex = /([MH])\s*:\s*([0-9.,|\s]+)/g;
            let match;

            while ((match = lineRegex.exec(dataStr)) !== null) {
                const type = match[1]; // 'M' or 'H'
                const coordsRaw = match[2];
                const coordPairs = coordsRaw.split('|');

                const assets = CONFIG.ASSETS[type];
                
                coordPairs.forEach(pair => {
                    pair = pair.trim();
                    if (!pair || pair.length === 0) return;
                    
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

        // Updated to accept 'type'
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

        drawTile(tile) {
            const pos = this.gridToScreen(tile.gx, tile.gy);
            const w = CONFIG.TILE_WIDTH * this.camera.zoom;
            const h = CONFIG.TILE_HEIGHT * this.camera.zoom;
            const d = CONFIG.TILE_THICKNESS * this.camera.zoom;
            const x = pos.x;
            const y = pos.y;

            // --- Draw Block Geometry ---
            
            // Left Face
            this.ctx.beginPath();
            this.ctx.moveTo(x - w/2, y + h/2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x, y + h + d);
            this.ctx.lineTo(x - w/2, y + h/2 + d);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.SIDE_LEFT;
            this.ctx.fill();
            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = CONFIG.COLORS.BORDER;
            this.ctx.stroke();

            // Right Face
            this.ctx.beginPath();
            this.ctx.moveTo(x + w/2, y + h/2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x, y + h + d);
            this.ctx.lineTo(x + w/2, y + h/2 + d);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.SIDE_RIGHT;
            this.ctx.fill();
            this.ctx.stroke();

            // Top Face
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x + w/2, y + h/2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x - w/2, y + h/2);
            this.ctx.closePath();
            
            this.ctx.fillStyle = CONFIG.COLORS.TOP;
            this.ctx.fill();

            // Hover Interaction
            if (this.ctx.isPointInPath(this.mousePos.x, this.mousePos.y)) {
                this.ctx.fillStyle = CONFIG.COLORS.HOVER; 
                this.ctx.fill();
                this.hoveredTile = tile; 
            }
            
            this.ctx.stroke();

            // --- Draw Environmental Asset ---
            if (tile.assetUrl) {
                const img = getImage(tile.assetUrl);
                if (img.complete && img.naturalWidth > 0) {
                    
                    // Specific Scaling based on Type
                    let scaleFactor = 0.8; // Default for Mountains
                    if (tile.assetType === 'H') {
                        scaleFactor = 0.5; // Smaller for Herbs
                    }

                    const scale = (w / img.naturalWidth) * scaleFactor; 
                    const dw = img.naturalWidth * scale;
                    const dh = img.naturalHeight * scale;
                    
                    const drawX = x - (dw / 2);
                    const drawY = (y + h/2) - dh + (h * 0.5); 
                    
                    this.ctx.drawImage(img, drawX, drawY, dw, dh);
                }
            }

            // --- Draw Player (2D / Flat) ---
            if (this.player && this.player.chunkId === tile.chunkId && 
                this.player.lx === tile.lx && this.player.ly === tile.ly) {
                
                const pImg = getImage(CONFIG.PLAYER_IMG);
                if (pImg.complete && pImg.naturalWidth > 0) {
                    this.ctx.save();
                    
                    // 1. Move to Center of Tile Top Face
                    const centerX = x;
                    const centerY = y + h/2; // The geometric center of the diamond
                    
                    this.ctx.translate(centerX, centerY);

                    // 2. Squash vertically to look like it's lying flat
                    this.ctx.scale(1, 0.5); 

                    // 3. Draw image centered
                    const pScale = (w / pImg.naturalWidth) * 0.7; // 70% of tile width
                    const pw = pImg.naturalWidth * pScale;
                    const ph = pImg.naturalHeight * pScale;

                    this.ctx.drawImage(pImg, -pw/2, -ph/2, pw, ph);

                    this.ctx.restore();
                }
            }
        }

        render() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Sort by depth (painter's algorithm)
            const sortedTiles = Object.values(this.chunks).sort((a, b) => {
                return (a.gx + a.gy) - (b.gx + b.gy);
            });
            sortedTiles.forEach(tile => this.drawTile(tile));
        }

        loop() {
            if (!this.active) return;
            this.render();
            requestAnimationFrame(() => this.loop());
        }

        onMouseDown(e) { this.isDragging = true; this.lastMouse = { x: e.clientX, y: e.clientY }; }
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
        } else {
            console.warn("Game engine not active yet. Call Game='Start' first.");
        }
    };

})(window);