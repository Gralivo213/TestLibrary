/**
 * IsoMapEngine Library v1.3
 * Updates: 
 * - Fixed hovering assets (grounded mountains)
 * - Fixed transparent hover (now properly darkens)
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
            HOVER: 'rgba(0, 0, 0, 0.4)' // Darken tint
        },
        ASSETS: {
            'M': [
                'https://i.imgur.com/KsayPCL.png',
                'https://i.imgur.com/h25KKtF.png',
                'https://i.imgur.com/op9lNo7.png',
                'https://i.imgur.com/YZEKUoe.png'
            ]
        }
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
                            assetUrl: null
                        };
                    }
                }
            }
        }

        parseMapData(dataStr) {
            const chunkMatch = dataStr.match(/Chunk\s*=\s*(\d+)/);
            if (!chunkMatch) return console.error("No Chunk ID found");
            const chunkId = parseInt(chunkMatch[1]);

            const locMatch = dataStr.match(/Location\s*=\s*{([\s\S]*?)}/);
            if (!locMatch) return;
            const content = locMatch[1];

            const lines = content.split('\n');
            lines.forEach(line => {
                if (line.trim().startsWith('M')) {
                    const parts = line.split(':');
                    if (parts.length < 2) return;
                    
                    const coordsRaw = parts[1].trim(); 
                    const coordPairs = coordsRaw.split('|');

                    coordPairs.forEach(pair => {
                        if (!pair.includes(',')) return;
                        const [lx, ly] = pair.split(',').map(n => parseInt(n.trim()));
                        this.updateTileAsset(chunkId, lx, ly, CONFIG.ASSETS.M);
                    });
                }
            });
        }

        updateTileAsset(chunkId, lx, ly, assetList) {
            const tileKey = Object.keys(this.chunks).find(k => {
                const t = this.chunks[k];
                return t.chunkId === chunkId && t.lx === lx && t.ly === ly;
            });

            if (tileKey) {
                const randomImg = assetList[Math.floor(Math.random() * assetList.length)];
                this.chunks[tileKey].assetUrl = randomImg;
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

            // -- Draw Block --
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
            
            // 1. Draw Base Color (Always)
            this.ctx.fillStyle = CONFIG.COLORS.TOP;
            this.ctx.fill();

            // 2. Draw Hover Tint (Overlay)
            if (this.ctx.isPointInPath(this.mousePos.x, this.mousePos.y)) {
                this.ctx.fillStyle = CONFIG.COLORS.HOVER; // Dark transparent layer
                this.ctx.fill();
                this.hoveredTile = tile; 
            }
            
            this.ctx.stroke();

            // -- Draw Asset (Adjusted Position) --
            if (tile.assetUrl) {
                const img = getImage(tile.assetUrl);
                if (img.complete && img.naturalWidth > 0) {
                    const scale = (w / img.naturalWidth) * 0.8; 
                    const dw = img.naturalWidth * scale;
                    const dh = img.naturalHeight * scale;
                    
                    const drawX = x - (dw / 2);
                    
                    // CHANGED: Increased the offset to 0.5 to sink the mountains properly
                    // This moves the image further "down" the screen, grounding it on the tile center.
                    const drawY = (y + h/2) - dh + (h * 0.5); 
                    
                    this.ctx.drawImage(img, drawX, drawY, dw, dh);
                }
            }
        }

        render() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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