/**
 * IsoMapEngine Library v1.1
 * Updates: Added <TileMap> parser and Asset Rendering
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
            HOVER: 'rgba(255, 255, 255, 0.2)'
        },
        // Asset Pool for 'M'
        ASSETS: {
            'M': [
                'https://i.imgur.com/KsayPCL.png',
                'https://i.imgur.com/h25KKtF.png',
                'https://i.imgur.com/op9lNo7.png',
                'https://i.imgur.com/YZEKUoe.png'
            ]
        }
    };

    // --- Image Cache ---
    const imgCache = {};
    function getImage(url) {
        if (!imgCache[url]) {
            const img = new Image();
            img.src = url;
            imgCache[url] = img;
        }
        return imgCache[url];
    }

    // --- The Engine Class ---
    class IsoGameEngine {
        constructor() {
            this.active = false;
            this.canvas = null;
            this.ctx = null;
            this.camera = { x: 0, y: 0, zoom: 1 };
            this.isDragging = false;
            this.lastMouse = { x: 0, y: 0 };
            this.mousePos = { x: 0, y: 0 };
            this.chunks = {}; // Format: "gx,gy" -> Tile Object (Flattened for easier lookup)
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
            // Create tiles for this chunk
            for (let y = 0; y < CONFIG.CHUNK_SIZE; y++) {
                for (let x = 0; x < CONFIG.CHUNK_SIZE; x++) {
                    const gx = (chunkX * CONFIG.CHUNK_SIZE) + x;
                    const gy = (chunkY * CONFIG.CHUNK_SIZE) + y;
                    const key = `${gx},${gy}`;
                    
                    if (!this.chunks[key]) {
                        this.chunks[key] = {
                            gx: gx,
                            gy: gy,
                            lx: x + 1, // Local X (1-10) for user lookup
                            ly: y + 1, // Local Y (1-10) for user lookup
                            chunkId: id,
                            assetUrl: null // No image by default
                        };
                    }
                }
            }
        }

        // --- Parsing Logic ---
        parseMapData(dataStr) {
            console.log("Parsing Map Data...");
            
            // 1. Extract Chunk ID
            const chunkMatch = dataStr.match(/Chunk\s*=\s*(\d+)/);
            if (!chunkMatch) return console.error("No Chunk ID found");
            const chunkId = parseInt(chunkMatch[1]);

            // 2. Extract Location Block content
            const locMatch = dataStr.match(/Location\s*=\s*{([\s\S]*?)}/);
            if (!locMatch) return;
            const content = locMatch[1];

            // 3. Parse Mappings (e.g. M : 1,2|3,4|)
            // Currently looks for "M : coords"
            const lines = content.split('\n');
            lines.forEach(line => {
                if (line.trim().startsWith('M')) {
                    const parts = line.split(':');
                    if (parts.length < 2) return;
                    
                    // Get coordinates part: "1,2|3,4|6,5|"
                    const coordsRaw = parts[1].trim(); 
                    const coordPairs = coordsRaw.split('|');

                    coordPairs.forEach(pair => {
                        if (!pair.includes(',')) return;
                        const [lx, ly] = pair.split(',').map(n => parseInt(n.trim()));
                        
                        // Find the tile in this chunk with local x/y
                        this.updateTileAsset(chunkId, lx, ly, CONFIG.ASSETS.M);
                    });
                }
            });
        }

        updateTileAsset(chunkId, lx, ly, assetList) {
            // Find tile. Since we store flat, we iterate. 
            // (Optimization: In a real game, use a 3D array or hash map with chunkId keys)
            const tileKey = Object.keys(this.chunks).find(k => {
                const t = this.chunks[k];
                return t.chunkId === chunkId && t.lx === lx && t.ly === ly;
            });

            if (tileKey) {
                // Pick random asset
                const randomImg = assetList[Math.floor(Math.random() * assetList.length)];
                this.chunks[tileKey].assetUrl = randomImg;
                // Preload it
                getImage(randomImg);
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

            // -- Draw Block --
            
            // Left Side
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

            // Right Side
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
            
            // Hover check on Top Face
            if (this.ctx.isPointInPath(this.mousePos.x, this.mousePos.y)) {
                this.ctx.fillStyle = CONFIG.COLORS.HOVER;
                this.hoveredTile = tile; // For debugging if needed
            }
            
            this.ctx.fill();
            this.ctx.stroke();

            // -- Draw Asset (3D Billboard) --
            if (tile.assetUrl) {
                const img = getImage(tile.assetUrl);
                if (img.complete && img.naturalWidth > 0) {
                    // Calculate scale to fit tile roughly
                    const scale = (w / img.naturalWidth) * 1.5; // 1.5x tile width
                    const dw = img.naturalWidth * scale;
                    const dh = img.naturalHeight * scale;
                    
                    // Anchor: Bottom Center of image goes to Center of Tile Top Face
                    // Tile Top Face Center = (x, y + h/2)
                    
                    const drawX = x - (dw / 2);
                    const drawY = (y + h/2) - dh + (h * 0.2); // +offset to sink slightly into tile
                    
                    this.ctx.drawImage(img, drawX, drawY, dw, dh);
                }
            }
        }

        render() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Sorting for Isometric Depth (Painters Algorithm)
            // Render tiles with lower (gx + gy) first (Back to Front)
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

    // --- Bootstrapper ---
    const engine = new IsoGameEngine();
    
    // Start Trigger
    const checker = setInterval(() => {
        if (global.Game === "Start") {
            clearInterval(checker);
            engine.start();
        }
    }, 100);

    // External API
    global.UpdateMap = function(dataString) {
        if (engine && engine.active) {
            engine.parseMapData(dataString);
        } else {
            // Queue it or wait? For now, we assume Game is started.
            console.warn("Game engine not active yet. Call Game='Start' first.");
        }
    };

})(window);