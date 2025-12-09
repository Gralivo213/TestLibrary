/**
 * IsoMapEngine Library
 * A drop-in 3D tile map engine.
 * * USAGE:
 * 1. Include this script.
 * 2. Set global variable: Game = "Start"
 */

(function(global) {
    // --- Configuration ---
    const CONFIG = {
        TILE_WIDTH: 64,       // Width of the tile sprite
        TILE_HEIGHT: 32,      // Height of the top face
        TILE_THICKNESS: 12,   // Height of the 3D extrusion
        CHUNK_SIZE: 10,       // 10x10 grid
        COLORS: {
            TOP: '#e3c076',     // Yellowish/Brown
            SIDE_LEFT: '#bfa163',
            SIDE_RIGHT: '#a38952',
            BORDER: '#000000',
            HOVER: 'rgba(0, 0, 0, 0.2)'
        }
    };

    // --- The Engine Class ---
    class IsoGameEngine {
        constructor() {
            this.active = false;
            this.canvas = null;
            this.ctx = null;
            
            // Viewport
            this.camera = { x: 0, y: 0, zoom: 1 };
            
            // Interaction
            this.isDragging = false;
            this.lastMouse = { x: 0, y: 0 };
            this.mousePos = { x: 0, y: 0 };
            
            // Data
            this.chunks = {}; 
            this.hoveredTile = null;
        }

        start() {
            if (this.active) return;
            this.active = true;

            this.createCanvas();
            this.generateChunk(1, 0, 0); // Initial 10x10 chunk
            
            // Center camera
            this.camera.x = window.innerWidth / 2;
            this.camera.y = 100;

            // Events
            window.addEventListener('resize', () => this.resize());
            this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
            window.addEventListener('mouseup', () => this.onMouseUp());
            window.addEventListener('mousemove', (e) => this.onMouseMove(e));
            this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

            // Start Loop
            this.loop();
            console.log("IsoGameEngine: Started.");
        }

        createCanvas() {
            // Create full screen canvas
            this.canvas = document.createElement('canvas');
            this.canvas.style.display = 'block';
            this.canvas.style.position = 'absolute';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.zIndex = '-1'; // Background
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
            const tiles = [];
            // Generate 10x10
            for (let y = 0; y < CONFIG.CHUNK_SIZE; y++) {
                for (let x = 0; x < CONFIG.CHUNK_SIZE; x++) {
                    tiles.push({
                        // Logical Grid Coordinates
                        gx: (chunkX * CONFIG.CHUNK_SIZE) + x,
                        gy: (chunkY * CONFIG.CHUNK_SIZE) + y,
                        // Display Data
                        h: 0 // Height offset (flat for now)
                    });
                }
            }
            this.chunks[`${chunkX},${chunkY}`] = tiles;
        }

        // --- Math & Rendering ---

        // Convert Grid (x,y) to Screen (x,y)
        gridToScreen(gx, gy) {
            const halfW = CONFIG.TILE_WIDTH / 2;
            const halfH = CONFIG.TILE_HEIGHT / 2;
            
            // Isometric Formula
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
            const d = CONFIG.TILE_THICKNESS * this.camera.zoom; // depth/thickness

            const x = pos.x;
            const y = pos.y;

            // 1. Draw Left Side
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

            // 2. Draw Right Side
            this.ctx.beginPath();
            this.ctx.moveTo(x + w/2, y + h/2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x, y + h + d);
            this.ctx.lineTo(x + w/2, y + h/2 + d);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.SIDE_RIGHT;
            this.ctx.fill();
            this.ctx.stroke();

            // 3. Draw Top Face
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x + w/2, y + h/2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x - w/2, y + h/2);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.TOP;
            this.ctx.fill();
            this.ctx.stroke();

            // 4. Hover Effect
            // We use the current path (Top Face) to check hover
            if (this.ctx.isPointInPath(this.mousePos.x, this.mousePos.y)) {
                this.hoveredTile = tile;
                this.ctx.fillStyle = CONFIG.COLORS.HOVER;
                this.ctx.fill();
            }
        }

        render() {
            // Clear
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            this.hoveredTile = null; // Reset per frame

            // Render all chunks
            // Note: For proper Z-indexing in isometric, we usually loop Y then X,
            // or simply sum (x+y) to determine draw order. 
            // Since our list is simple, we just iterate.
            
            Object.values(this.chunks).forEach(tiles => {
                tiles.forEach(tile => {
                    this.drawTile(tile);
                });
            });
        }

        loop() {
            if (!this.active) return;
            this.render();
            requestAnimationFrame(() => this.loop());
        }

        // --- Inputs ---

        onMouseDown(e) {
            this.isDragging = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
        }

        onMouseUp() {
            this.isDragging = false;
        }

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
            const newZoom = Math.min(Math.max(this.camera.zoom + scaleAmount, 0.5), 3.0);
            this.camera.zoom = newZoom;
        }
    }

    // --- Bootstrapper ---
    // Polls for the 'Game' global variable
    const engine = new IsoGameEngine();
    
    const checker = setInterval(() => {
        if (global.Game === "Start") {
            clearInterval(checker);
            engine.start();
        }
    }, 100);

})(window);