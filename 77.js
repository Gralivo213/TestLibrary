/**
 * IsoMapEngine Library v1.7
 * Updates: 
 * - Player Visual: Changed to 3D Cylinder Token (Checker style) with texture mapping
 * - Herb Visual: Adjusted scale (0.65) and anchoring for better 3D presence
 * - Retained: Movement Tracking, Selection, Parsing
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
            // Movement Highlights
            HIGHLIGHT_NEAR: 'rgba(0, 100, 255, 0.5)', // Distance 1
            HIGHLIGHT_FAR: 'rgba(0, 100, 255, 0.25)', // Distance 2
            SELECTION_CIRCLE: '#ffffff'
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
            this.player = null; // { chunkId, lx, ly }
            
            // Interaction State
            this.highlightedTiles = []; // Array of tile keys accessible by player
            this.selectedTile = null;   // The specific tile the user clicked to move to
        }

        start() {
            if (this.active) return;
            this.active = true;
            this.createCanvas();
            this.generateChunk(1, 0, 0);
            
            this.camera.x = window.innerWidth / 2;
            this.camera.y = 100;

            window.addEventListener('resize', () => this.resize());
            
            // Mouse Events
            this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
            window.addEventListener('mouseup', () => this.onMouseUp());
            window.addEventListener('mousemove', (e) => this.onMouseMove(e));
            this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
            
            // Disable Context Menu for Right Click
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
                            gx: gx,
                            gy: gy,
                            lx: x + 1,
                            ly: y + 1,
                            chunkId: id,
                            assetUrl: null,
                            assetType: null
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

            // 2. Player Position Parsing
            const newPosMatch = dataStr.match(/(?:Player|NewPosition)\s*=\s*(\d+)[.,](\d+)/i);
            const prevPosMatch = dataStr.match(/(?:LastPosition|PreviousPosition|PlayerPrev)\s*=\s*(\d+)[.,](\d+)/i);

            let px, py;

            if (newPosMatch) {
                px = parseInt(newPosMatch[1]);
                py = parseInt(newPosMatch[2]);
            } else if (prevPosMatch) {
                px = parseInt(prevPosMatch[1]);
                py = parseInt(prevPosMatch[2]);
            }

            if (px !== undefined && py !== undefined) {
                this.player = { chunkId: chunkId, lx: px, ly: py };
                getImage(CONFIG.PLAYER_IMG);
                
                // Reset interactions when player moves
                this.highlightedTiles = [];
                this.selectedTile = null;
            }

            // 3. Global Scanner for Location Assets (M, H)
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

        // --- Interaction Logic ---

        calculateMovementRange() {
            if (!this.player) return;

            this.highlightedTiles = [];
            const pLx = this.player.lx;
            const pLy = this.player.ly;

            Object.values(this.chunks).forEach(tile => {
                if (tile.chunkId !== this.player.chunkId) return;

                const dist = Math.max(Math.abs(tile.lx - pLx), Math.abs(tile.ly - pLy));

                if (dist > 0 && dist <= 2) {
                    this.highlightedTiles.push({
                        key: `${tile.gx},${tile.gy}`,
                        dist: dist
                    });
                }
            });
        }

        handleTileClick(tile, isRightClick) {
            if (!this.player) return;

            const isPlayerTile = (tile.chunkId === this.player.chunkId && 
                                tile.lx === this.player.lx && 
                                tile.ly === this.player.ly);

            if (isRightClick) {
                if (isPlayerTile) {
                    this.selectedTile = null;
                    console.log("Action: Deselected target.");
                }
                return;
            }

            if (isPlayerTile) {
                if (this.highlightedTiles.length > 0) {
                    this.highlightedTiles = [];
                } else {
                    this.calculateMovementRange();
                }
            } else {
                const highlightInfo = this.highlightedTiles.find(h => h.key === `${tile.gx},${tile.gy}`);
                if (highlightInfo) {
                    this.selectedTile = tile;
                    console.log(`Action: Selected tile at ${tile.lx},${tile.ly}`);
                } else {
                    this.selectedTile = null;
                    this.highlightedTiles = [];
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

        drawTile(tile) {
            const pos = this.gridToScreen(tile.gx, tile.gy);
            const w = CONFIG.TILE_WIDTH * this.camera.zoom;
            const h = CONFIG.TILE_HEIGHT * this.camera.zoom;
            const d = CONFIG.TILE_THICKNESS * this.camera.zoom;
            const x = pos.x;
            const y = pos.y;
            const tileKey = `${tile.gx},${tile.gy}`;

            // 1. Draw Geometry
            
            // Left Face
            this.ctx.beginPath();
            this.ctx.moveTo(x - w/2, y + h/2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x, y + h + d);
            this.ctx.lineTo(x - w/2, y + h/2 + d);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.SIDE_LEFT;
            this.ctx.fill();
            this.ctx.strokeStyle = CONFIG.COLORS.BORDER;
            this.ctx.lineWidth = 1;
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

            // 2. Overlays (Hover, Highlight)
            
            // Check Highlight
            const highlight = this.highlightedTiles.find(h => h.key === tileKey);
            if (highlight) {
                this.ctx.fillStyle = highlight.dist === 1 ? CONFIG.COLORS.HIGHLIGHT_NEAR : CONFIG.COLORS.HIGHLIGHT_FAR;
                this.ctx.fill();
            }

            // Check Hover
            if (this.ctx.isPointInPath(this.mousePos.x, this.mousePos.y)) {
                this.ctx.fillStyle = CONFIG.COLORS.HOVER; 
                this.ctx.fill();
                this.hoveredTile = tile; 
            }
            
            this.ctx.stroke(); // Stroke the top face

            // 3. Selection Circle
            if (this.selectedTile && this.selectedTile === tile) {
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

            // 4. Assets (Mountains / Herbs)
            if (tile.assetUrl) {
                const img = getImage(tile.assetUrl);
                if (img.complete && img.naturalWidth > 0) {
                    let scaleFactor = 0.8; // Default M
                    
                    // Specific Scaling
                    if (tile.assetType === 'H') {
                        scaleFactor = 0.65; // Fixed size for Herbs
                    }

                    const scale = (w / img.naturalWidth) * scaleFactor; 
                    const dw = img.naturalWidth * scale;
                    const dh = img.naturalHeight * scale;
                    
                    const drawX = x - (dw / 2);
                    // Anchor at tile center (y + h/2)
                    // Offset for grounding: 0.25 (Herbs), 0.5 (Mountains)
                    const groundOffset = tile.assetType === 'H' ? 0.25 : 0.5;
                    const drawY = (y + h/2) - dh + (h * groundOffset); 
                    
                    this.ctx.drawImage(img, drawX, drawY, dw, dh);
                }
            }

            // 5. Player (3D Token Style)
            if (this.player && this.player.chunkId === tile.chunkId && 
                this.player.lx === tile.lx && this.player.ly === tile.ly) {
                
                const pImg = getImage(CONFIG.PLAYER_IMG);
                if (pImg.complete && pImg.naturalWidth > 0) {
                    const cx = x;
                    const cy = y + h/2; // Center of tile face
                    const radius = w * 0.25; // Token radius
                    const thickness = 10 * this.camera.zoom; // Token height

                    // A. Draw Token Side (Cylinder body) - Acts as shadow/base
                    this.ctx.save();
                    this.ctx.translate(cx, cy);
                    this.ctx.scale(1, 0.5); // Isometric Perspective
                    this.ctx.beginPath();
                    // Draw a circle shifted down by 'thickness' (in local space)
                    // But since we are scaled (1, 0.5), we need to adjust visual offset
                    // A simple approximation for a cylinder side is drawing the bottom circle darker
                    this.ctx.arc(0, thickness, radius, 0, Math.PI * 2); 
                    this.ctx.fillStyle = '#222222'; // Dark cylinder side
                    this.ctx.fill();
                    this.ctx.restore();

                    // B. Draw Token Top Face (Clipped Image)
                    this.ctx.save();
                    this.ctx.translate(cx, cy);
                    this.ctx.scale(1, 0.5); // Isometric Perspective

                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    this.ctx.clip(); // Clip to the circle

                    // Fill background
                    this.ctx.fillStyle = '#444444';
                    this.ctx.fill();

                    // Draw Texture
                    // We draw the image covering the circle
                    this.ctx.drawImage(pImg, -radius, -radius, radius * 2, radius * 2);

                    this.ctx.restore();
                    
                    // C. Draw Border Ring
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

        render() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Sort by depth
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

        // --- Inputs ---

        onMouseDown(e) { 
            this.lastMouse = { x: e.clientX, y: e.clientY };
            
            // Check for Tile Click
            if (this.hoveredTile) {
                // e.button: 0 = Left, 2 = Right
                const isRight = e.button === 2;
                this.handleTileClick(this.hoveredTile, isRight);
                
                // If we handled a click on a tile, don't drag camera immediately
                if (!isRight) this.isDragging = true; 
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