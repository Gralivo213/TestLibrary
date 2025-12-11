/**
 * IsoMapEngine Library v2.3 (High Quality Animation)
 * Features:
 * - Progressive Loading (Assets pop in).
 * - Step-by-Step Animation (Move -> Stop -> Move).
 * - Initial Delay (0.5s) before movement starts.
 * - Eased Interpolation (Smoother visual quality).
 * - UI Overlay: Movement Popup with Copy & Play Replay Button.
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
            
            // Placeholder Colors
            PLACEHOLDER_M: '#8b4513', 
            PLACEHOLDER_H: '#228b22'
        },
        ANIMATION: {
            INITIAL_DELAY: 500, // ms to wait before starting
            MOVE_DURATION: 600, // ms to move one tile (Slower = smoother)
            STEP_DELAY: 200,    // ms to wait on tile after arriving
            STAGGER_DELAY: 100, 
            FADE_DURATION: 300
        },
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
            ],
            'T': [
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/Tree1.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/Tree2.png'
            ]
        },
        PLAYER_IMG: 'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/P1.png'
    };

    // --- Asset Manager ---
    const AssetManager = {
        cache: new Map(),
        load(url) {
            if (this.cache.has(url)) return;
            this.cache.set(url, null);
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = url;
            img.onload = () => this.cache.set(url, img);
            img.onerror = () => this.cache.set(url, 'error'); 
        },
        get(url) {
            const asset = this.cache.get(url);
            if (asset === undefined) {
                this.load(url);
                return null;
            }
            if (asset === 'error') return null;
            return asset; 
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
            
            // Player Object with Detailed Animation State
            this.player = {
                chunkId: 1,
                lx: 0, ly: 0,           
                prevLx: 0, prevLy: 0,   
                visualLx: 0, visualLy: 0, 
                
                // Animation State Machine
                isAnimating: false,
                animState: 'IDLE', // IDLE, INITIAL_DELAY, PREPARE_STEP, MOVING, PAUSED
                pathQueue: [],
                animTimer: 0,      // Timestamp marker
                startNode: null,   // {lx, ly} start of current step
                targetNode: null   // {lx, ly} end of current step
            };
            
            // --- State Management ---
            this.state = 'IDLE'; 
            this.validMoves = []; 
            this.selectedPath = []; 
            this.animStartTime = 0;
            this.herbData = {};
            this.treeData = {};
            
            // UI Elements
            this.ui = {
                popup: null,
                popupText: null,
                playBtn: null
            };
        }

        start() {
            if (this.active) return;
            this.active = true;
            this.createCanvas();
            this.createUI(); 
            
            this.generateChunk(1, 0, 0);
            this.camera.x = window.innerWidth / 2;
            this.camera.y = 100;

            this.attachEvents();
            this.loop();
            console.log("IsoGameEngine: Started v2.3");
        }

        createCanvas() {
            this.canvas = document.createElement('canvas');
            this.canvas.style.display = 'block';
            this.canvas.style.position = 'absolute';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.zIndex = '0';
            this.canvas.style.backgroundColor = '#222';
            document.body.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');
            this.resize();
        }

        createUI() {
            // 1. Inject Styles
            const style = document.createElement('style');
            style.textContent = `
                .iso-ui-popup {
                    position: fixed;
                    bottom: 20px;
                    left: 20px;
                    background: rgba(30, 30, 30, 0.95);
                    border: 1px solid #444;
                    border-left: 4px solid #e3c076;
                    border-radius: 4px;
                    padding: 10px 15px;
                    color: #eee;
                    font-family: monospace;
                    font-size: 13px;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                    z-index: 10;
                    display: none;
                    flex-direction: row;
                    align-items: center;
                    gap: 10px;
                }
                .iso-ui-popup.visible { display: flex; }
                .iso-btn-icon {
                    background: #444;
                    border: none;
                    color: white;
                    border-radius: 4px;
                    width: 24px;
                    height: 24px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                }
                .iso-btn-icon:hover { background: #666; }
                .iso-play-btn {
                    position: fixed;
                    top: 20px;
                    left: 20px;
                    background: rgba(30, 30, 30, 0.9);
                    border: 2px solid #e3c076;
                    border-radius: 50%;
                    width: 50px;
                    height: 50px;
                    cursor: pointer;
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                    transition: transform 0.1s;
                }
               .iso-play-btn:active { transform: scale(0.95); }
                .iso-sense-btn {
                    position: fixed;
                    top: 20px;
                    left: 80px;
                    background: rgba(30, 30, 30, 0.9);
                    border: 2px solid #e3c076;
                    border-radius: 50%;
                    width: 50px;
                    height: 50px;
                    cursor: pointer;
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                    transition: transform 0.1s;
                    color: #e3c076;
                    font-size: 24px;
                }
                .iso-sense-btn:active { transform: scale(0.95); }
                .iso-play-icon {
                    width: 0; 
                    height: 0; 
                    border-top: 10px solid transparent;
                    border-bottom: 10px solid transparent;
                    border-left: 18px solid #e3c076;
                    margin-left: 4px;
                }
.iso-herb-panel { 
                    position: fixed;
                    right: 0;
                    top: 10vh;
                    width: 24vw;
                    height: 80vh;                    background: url('https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/HerbUI.png') no-repeat center center;
                    background-size: 100% 100%;
                    z-index: 20;
                    opacity: 0;
                    transform: translateY(50px);
                    pointer-events: none;
                    transition: opacity 0.5s ease, transform 0.5s ease;
                }
                .iso-herb-panel.visible {
                    opacity: 1;
                    transform: translateY(0);
pointer-events: auto;
                }
                @font-face { font-family: 'KoreanCalligraphy'; src: url('https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/Font/Korean_Calligraphy.ttf'); }
                .iso-herb-details {
                    padding: 15% 12%;
                    font-family: 'KoreanCalligraphy', serif;
                    color: #2b1d0e;
                    height: 100%;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                    text-align: center;
                }
                .herb-title { font-size: 22px; border-bottom: 2px solid rgba(43, 29, 14, 0.3); padding-bottom: 12px; margin-bottom: 15px; line-height: 1.3; font-weight: bold; }
                .herb-elem { font-size: 0.65em; vertical-align: super; font-weight: bold; margin-left: 2px; }
                .herb-lore { font-size: 18px; flex-grow: 1; overflow-y: auto; text-align: justify; margin-bottom: 20px; white-space: pre-wrap; line-height: 1.5; }
                .growth-wrap { margin-top: auto; text-align: left; width: 100%; }
                .growth-txt { font-size: 16px; margin-bottom: 6px; font-weight: bold; color: #2b1d0e; text-align: center; }
.growth-track { height: 10px; width: 100%; background: linear-gradient(90deg, #d32f2f, #fbc02d, #388e3c); border-radius: 5px; border: 1px solid #3e2723; position: relative; }
                .growth-stick { position: absolute; top: -5px; width: 4px; height: 20px; background: #000; border: 1px solid #fff; transform: translateX(-50%); box-shadow: 0 0 2px rgba(0,0,0,0.5); }
                
                .iso-actions { display: flex; gap: 15px; margin-top: 20px; justify-content: center; }
                .iso-btn-action {
                    background: transparent;
                    border: 3px solid;
                    padding: 8px 0;
                    flex: 1;
                    font-family: 'KoreanCalligraphy', serif;
                    font-size: 20px;
                    font-weight: bold;
                    cursor: pointer;
                    text-transform: uppercase;
                    transition: all 0.3s ease;
                }
                .btn-harvest { color: #ff3333; border-color: #ff3333; }
                .btn-feed { color: #33cc33; border-color: #33cc33; }
                
                .btn-harvest:hover { box-shadow: 0 0 10px #ff3333; }
                .btn-feed:hover { box-shadow: 0 0 10px #33cc33; }

                .btn-harvest.active { background: rgba(255, 51, 51, 0.15); box-shadow: 0 0 15px #ff3333; text-shadow: 0 0 5px #ff3333; }
                .btn-feed.active { background: rgba(51, 204, 51, 0.15); box-shadow: 0 0 15px #33cc33; text-shadow: 0 0 5px #33cc33; }
                
                .iso-btn-action.disabled { border-color: #555; color: #555; pointer-events: none; opacity: 0.5; box-shadow: none; }
                
                .iso-tree-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: auto; padding-bottom: 20px; }
                .iso-btn-stone {
                    background: #5c5c5c;
                    color: #e0e0e0;
                    border: 2px solid #333;
                    padding: 8px;
                    font-family: 'KoreanCalligraphy', serif;
                    font-size: 16px;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: inset 0 2px 5px rgba(255,255,255,0.1), 0 3px 5px rgba(0,0,0,0.5);
                    text-transform: capitalize;
                }
                .iso-btn-stone:hover { background: #6e6e6e; color: #fff; }
                .iso-btn-stone.active {
                    background: #3e3e3e;
                    border-color: #e3c076;
                    color: #e3c076;
                    box-shadow: inset 0 0 10px rgba(0,0,0,0.8);
                    transform: translateY(2px);
                }
                .iso-btn-stone.disabled { opacity: 0.4; pointer-events: none; filter: grayscale(1); }
                .iso-btn-stone.wide { grid-column: span 2; }
            `;
            document.head.appendChild(style);
            // Herb UI
            const herbPanel = document.createElement('div');
            herbPanel.className = 'iso-herb-panel';
            document.body.appendChild(herbPanel);
            this.ui.herbPanel = herbPanel;
            // 2. Play Button
            const playBtn = document.createElement('div');
            playBtn.className = 'iso-play-btn';
playBtn.innerHTML = '<div class="iso-play-icon"></div>';
            playBtn.onclick = () => this.replayAnimation();
            document.body.appendChild(playBtn);
            this.ui.playBtn = playBtn;

            // Sense Button
            const senseBtn = document.createElement('div');
            senseBtn.className = 'iso-sense-btn';
            senseBtn.innerHTML = '👁️'; // Eye icon for Sense
            senseBtn.onclick = () => this.triggerSense();
            document.body.appendChild(senseBtn);

          // 3. Popup
            const popup = document.createElement('div');
            popup.className = 'iso-ui-popup';
            
            const popupText = document.createElement('span');
            popupText.textContent = "Waiting for input...";
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'iso-btn-icon';
            copyBtn.innerHTML = '📋';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(popupText.textContent).then(() => {
                    const original = copyBtn.innerHTML;
                    copyBtn.innerHTML = '✓';
                    setTimeout(() => copyBtn.innerHTML = original, 1000);
                });
            };

            popup.appendChild(popupText);
            popup.appendChild(copyBtn);
            document.body.appendChild(popup);
            
            this.ui.popup = popup;
            this.ui.popupText = popupText;
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
                            assetUrl: null, assetType: null,
                            assetHidden: false
                        };
                    }
                }
            }
        }

        triggerSense() {
            if (!this.player) return;
            this.state = 'SENSE_ACTIVE';
            this.animStartTime = performance.now();
            this.validMoves = []; // Re-use validMoves for highlighting

            const pLx = this.player.lx;
            const pLy = this.player.ly;

            // 1. Calculate Range (3 Tiles) & Reveal Hidden
            Object.values(this.chunks).forEach(tile => {
                if (tile.chunkId !== this.player.chunkId) return;
                const dist = Math.abs(tile.lx - pLx) + Math.abs(tile.ly - pLy);

              if (dist <= 3) {
                    // Add to highlight list
                    this.validMoves.push({
                        key: `${tile.gx},${tile.gy}`,
                        tile: tile,
                        dist: dist
                    });
                }
            });

            // 2. Update UI
            const txt = `Player is using sense at tile ${pLx},${pLy}.`;
            this.ui.popupText.textContent = txt;
            this.ui.popup.classList.add('visible');
        }

parseMapData(dataStr) {
            const getV = (content, r) => (content.match(r) || [])[1] || '';

            // Parse Herb Data
            const herbRegex = /<Herb>([\s\S]*?)<\/Herb>/g;
            let hMatch;
            while ((hMatch = herbRegex.exec(dataStr)) !== null) {
                const content = hMatch[1];
                const tileMatch = content.match(/Tile\s*=\s*(\d+)[.,](\d+)/i);
                if (tileMatch) {
                    const k = `${tileMatch[1]},${tileMatch[2]}`;
                    this.herbData[k] = {
                        age: getV(content, /Age\s*=\s*(.*)/i).trim(),
                        rank: getV(content, /Rank\s*=\s*(.*)/i).trim(),
                        name: getV(content, /Name\s*=\s*(.*)/i).trim(),
                        element: getV(content, /Element\s*=\s*(.*)/i).trim(),
                        lore: getV(content, /Lore\s*=\s*(.*)/i).trim(),
                        growth: parseInt(getV(content, /Growth\s*=\s*(\d+)/i)) || 0
                    };
                }
            }

            // Parse Tree Data
            const treeRegex = /<Tree>([\s\S]*?)<\/Tree>/g;
            let tMatch;
            while ((tMatch = treeRegex.exec(dataStr)) !== null) {
                const content = tMatch[1];
                const tileMatch = content.match(/Tile\s*=\s*(\d+)[.,](\d+)/i);
                if (tileMatch) {
                    const k = `${tileMatch[1]},${tileMatch[2]}`;
                    this.treeData[k] = {
                        age: getV(content, /Age\s*=\s*(.*)/i).trim(),
                        element: getV(content, /Element\s*=\s*(.*)/i).trim(),
                        name: getV(content, /Name\s*=\s*(.*)/i).trim(),
                        lore: getV(content, /Lore\s*=\s*(.*)/i).trim(),
                    };
                }
            }

            const chunkMatch = dataStr.match(/Chunk\s*=\s*(\d+)/);
            if (!chunkMatch) return;
            const chunkId = parseInt(chunkMatch[1]);

            const newPosMatch = dataStr.match(/(?:Player|NewPosition)\s*=\s*(\d+)[.,](\d+)/i);
            const prevPosMatch = dataStr.match(/(?:LastPosition|PreviousPosition|PlayerPrev)\s*=\s*(\d+)[.,](\d+)/i);
// Assets
            const lineRegex = /([MHT]|Hidden|Reveal)\s*:\s*([0-9.,|\s]+)/g;
            let match;
            while ((match = lineRegex.exec(dataStr)) !== null) {
                const type = match[1];
                const coordsRaw = match[2];
                const coordPairs = coordsRaw.split('|');
                
                // If it's a hidden/reveal tag, we don't need asset list, just coords
                const assets = (type !== 'Hidden' && type !== 'Reveal') ? CONFIG.ASSETS[type] : null;
                
                coordPairs.forEach(pair => {
                    pair = pair.trim();
                    if (!pair) return;
                    const splitChar = pair.includes(',') ? ',' : '.';
                    const parts = pair.split(splitChar);
                    if (parts.length >= 2) {
                        const lx = parseInt(parts[0].trim());
                        const ly = parseInt(parts[1].trim());
                        
                        if (type === 'Hidden') {
                            const tile = this.getTile(chunkId, lx, ly);
                            if (tile) tile.assetHidden = true;
                        } else if (type === 'Reveal') {
                            const tile = this.getTile(chunkId, lx, ly);
                            if (tile) tile.assetHidden = false;
                        } else {
                            this.updateTileAsset(chunkId, lx, ly, assets, type);
                        }
                    }
                });
            }

            // Player Logic
                        if (newPosMatch) {
                const newLx = parseInt(newPosMatch[1]);
                const newLy = parseInt(newPosMatch[2]);
                this.player.chunkId = chunkId;

                if (prevPosMatch) {
                    const prevLx = parseInt(prevPosMatch[1]);
                    const prevLy = parseInt(prevPosMatch[2]);
                    
                    this.player.prevLx = prevLx;
                    this.player.prevLy = prevLy;
                    this.player.lx = newLx;
                    this.player.ly = newLy;
                    
                    this.replayAnimation();
                } else {
                    this.player.lx = newLx;
                    this.player.ly = newLy;
                    this.player.visualLx = newLx;
                    this.player.visualLy = newLy;
                    this.player.isAnimating = false;
                }
                AssetManager.get(CONFIG.PLAYER_IMG); 
                this.resetSelection();
            }
        }

      replayAnimation() {
            // Hide UI if open
            if (this.ui.herbPanel) this.ui.herbPanel.classList.remove('visible');

            // 1. Reset visual to previous
            this.player.visualLx = this.player.prevLx;
            this.player.visualLy = this.player.prevLy;
            
            // 2. Build Path
            const startTile = this.getTile(this.player.chunkId, this.player.prevLx, this.player.prevLy);
            const endTile = this.getTile(this.player.chunkId, this.player.lx, this.player.ly);

            if (startTile && endTile) {
                this.player.pathQueue = this.buildPathNodes(startTile, endTile);
                this.player.isAnimating = true;
                this.player.animState = 'INITIAL_DELAY';
                this.player.animTimer = performance.now();
            } else {
                this.player.visualLx = this.player.lx;
                this.player.visualLy = this.player.ly;
                this.player.isAnimating = false;
            }
        }

        getTile(chunkId, lx, ly) {
            return Object.values(this.chunks).find(t => 
                t.chunkId === chunkId && t.lx === lx && t.ly === ly
            );
        }

        buildPathNodes(startTile, endTile) {
            const nodes = [];
            // Simple Manhattan path generation
            let currX = startTile.lx;
            let currY = startTile.ly;
            
            // X direction
            while (currX !== endTile.lx) {
                currX += Math.sign(endTile.lx - currX);
                nodes.push({ lx: currX, ly: currY });
            }
            // Y direction
            while (currY !== endTile.ly) {
                currY += Math.sign(endTile.ly - currY);
                nodes.push({ lx: currX, ly: currY });
            }
            return nodes;
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
            if (this.player.isAnimating) return;

            const isPlayerTile = (tile.lx === this.player.lx && tile.ly === this.player.ly);

            if (isRightClick) {
                if (this.state !== 'IDLE') {
                    this.resetSelection();
                    this.ui.popup.classList.remove('visible');
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
                    this.ui.popup.classList.remove('visible');
                }
            } else {
                if (this.state === 'SHOW_RANGE') {
                    const move = this.validMoves.find(m => m.key === `${tile.gx},${tile.gy}`);
                    if (move) {
                        this.selectedPath = this.buildPathTo(tile);
                        this.state = 'SHOW_PATH';
                        this.animStartTime = performance.now(); 
                        this.showMovementPopup(tile);
                    } else {
                        this.resetSelection();
                        this.ui.popup.classList.remove('visible');
                    }
                }
            }
        }

        showMovementPopup(targetTile) {
            const txt = `Player at ${this.player.lx},${this.player.ly} moving to ${targetTile.lx},${targetTile.ly}.`;
            this.ui.popupText.textContent = txt;
            this.ui.popup.classList.add('visible');
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

            // 1. Geometry
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
            if (this.state === 'SHOW_RANGE' || this.state === 'SENSE_ACTIVE') {
                const move = this.validMoves.find(m => m.key === tileKey);
                if (move) {
                    const timeElapsed = timestamp - this.animStartTime;
                    const delay = (move.dist - 1) * CONFIG.ANIMATION.STAGGER_DELAY; 
                    
                    if (timeElapsed > delay) {
                        const alphaProgress = Math.min(1, (timeElapsed - delay) / CONFIG.ANIMATION.FADE_DURATION);
                        // Blue for Movement, Gold for Sense
                        const colorBase = (this.state === 'SENSE_ACTIVE') ? CONFIG.COLORS.HIGHLIGHT_GOLD : CONFIG.COLORS.HIGHLIGHT_BLUE;
                        this.ctx.fillStyle = colorBase.replace(/[\d.]+\)$/, `${0.6 * alphaProgress})`); 
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

            /// 3. Assets
            if (tile.assetUrl && !tile.assetHidden) {
                const img = AssetManager.get(tile.assetUrl);
                if (img && img.naturalWidth > 0) {
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
        }

        drawPlayer() {
            if (!this.player) return;

            const gx = this.player.visualLx - 1; 
            const gy = this.player.visualLy - 1;
            const pos = this.gridToScreen(gx, gy);
            const w = CONFIG.TILE_WIDTH * this.camera.zoom;
            const x = pos.x;
            const y = pos.y; 

            const pImg = AssetManager.get(CONFIG.PLAYER_IMG);
            const radius = w * 0.25; 
            const thickness = 10 * this.camera.zoom; 

// Body
            this.ctx.save();
            this.ctx.translate(x, y + (CONFIG.TILE_HEIGHT * this.camera.zoom)/2);
            this.ctx.scale(1, 0.5);
            this.ctx.beginPath();            this.ctx.arc(0, thickness, radius, 0, Math.PI * 2); 
            this.ctx.fillStyle = '#222222'; 
            this.ctx.fill();
            this.ctx.restore();

            // Top
            this.ctx.save();
            this.ctx.translate(x, y + (CONFIG.TILE_HEIGHT * this.camera.zoom)/2);
            this.ctx.scale(1, 0.5); 
            this.ctx.beginPath();
            this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
            this.ctx.clip(); 
            this.ctx.fillStyle = '#444444';
            this.ctx.fill();
            
            if (pImg && pImg.naturalWidth > 0) {
                 this.ctx.drawImage(pImg, -radius, -radius, radius * 2, radius * 2);
            } else {
                this.ctx.fillStyle = '#ff0000';
                this.ctx.fill();
            }
            this.ctx.restore();
            
            // Ring
            this.ctx.save();
            this.ctx.translate(x, y + (CONFIG.TILE_HEIGHT * this.camera.zoom)/2);
            this.ctx.scale(1, 0.5);
            this.ctx.beginPath();
            this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
            this.ctx.lineWidth = 2;
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.stroke();
            this.ctx.restore();
        }

        updateAnimation(timestamp) {
            if (!this.player.isAnimating) return;

            // 1. Initial Delay
            if (this.player.animState === 'INITIAL_DELAY') {
                if (timestamp - this.player.animTimer > CONFIG.ANIMATION.INITIAL_DELAY) {
                    this.player.animState = 'PREPARE_STEP';
                }
                return;
            }

          // 2. Prepare Next Tile
            if (this.player.animState === 'PREPARE_STEP') {
                if (this.player.pathQueue.length === 0) {
                    this.player.isAnimating = false;
                    this.player.animState = 'IDLE';
                    // Snap to exact
                    this.player.visualLx = this.player.lx;
                    this.player.visualLy = this.player.ly;

// Check for Asset Interaction (Herb or Tree)
                    const tile = this.getTile(this.player.chunkId, this.player.lx, this.player.ly);
                    if (tile && (tile.assetType === 'H' || tile.assetType === 'T')) {
                        if (this.ui.herbPanel) {
                            const colors = { 'Fire': '#d32f2f', 'Earth': '#795548', 'Ice': '#81d4fa', 'Wind': '#9e9e9e', 'Water': '#1a237e' };
                            
                            // HERB UI
                            if (tile.assetType === 'H') {
                                const data = this.herbData[`${tile.lx},${tile.ly}`];
                                if (data) {
                                    const color = colors[data.element] || '#000';
                                    let phase = 'Early';
                                    if (data.growth >= 100) phase = 'Peak';
                                    else if (data.growth >= 75) phase = 'Ripe';
                                    else if (data.growth >= 50) phase = 'Mature';
                                    else if (data.growth >= 25) phase = 'Adult';
                                    
                                    this.ui.herbPanel.innerHTML = `
                                        <div class="iso-herb-details">
                                            <div class="herb-title">
                                                ${data.age} ${data.rank} ${data.name}. 
                                                <span class="herb-elem" style="color:${color}">^${data.element}</span>
                                            </div>
                                            <div class="herb-lore">${data.lore}</div>
                                            <div class="growth-wrap">
                                                <div class="growth-txt">${phase}</div>
                                                <div class="growth-track">
                                                    <div class="growth-stick" style="left: ${data.growth}%"></div>
                                                </div>
                                            </div>
                                            <div class="iso-actions">
                                                <button id="btn-harvest" class="iso-btn-action btn-harvest">Harvest</button>
                                                <button id="btn-feed" class="iso-btn-action btn-feed">Feed</button>
                                            </div>
                                        </div>
                                    `;
                                    
                                    let currentAction = null;
                                    const btnH = document.getElementById('btn-harvest');
                                    const btnF = document.getElementById('btn-feed');
                                    
                                    const setHerbAction = (action, btn) => {
                                        if (currentAction === action) {
                                            // Deselect
                                            currentAction = null;
                                            btnH.classList.remove('active', 'disabled');
                                            btnF.classList.remove('active', 'disabled');
                                            this.ui.popup.classList.remove('visible');
                                        } else {
                                            // Select
                                            currentAction = action;
                                            btnH.classList.remove('active', 'disabled');
                                            btnF.classList.remove('active', 'disabled');
                                            
                                            btn.classList.add('active');
                                            if (btn === btnH) btnF.classList.add('disabled');
                                            else btnH.classList.add('disabled');

                                            const txt = `Herb at ${tile.lx},${tile.ly} named ${data.name} chosen to ${action}`;
                                            this.ui.popupText.textContent = txt;
                                            this.ui.popup.classList.add('visible');
                                        }
                                    };
                                    btnH.onclick = () => setHerbAction('Harvest', btnH);
                                    btnF.onclick = () => setHerbAction('Feed', btnF);
                                }
                            }
                            // TREE UI
                            else if (tile.assetType === 'T') {
                                const data = this.treeData[`${tile.lx},${tile.ly}`];
                                if (data) {
                                    const color = colors[data.element] || '#000';
                                    
                                    this.ui.herbPanel.innerHTML = `
                                        <div class="iso-herb-details">
                                            <div class="herb-title">
                                                ${data.age} <span style="color:${color}">${data.element}</span> ${data.name}
                                            </div>
                                            <div class="herb-lore">${data.lore}</div>
                                            
                                            <div class="iso-tree-grid">
                                                <button class="iso-btn-stone" data-act="Extract">Extract</button>
                                                <button class="iso-btn-stone" data-act="Cut">Cut</button>
                                                <button class="iso-btn-stone" data-act="Search">Search</button>
                                                <button class="iso-btn-stone" data-act="Examine">Examine</button>
                                                <button class="iso-btn-stone wide" data-act="Ascend">Ascend</button>
                                            </div>
                                        </div>
                                    `;

                                    const btns = this.ui.herbPanel.querySelectorAll('.iso-btn-stone');
                                    let currentAction = null;

                                    btns.forEach(btn => {
                                        btn.onclick = () => {
                                            const action = btn.getAttribute('data-act');
                                            
                                            if (currentAction === action) {
                                                // Deselect
                                                currentAction = null;
                                                btns.forEach(b => b.classList.remove('active', 'disabled'));
                                                this.ui.popup.classList.remove('visible');
                                            } else {
                                                // Select
                                                currentAction = action;
                                                btns.forEach(b => {
                                                    if (b === btn) {
                                                        b.classList.add('active');
                                                        b.classList.remove('disabled');
                                                    } else {
                                                        b.classList.remove('active');
                                                        b.classList.add('disabled');
                                                    }
                                                });
                                                
                                                const txt = `Tree at ${tile.lx},${tile.ly} named ${data.name} chosen to ${action}`;
                                                this.ui.popupText.textContent = txt;
                                                this.ui.popup.classList.add('visible');
                                            }
                                        };
                                    });
                                }
                            }

                            this.ui.herbPanel.classList.add('visible');
                        }
                    }
                    return;                }
                
                this.player.targetNode = this.player.pathQueue[0];
                this.player.startNode = { lx: this.player.visualLx, ly: this.player.visualLy };
                this.player.animTimer = timestamp;
                this.player.animState = 'MOVING';
            }

            // 3. Moving Phase (Interpolation)
            if (this.player.animState === 'MOVING') {
                const elapsed = timestamp - this.player.animTimer;
                const duration = CONFIG.ANIMATION.MOVE_DURATION;
                
                let progress = Math.min(elapsed / duration, 1.0);
                
                // Ease-in-out formula for smoother quality
                // p < 0.5 ? 2*p*p : -1+(4-2*p)*p
                const ease = progress < 0.5 
                    ? 2 * progress * progress 
                    : -1 + (4 - 2 * progress) * progress;
                
                const start = this.player.startNode;
                const end = this.player.targetNode;
                
                this.player.visualLx = start.lx + (end.lx - start.lx) * ease;
                this.player.visualLy = start.ly + (end.ly - start.ly) * ease;

                if (progress >= 1.0) {
                    // Arrived
                    this.player.visualLx = end.lx;
                    this.player.visualLy = end.ly;
                    this.player.pathQueue.shift();
                    this.player.animTimer = timestamp;
                    this.player.animState = 'PAUSED';
                }
            }

            // 4. Pause Phase (Stop per tile)
            if (this.player.animState === 'PAUSED') {
                if (timestamp - this.player.animTimer > CONFIG.ANIMATION.STEP_DELAY) {
                    this.player.animState = 'PREPARE_STEP';
                }
            }
        }

        render(timestamp) {
            this.updateAnimation(timestamp);
            
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Sort tiles for painters algorithm
            const sortedTiles = Object.values(this.chunks).sort((a, b) => {
                return (a.gx + a.gy) - (b.gx + b.gy);
            });
            
            sortedTiles.forEach(tile => this.drawTile(tile, timestamp));
            this.drawPlayer();
        }

        loop(timestamp) {
            if (!this.active) return;
            this.render(timestamp);
            requestAnimationFrame((ts) => this.loop(ts));
        }

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